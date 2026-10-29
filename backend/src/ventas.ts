import { z } from '@hono/zod-openapi'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  max,
  type SQL,
} from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import {
  animales,
  facturas,
  KG_MAXIMO,
  MODOS_PRECIO,
  pesos,
  tratamientos,
  ventas,
  ventasAnimales,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'

// Ventas de animales (GH-38), solo para el administrador (módulo finanzas). Al registrar la venta,
// en la misma transacción, los animales pasan a vendidos (baja por venta) y su pesada de venta queda
// en la ficha. Se corrige deshaciéndola y registrándola de nuevo, y se deshace entera: los animales
// vuelven a estar activos. No se vende un animal con un periodo de supresión en curso, sin
// excepciones. Como facturas.ts, las funciones reciben la transacción de enLaExplotacion.

const AnimalVendido = z.object({
  animalId: z.uuid('Elige el animal'),
  kg: z
    .number('Peso no válido')
    .positive('El peso tiene que ser mayor que 0')
    .max(KG_MAXIMO, `Como mucho ${KG_MAXIMO} kg`)
    .transform((n) => Math.round(n * 10) / 10)
    .nullish()
    .openapi({ description: 'Peso a la venta; queda como pesada de venta en su ficha' }),
})

export const DatosVenta = z
  .object({
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    comprador: z
      .string('Indica el comprador')
      .trim()
      .min(1, 'Indica el comprador')
      .max(120, 'Como mucho 120 caracteres'),
    animales: z
      .array(AnimalVendido)
      .min(1, 'Elige al menos un animal')
      .max(500, 'Como mucho 500 animales'),
    modoPrecio: z.enum(MODOS_PRECIO).openapi({
      description: 'Si el precio es el total, el de cada animal o el del kg',
    }),
    precio: z
      .number('Indica el precio')
      .positive('El precio tiene que ser mayor que 0')
      .max(9_999_999_999, 'Precio demasiado grande')
      .transform((n) => Math.round(n * 1000) / 1000)
      .openapi({ description: 'Sin IVA ni compensación', example: 4.35 }),
    facturaId: z.uuid().nullish().openapi({ description: 'Una factura emitida, si ya la hay' }),
    observaciones: z
      .string()
      .trim()
      .max(1000, 'Como mucho 1000 caracteres')
      .transform((t) => t || null)
      .nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.fecha > hoyEnMadrid())
      ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'La fecha no puede ser futura' })
    const vistos = new Set<string>()
    v.animales.forEach((a, i) => {
      if (vistos.has(a.animalId))
        ctx.addIssue({
          code: 'custom',
          path: ['animales', i, 'animalId'],
          message: 'Está repetido',
        })
      vistos.add(a.animalId)
      // Por kg, todos pesados
      if (v.modoPrecio === 'por_kg' && !a.kg)
        ctx.addIssue({
          code: 'custom',
          path: ['animales', i, 'kg'],
          message: 'Con el precio por kg, indica el peso de cada animal',
        })
    })
  })
  .openapi('DatosVenta')

export type DatosVenta = z.output<typeof DatosVenta>

export const CambioFacturaVenta = z
  .object({ facturaId: z.uuid().nullable().openapi({ description: 'null para quitarla' }) })
  .openapi('CambioFacturaVenta')

// Los importes de cada animal y el total, en céntimos para que cuadren. Con el total, se reparte a
// partes iguales (los céntimos que sobran, a los primeros); por animal, el mismo a cada uno; por kg,
// su peso por el precio.
export function calcularImportes(
  modo: (typeof MODOS_PRECIO)[number],
  precio: number,
  kgs: (number | null | undefined)[],
) {
  let centimos: number[]
  if (modo === 'total') {
    const total = Math.round(precio * 100)
    const parte = Math.floor(total / kgs.length)
    const resto = total - parte * kgs.length
    centimos = kgs.map((_, i) => parte + (i < resto ? 1 : 0))
  } else if (modo === 'por_animal') {
    centimos = kgs.map(() => Math.round(precio * 100))
  } else {
    centimos = kgs.map((kg) => Math.round((kg ?? 0) * precio * 100))
  }
  return {
    importes: centimos.map((c) => c / 100),
    total: centimos.reduce((s, c) => s + c, 0) / 100,
  }
}

const fechaEs = (f: string) => f.split('-').reverse().join('/')
const nombreAnimal = (a: { crotal: string | null; nombre: string | null }) =>
  a.nombre ? `${a.nombre} (${a.crotal ?? 'sin crotal'})` : (a.crotal ?? 'sin crotal')

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

const columnasVenta = {
  id: ventas.id,
  fecha: ventas.fecha,
  comprador: ventas.comprador,
  modoPrecio: ventas.modoPrecio,
  precio: ventas.precio,
  total: ventas.total,
  observaciones: ventas.observaciones,
  facturaId: facturas.id,
  facturaNumero: facturas.numero,
  facturaTotal: facturas.total,
  creadoEn: ventas.creadoEn,
  modificadoEn: ventas.modificadoEn,
}

const consulta = (tx: Transaccion) =>
  tx.select(columnasVenta).from(ventas).leftJoin(facturas, eq(facturas.id, ventas.facturaId))

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// Los animales de cada venta, con su peso y su importe
async function animalesDe(tx: Transaccion, ventaIds: string[]) {
  const porVenta = new Map<
    string,
    {
      id: string
      crotal: string | null
      nombre: string | null
      kg: number | null
      importe: number
    }[]
  >()
  if (ventaIds.length === 0) return porVenta
  const filas = await tx
    .select({
      ventaId: ventasAnimales.ventaId,
      id: animales.id,
      crotal: animales.crotal,
      nombre: animales.nombre,
      kg: ventasAnimales.kg,
      importe: ventasAnimales.importe,
    })
    .from(ventasAnimales)
    .innerJoin(animales, eq(animales.id, ventasAnimales.animalId))
    .where(inArray(ventasAnimales.ventaId, ventaIds))
    .orderBy(asc(ventasAnimales.creadoEn), asc(ventasAnimales.id))
  for (const { ventaId, ...a } of filas)
    porVenta.set(ventaId, [...(porVenta.get(ventaId) ?? []), a])
  return porVenta
}

const venta = (
  { facturaId, facturaNumero, facturaTotal, ...v }: Fila,
  vendidos: Awaited<ReturnType<typeof animalesDe>> extends Map<string, infer T> ? T : never,
) => ({
  ...v,
  animales: vendidos,
  kg: vendidos.every((a) => a.kg !== null)
    ? Math.round(vendidos.reduce((s, a) => s + (a.kg ?? 0), 0) * 10) / 10
    : null,
  factura:
    facturaId && facturaNumero && facturaTotal !== null
      ? { id: facturaId, numero: facturaNumero, total: facturaTotal }
      : null,
  creadoEn: v.creadoEn.toISOString(),
  modificadoEn: v.modificadoEn.toISOString(),
})

export type FiltrosVentas = {
  desde?: string
  hasta?: string
  factura?: 'con' | 'sin'
  // Por comprador
  q?: string
}

// De la más reciente a la más antigua
export async function listarVentas(tx: Transaccion, filtros: FiltrosVentas) {
  const condiciones: (SQL | undefined)[] = []
  if (filtros.desde) condiciones.push(gte(ventas.fecha, filtros.desde))
  if (filtros.hasta) condiciones.push(lte(ventas.fecha, filtros.hasta))
  if (filtros.factura === 'con') condiciones.push(isNotNull(ventas.facturaId))
  if (filtros.factura === 'sin') condiciones.push(isNull(ventas.facturaId))
  const q = filtros.q?.trim()
  if (q) condiciones.push(ilike(ventas.comprador, `%${q.replace(/[\\%_]/g, '\\$&')}%`))
  const filas = await consulta(tx)
    .where(and(...condiciones))
    .orderBy(desc(ventas.fecha), desc(ventas.creadoEn))
  const deCada = await animalesDe(
    tx,
    filas.map((v) => v.id),
  )
  return filas.map((v) => venta(v, deCada.get(v.id) ?? []))
}

async function filaVenta(tx: Transaccion, ventaId: string) {
  const [fila] = await consulta(tx).where(eq(ventas.id, ventaId))
  if (!fila)
    throw new ErrorApi(404, 'venta_no_encontrada', 'No existe la venta en esta explotación')
  return fila
}

export async function verVenta(tx: Transaccion, ventaId: string) {
  const fila = await filaVenta(tx, ventaId)
  return venta(fila, (await animalesDe(tx, [ventaId])).get(ventaId) ?? [])
}

// La factura, emitida y sin otra venta. La base de datos lo comprueba también; aquí se da el error en
// su campo.
async function comprobarFactura(tx: Transaccion, facturaId: string, ventaId?: string) {
  const [factura] = await tx
    .select({ tipo: facturas.tipo, numero: facturas.numero })
    .from(facturas)
    .where(eq(facturas.id, facturaId))
  if (!factura) throw invalido('facturaId', 'La factura no está entre las de la explotación')
  if (factura.tipo !== 'emitida') throw invalido('facturaId', 'La factura de una venta es emitida')
  const [otra] = await tx
    .select({ id: ventas.id })
    .from(ventas)
    .where(eq(ventas.facturaId, facturaId))
  if (otra && otra.id !== ventaId) {
    const mensaje = `La factura ${factura.numero} ya es de otra venta`
    throw new ErrorApi(409, 'factura_con_venta', mensaje, [{ campo: 'facturaId', mensaje }])
  }
}

// Comprueba los animales: de la explotación, activos, ya en la explotación en la fecha de la venta y
// sin un periodo de supresión en curso (sin excepciones). Devuelve sus datos, en el orden recibido.
async function comprobarAnimales(tx: Transaccion, datos: DatosVenta) {
  const ids = datos.animales.map((a) => a.animalId)
  const filas = await tx
    .select({
      id: animales.id,
      crotal: animales.crotal,
      nombre: animales.nombre,
      estado: animales.estado,
      desde: animales.fechaEntrada,
      nacimiento: animales.fechaNacimiento,
    })
    .from(animales)
    .where(inArray(animales.id, ids))
  const porId = new Map(filas.map((f) => [f.id, f]))
  const encontrados = datos.animales.map((a, i) => {
    const animal = porId.get(a.animalId)
    const campo = `animales.${i}.animalId`
    if (!animal) throw invalido(campo, 'El animal no está entre los de la explotación')
    if (animal.estado !== 'activo')
      throw invalido(campo, `${nombreAnimal(animal)} ya no está en la explotación`)
    if (datos.fecha < (animal.desde ?? animal.nacimiento))
      throw invalido(
        'fecha',
        `La fecha es anterior a la ${animal.desde ? 'entrada' : 'fecha de nacimiento'} de ${nombreAnimal(animal)}`,
      )
    return animal
  })

  // Supresión en curso en la fecha de la venta: un tratamiento sin anular que termina después
  const enSupresion = await tx
    .select({ animalId: tratamientos.animalId, hasta: max(tratamientos.finSupresion) })
    .from(tratamientos)
    .where(
      and(
        inArray(tratamientos.animalId, ids),
        isNull(tratamientos.anuladoEn),
        gt(tratamientos.finSupresion, datos.fecha),
      ),
    )
    .groupBy(tratamientos.animalId)
  if (enSupresion.length > 0) {
    const detalles = enSupresion.map((s) => {
      const i = ids.indexOf(s.animalId)
      const animal = porId.get(s.animalId)
      const mensaje = `${animal ? nombreAnimal(animal) : 'Un animal'} tiene la supresión hasta el ${fechaEs(s.hasta ?? '')}`
      return { campo: `animales.${i}.animalId`, mensaje, animalId: s.animalId, hasta: s.hasta }
    })
    throw new ErrorApi(
      409,
      'supresion_en_curso',
      `No se puede vender: ${detalles.map((d) => d.mensaje.charAt(0).toLowerCase() + d.mensaje.slice(1)).join('; ')}`,
      detalles,
    )
  }
  return encontrados
}

// Deshace lo que hizo la venta en los animales: sus pesadas de venta y la baja
async function soltarAnimales(tx: Transaccion, ventaId: string) {
  const vendidos = await tx
    .select({ animalId: ventasAnimales.animalId, pesoId: ventasAnimales.pesoId })
    .from(ventasAnimales)
    .where(eq(ventasAnimales.ventaId, ventaId))
  await tx.delete(ventasAnimales).where(eq(ventasAnimales.ventaId, ventaId))
  const pesoIds = vendidos.flatMap((v) => (v.pesoId ? [v.pesoId] : []))
  if (pesoIds.length > 0) await tx.delete(pesos).where(inArray(pesos.id, pesoIds))
  if (vendidos.length > 0)
    await tx
      .update(animales)
      .set({ estado: 'activo', tipoBaja: null, fechaBaja: null, causaBaja: null })
      .where(
        and(
          inArray(
            animales.id,
            vendidos.map((v) => v.animalId),
          ),
          eq(animales.tipoBaja, 'venta'),
        ),
      )
}

// Da de baja los animales, guarda sus pesadas de venta y lo que le corresponde a cada uno
async function venderAnimales(tx: Transaccion, ventaId: string, datos: DatosVenta) {
  const vendidos = await comprobarAnimales(tx, datos)
  const { importes } = calcularImportes(
    datos.modoPrecio,
    datos.precio,
    datos.animales.map((a) => a.kg),
  )
  for (const [i, a] of datos.animales.entries()) {
    let pesoId: string | null = null
    if (a.kg) {
      const [ya] = await tx
        .select({ id: pesos.id })
        .from(pesos)
        .where(and(eq(pesos.animalId, a.animalId), eq(pesos.momento, 'venta')))
      if (ya) {
        const animal = vendidos[i]
        throw invalido(
          `animales.${i}.kg`,
          `${animal ? nombreAnimal(animal) : 'El animal'} ya tiene una pesada de venta: corrígela en su ficha o deja el peso vacío`,
        )
      }
      const [peso] = await tx
        .insert(pesos)
        .values({ animalId: a.animalId, fecha: datos.fecha, kg: a.kg, momento: 'venta' })
        .returning({ id: pesos.id })
      pesoId = peso?.id ?? null
    }
    await tx.insert(ventasAnimales).values({
      ventaId,
      animalId: a.animalId,
      kg: a.kg ?? null,
      importe: importes[i] ?? 0,
      pesoId,
    })
  }
  await tx
    .update(animales)
    .set({
      estado: 'vendido',
      tipoBaja: 'venta',
      fechaBaja: datos.fecha,
      causaBaja: `Venta a ${datos.comprador}`,
    })
    .where(
      inArray(
        animales.id,
        datos.animales.map((a) => a.animalId),
      ),
    )
}

const valores = (d: DatosVenta) => ({
  fecha: d.fecha,
  comprador: d.comprador,
  modoPrecio: d.modoPrecio,
  precio: d.precio,
  total: calcularImportes(
    d.modoPrecio,
    d.precio,
    d.animales.map((a) => a.kg),
  ).total,
  facturaId: d.facturaId ?? null,
  observaciones: d.observaciones ?? null,
})

export async function registrarVenta(tx: Transaccion, datos: DatosVenta) {
  if (datos.facturaId) await comprobarFactura(tx, datos.facturaId)
  const v = valores(datos)
  if (v.total <= 0) throw invalido('precio', 'El total tiene que ser mayor que 0')
  const [creada] = await tx.insert(ventas).values(v).returning({ id: ventas.id })
  if (!creada) throw new Error('No se pudo registrar la venta')
  await venderAnimales(tx, creada.id, datos)
  return verVenta(tx, creada.id)
}

// Se deshace y se vuelve a registrar con los datos nuevos, en la misma transacción: así se pueden
// cambiar también los animales
export async function corregirVenta(tx: Transaccion, ventaId: string, datos: DatosVenta) {
  await filaVenta(tx, ventaId)
  if (datos.facturaId) await comprobarFactura(tx, datos.facturaId, ventaId)
  const v = valores(datos)
  if (v.total <= 0) throw invalido('precio', 'El total tiene que ser mayor que 0')
  await soltarAnimales(tx, ventaId)
  await tx.update(ventas).set(v).where(eq(ventas.id, ventaId))
  await venderAnimales(tx, ventaId, datos)
  return verVenta(tx, ventaId)
}

export async function cambiarFacturaVenta(
  tx: Transaccion,
  ventaId: string,
  facturaId: string | null,
) {
  await filaVenta(tx, ventaId)
  if (facturaId) await comprobarFactura(tx, facturaId, ventaId)
  await tx.update(ventas).set({ facturaId }).where(eq(ventas.id, ventaId))
  return verVenta(tx, ventaId)
}

// Deshace la venta: los animales vuelven a estar activos y se quitan sus pesadas de venta. La factura,
// si la tenía, se queda (se borra desde Facturas). Todo queda en el historial.
export async function deshacerVenta(tx: Transaccion, ventaId: string) {
  await filaVenta(tx, ventaId)
  await soltarAnimales(tx, ventaId)
  await tx.delete(ventas).where(eq(ventas.id, ventaId))
}
