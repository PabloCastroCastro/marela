import { z } from '@hono/zod-openapi'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import {
  almacenes,
  animales,
  facturas,
  facturasAnimales,
  facturasMovimientosComida,
  IMPUESTOS_FACTURA,
  LINEAS_FACTURA_MAXIMO,
  movimientosComida,
  type ORIGENES_ENTRADA,
  TIPOS_FACTURA,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { nifValido, normalizarNif } from './nif.js'

// Facturas (GH-35), solo para el administrador (módulo finanzas): recibidas (gastos) y emitidas
// (ingresos), con una línea por tipo de IVA o de compensación del REAGP. Se corrigen y se borran; los
// cambios quedan en el historial. Como en tareas.ts, las funciones reciben la transacción de
// enLaExplotacion; el archivo adjunto se guarda fuera de ella (src/archivos.ts).

// Los importes, en céntimos para sumarlos sin errores de redondeo
const centimos = (euros: number) => Math.round(euros * 100)
const euros = (centimos: number) => centimos / 100

const importe = (mensaje: string) =>
  z
    .number(mensaje)
    .min(-9_999_999_999.99, 'Importe demasiado grande')
    .max(9_999_999_999.99, 'Importe demasiado grande')
    .transform((n) => euros(centimos(n)))

// Lo que debe salir la cuota: el porcentaje de la base, redondeado al céntimo
export const cuotaDe = (base: number, porcentaje: number) =>
  euros(Math.round((centimos(base) * porcentaje) / 100))

const Linea = z.object({
  base: importe('Indica la base imponible').openapi({ example: 1000 }),
  porcentaje: z
    .number('Indica el porcentaje')
    .min(0, 'No puede ser negativo')
    .max(100, 'Como mucho 100 %')
    .transform((n) => Math.round(n * 100) / 100)
    .openapi({ example: 21 }),
  cuota: importe('Indica la cuota').openapi({ example: 210 }),
})

const texto = (mensaje: string, maximo: number) =>
  z.string(mensaje).trim().min(1, mensaje).max(maximo, `Como mucho ${maximo} caracteres`)

export const DatosFactura = z
  .object({
    tipo: z.enum(TIPOS_FACTURA, 'Indica si es recibida o emitida'),
    numero: texto('Indica el número', 40).openapi({ example: '2026-0007' }),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    tercero: texto('Indica el proveedor o el cliente', 120),
    nif: texto('Indica el NIF', 20).transform(normalizarNif).openapi({ example: 'B15000007' }),
    nifExtranjero: z.boolean().default(false).openapi({
      description: 'NIF de otro país: no se comprueba el formato español',
    }),
    concepto: texto('Indica el concepto', 500),
    impuesto: z.enum(IMPUESTOS_FACTURA).default('iva').openapi({
      description: 'IVA o compensación del REAGP (en las ventas de quien está en ese régimen)',
    }),
    lineas: z
      .array(Linea)
      .min(1, 'Indica al menos una línea')
      .max(LINEAS_FACTURA_MAXIMO, `Como mucho ${LINEAS_FACTURA_MAXIMO} líneas`),
    total: importe('Indica el total').openapi({ example: 1210 }),
    pagadaEn: z.iso.date('Fecha no válida (aaaa-mm-dd)').nullish().openapi({
      description: 'Fecha de pago; sin ella, la factura está pendiente',
    }),
    animalIds: z.array(z.uuid()).max(500).default([]).openapi({
      description: 'Animales comprados con la factura; solo en las recibidas',
    }),
  })
  // Que el NIF sea válido y que los importes cuadren
  .superRefine((d, ctx) => {
    if (!d.nifExtranjero && !nifValido(d.nif)) {
      ctx.addIssue({
        code: 'custom',
        path: ['nif'],
        message: 'El NIF no es válido; si es de otro país, marca «NIF extranjero»',
      })
    }
    d.lineas.forEach((l, i) => {
      // Un céntimo de margen, por cómo redondee cada proveedor
      if (Math.abs(centimos(l.cuota) - centimos(cuotaDe(l.base, l.porcentaje))) > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['lineas', i, 'cuota'],
          message: `La cuota no cuadra: el ${l.porcentaje} % de la base es ${cuotaDe(l.base, l.porcentaje)}`,
        })
      }
    })
    const suma = d.lineas.reduce((s, l) => s + centimos(l.base) + centimos(l.cuota), 0)
    if (centimos(d.total) !== suma) {
      ctx.addIssue({
        code: 'custom',
        path: ['total'],
        message: `El total no cuadra con las líneas: debería ser ${euros(suma)}`,
      })
    }
    if (d.tipo === 'emitida' && d.animalIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['animalIds'],
        message: 'Solo las facturas recibidas tienen animales enlazados',
      })
    }
  })
  .openapi('DatosFactura')

export type DatosFactura = z.output<typeof DatosFactura>

export const CambioPago = z
  .object({
    pagadaEn: z.iso.date('Fecha no válida (aaaa-mm-dd)').nullable().openapi({
      description: 'Fecha de pago; null para dejarla pendiente',
    }),
  })
  .openapi('CambioPago')

const columnas = {
  id: facturas.id,
  tipo: facturas.tipo,
  numero: facturas.numero,
  fecha: facturas.fecha,
  tercero: facturas.tercero,
  nif: facturas.nif,
  nifExtranjero: facturas.nifExtranjero,
  concepto: facturas.concepto,
  impuesto: facturas.impuesto,
  lineas: facturas.lineas,
  baseImponible: facturas.baseImponible,
  cuota: facturas.cuota,
  total: facturas.total,
  pagadaEn: facturas.pagadaEn,
  archivoRuta: facturas.archivoRuta,
  archivoNombre: facturas.archivoNombre,
  archivoTipo: facturas.archivoTipo,
  archivoTamano: facturas.archivoTamano,
  // La venta de una emitida (GH-38), si la tiene
  ventaId: sql<string | null>`(select v.id from ventas v where v.factura_id = "facturas"."id")`,
  creadoEn: facturas.creadoEn,
  modificadoEn: facturas.modificadoEn,
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]
type AnimalFactura = { id: string; crotal: string | null; nombre: string | null }
type EntradaFactura = Awaited<ReturnType<typeof consultaEntradas>>[number]

const consulta = (tx: Transaccion) => tx.select(columnas).from(facturas)

// Los animales de cada factura
async function animalesDe(tx: Transaccion, facturaIds: string[]) {
  const porFactura = new Map<string, AnimalFactura[]>()
  if (facturaIds.length === 0) return porFactura
  const filas = await tx
    .select({
      facturaId: facturasAnimales.facturaId,
      id: animales.id,
      crotal: animales.crotal,
      nombre: animales.nombre,
    })
    .from(facturasAnimales)
    .innerJoin(animales, eq(animales.id, facturasAnimales.animalId))
    .where(inArray(facturasAnimales.facturaId, facturaIds))
    .orderBy(asc(animales.crotal))
  for (const { facturaId, ...animal } of filas) {
    porFactura.set(facturaId, [...(porFactura.get(facturaId) ?? []), animal])
  }
  return porFactura
}

// Las entradas de comida (GH-36), con su almacén y su factura
const consultaEntradas = (tx: Transaccion) =>
  tx
    .select({
      id: movimientosComida.id,
      fecha: movimientosComida.fecha,
      cantidad: movimientosComida.cantidad,
      origen: movimientosComida.origen,
      observaciones: movimientosComida.observaciones,
      almacen: {
        id: almacenes.id,
        nombre: almacenes.nombre,
        unidad: almacenes.unidad,
      },
      facturaId: facturasMovimientosComida.facturaId,
      facturaNumero: facturas.numero,
      facturaTercero: facturas.tercero,
    })
    .from(movimientosComida)
    .innerJoin(almacenes, eq(almacenes.id, movimientosComida.almacenId))
    .leftJoin(
      facturasMovimientosComida,
      eq(facturasMovimientosComida.movimientoId, movimientosComida.id),
    )
    .leftJoin(facturas, eq(facturas.id, facturasMovimientosComida.facturaId))
    // Cada uso pone su where, siempre con tipo = 'entrada'
    .$dynamic()

const entrada = ({ facturaId, facturaNumero, facturaTercero, ...e }: EntradaFactura) => ({
  ...e,
  factura:
    facturaId && facturaNumero && facturaTercero
      ? { id: facturaId, numero: facturaNumero, tercero: facturaTercero }
      : null,
})

// Las entradas de comida de cada factura, de la más reciente a la más antigua
async function entradasDe(tx: Transaccion, facturaIds: string[]) {
  const porFactura = new Map<string, ReturnType<typeof entrada>[]>()
  if (facturaIds.length === 0) return porFactura
  const filas = await consultaEntradas(tx)
    .where(
      and(
        eq(movimientosComida.tipo, 'entrada'),
        inArray(facturasMovimientosComida.facturaId, facturaIds),
      ),
    )
    .orderBy(desc(movimientosComida.fecha), desc(movimientosComida.creadoEn))
  for (const fila of filas) {
    const e = entrada(fila)
    if (e.factura) porFactura.set(e.factura.id, [...(porFactura.get(e.factura.id) ?? []), e])
  }
  return porFactura
}

// Los animales y las entradas de comida de cada factura
async function enlacesDe(tx: Transaccion, facturaIds: string[]) {
  const [deAnimales, deEntradas] = [
    await animalesDe(tx, facturaIds),
    await entradasDe(tx, facturaIds),
  ]
  return (id: string) => ({
    animales: deAnimales.get(id) ?? [],
    entradasComida: (deEntradas.get(id) ?? []).map(({ factura: _, ...e }) => e),
  })
}

// El archivo, sin la ruta interna; las fechas, como texto
const factura = (
  { archivoRuta, archivoNombre, archivoTipo, archivoTamano, ...f }: Fila,
  enlaces: {
    animales: AnimalFactura[]
    entradasComida: Omit<ReturnType<typeof entrada>, 'factura'>[]
  },
) => ({
  ...f,
  lineas: f.lineas.map((l) => ({ base: l.base, porcentaje: l.porcentaje, cuota: l.cuota })),
  archivo:
    archivoRuta && archivoNombre && archivoTipo && archivoTamano !== null
      ? { nombre: archivoNombre, tipo: archivoTipo, tamano: archivoTamano }
      : null,
  ...enlaces,
  creadoEn: f.creadoEn.toISOString(),
  modificadoEn: f.modificadoEn.toISOString(),
})

export type FiltrosFacturas = {
  tipo?: (typeof TIPOS_FACTURA)[number]
  estado?: 'pendiente' | 'pagada'
  desde?: string
  hasta?: string
  // Por proveedor o cliente, número o NIF
  q?: string
}

// De la más reciente a la más antigua
export async function listarFacturas(tx: Transaccion, filtros: FiltrosFacturas) {
  const condiciones: (SQL | undefined)[] = []
  if (filtros.tipo) condiciones.push(eq(facturas.tipo, filtros.tipo))
  if (filtros.estado === 'pendiente') condiciones.push(isNull(facturas.pagadaEn))
  if (filtros.estado === 'pagada') condiciones.push(isNotNull(facturas.pagadaEn))
  if (filtros.desde) condiciones.push(gte(facturas.fecha, filtros.desde))
  if (filtros.hasta) condiciones.push(lte(facturas.fecha, filtros.hasta))
  const q = filtros.q?.trim()
  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    condiciones.push(
      or(
        ilike(facturas.tercero, patron),
        ilike(facturas.numero, patron),
        ilike(facturas.nif, normalizarNif(patron)),
      ),
    )
  }
  const filas = await consulta(tx)
    .where(and(...condiciones))
    .orderBy(desc(facturas.fecha), desc(facturas.creadoEn))
  const enlaces = await enlacesDe(
    tx,
    filas.map((f) => f.id),
  )
  return filas.map((f) => factura(f, enlaces(f.id)))
}

async function filaFactura(tx: Transaccion, facturaId: string) {
  const [fila] = await consulta(tx).where(eq(facturas.id, facturaId))
  if (!fila)
    throw new ErrorApi(404, 'factura_no_encontrada', 'No existe la factura en esta explotación')
  return fila
}

export async function verFactura(tx: Transaccion, facturaId: string) {
  const fila = await filaFactura(tx, facturaId)
  return factura(fila, (await enlacesDe(tx, [facturaId]))(facturaId))
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// Traduce los errores de la base de datos que puede provocar el usuario
async function conErroresClaros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
    if (causa?.code === '23505' && causa.constraint === 'facturas_emitidas_numero_unico') {
      const mensaje = 'Ya hay una factura emitida con este número'
      throw new ErrorApi(409, 'numero_en_uso', mensaje, [{ campo: 'numero', mensaje }])
    }
    if (causa?.code === '23505' && causa.constraint === 'facturas_recibidas_numero_unico') {
      const mensaje = 'Ya está registrada una factura de este proveedor con este número'
      throw new ErrorApi(409, 'numero_en_uso', mensaje, [{ campo: 'numero', mensaje }])
    }
    throw error
  }
}

// Los animales, de la explotación. La base de datos lo comprueba también; aquí se hace antes para
// dar el error en su campo.
async function comprobarAnimales(tx: Transaccion, animalIds: string[]) {
  const ids = [...new Set(animalIds)]
  if (ids.length === 0) return ids
  const encontrados = await tx
    .select({ id: animales.id })
    .from(animales)
    .where(inArray(animales.id, ids))
  if (encontrados.length !== ids.length)
    throw invalido('animalIds', 'Algún animal no está entre los de la explotación')
  return ids
}

const valores = (d: DatosFactura) => {
  const base = d.lineas.reduce((s, l) => s + centimos(l.base), 0)
  const cuota = d.lineas.reduce((s, l) => s + centimos(l.cuota), 0)
  return {
    tipo: d.tipo,
    numero: d.numero,
    fecha: d.fecha,
    tercero: d.tercero,
    nif: d.nif,
    nifExtranjero: d.nifExtranjero,
    concepto: d.concepto,
    impuesto: d.impuesto,
    lineas: d.lineas,
    baseImponible: euros(base),
    cuota: euros(cuota),
    total: euros(base + cuota),
    pagadaEn: d.pagadaEn ?? null,
  }
}

async function enlazarAnimales(tx: Transaccion, facturaId: string, animalIds: string[]) {
  await tx.delete(facturasAnimales).where(eq(facturasAnimales.facturaId, facturaId))
  if (animalIds.length > 0)
    await tx.insert(facturasAnimales).values(animalIds.map((animalId) => ({ facturaId, animalId })))
}

export async function crearFactura(tx: Transaccion, datos: DatosFactura) {
  const animalIds = await comprobarAnimales(tx, datos.animalIds)
  const [creada] = await conErroresClaros(() =>
    tx.insert(facturas).values(valores(datos)).returning({ id: facturas.id }),
  )
  if (!creada) throw new Error('No se pudo crear la factura')
  await enlazarAnimales(tx, creada.id, animalIds)
  return verFactura(tx, creada.id)
}

export async function corregirFactura(tx: Transaccion, facturaId: string, datos: DatosFactura) {
  const actual = await verFactura(tx, facturaId)
  if (datos.tipo !== 'recibida' && actual.entradasComida.length > 0)
    throw invalido('tipo', 'Tiene entradas de comida: quítalas antes de cambiarla a emitida')
  const animalIds = await comprobarAnimales(tx, datos.animalIds)
  // Primero los animales, por si deja de ser recibida
  await enlazarAnimales(tx, facturaId, [])
  await conErroresClaros(() =>
    tx.update(facturas).set(valores(datos)).where(eq(facturas.id, facturaId)),
  )
  await enlazarAnimales(tx, facturaId, animalIds)
  return verFactura(tx, facturaId)
}

// Pagada en una fecha o, si se marcó por error, otra vez pendiente
export async function cambiarPago(tx: Transaccion, facturaId: string, pagadaEn: string | null) {
  await filaFactura(tx, facturaId)
  await tx.update(facturas).set({ pagadaEn }).where(eq(facturas.id, facturaId))
  return verFactura(tx, facturaId)
}

// Borra la factura con sus enlaces a los animales. Devuelve la ruta de su archivo, para borrarlo
// cuando se confirme la transacción. Queda en el historial.
export async function borrarFactura(tx: Transaccion, facturaId: string) {
  const { archivoRuta } = await filaFactura(tx, facturaId)
  await tx.delete(facturas).where(eq(facturas.id, facturaId))
  return archivoRuta
}

// El siguiente número de las emitidas en el año de la fecha: 2026-0007 tras la 2026-0006. Solo
// cuentan los números con ese formato; si se usa otro, se propone el primero del año.
export async function siguienteNumero(tx: Transaccion, anio: number) {
  const [fila] = await tx
    .select({
      ultimo: sql<
        number | null
      >`max(substring(${facturas.numero} from '^[0-9]{4}-([0-9]+)$')::int)`,
    })
    .from(facturas)
    .where(and(eq(facturas.tipo, 'emitida'), sql`${facturas.numero} ~ ${`^${anio}-[0-9]+$`}`))
  return `${anio}-${String((fila?.ultimo ?? 0) + 1).padStart(4, '0')}`
}

export type ArchivoGuardado = { ruta: string; nombre: string; tipo: string; tamano: number }

// Pone (o cambia) el archivo de la factura y devuelve la ruta del anterior, para borrarlo cuando se
// confirme la transacción
export async function ponerArchivo(
  tx: Transaccion,
  facturaId: string,
  archivo: ArchivoGuardado | null,
) {
  const { archivoRuta } = await filaFactura(tx, facturaId)
  await tx
    .update(facturas)
    .set({
      archivoRuta: archivo?.ruta ?? null,
      archivoNombre: archivo?.nombre ?? null,
      archivoTipo: archivo?.tipo ?? null,
      archivoTamano: archivo?.tamano ?? null,
    })
    .where(eq(facturas.id, facturaId))
  return { anterior: archivoRuta, factura: await verFactura(tx, facturaId) }
}

export async function archivoDe(tx: Transaccion, facturaId: string) {
  const f = await filaFactura(tx, facturaId)
  if (!f.archivoRuta || !f.archivoTipo)
    throw new ErrorApi(404, 'archivo_no_encontrado', 'La factura no tiene archivo')
  return { ruta: f.archivoRuta, nombre: f.archivoNombre ?? 'factura', tipo: f.archivoTipo }
}

// Las entradas de comida (GH-36) de todos los almacenes, de la más reciente a la más antigua, con su
// factura. Para elegir las de una factura: las compras sin factura.
export type FiltrosEntradasComida = {
  origen?: (typeof ORIGENES_ENTRADA)[number]
  factura?: 'con' | 'sin'
  almacenId?: string
  desde?: string
  hasta?: string
}

export async function listarEntradasComida(tx: Transaccion, filtros: FiltrosEntradasComida) {
  const filas = await consultaEntradas(tx)
    .where(
      and(
        eq(movimientosComida.tipo, 'entrada'),
        filtros.origen ? eq(movimientosComida.origen, filtros.origen) : undefined,
        filtros.factura === 'con' ? isNotNull(facturasMovimientosComida.facturaId) : undefined,
        filtros.factura === 'sin' ? isNull(facturasMovimientosComida.facturaId) : undefined,
        filtros.almacenId ? eq(movimientosComida.almacenId, filtros.almacenId) : undefined,
        filtros.desde ? gte(movimientosComida.fecha, filtros.desde) : undefined,
        filtros.hasta ? lte(movimientosComida.fecha, filtros.hasta) : undefined,
      ),
    )
    .orderBy(desc(movimientosComida.fecha), desc(movimientosComida.creadoEn))
  return filas.map(entrada)
}

// Asocia a una factura recibida sus entradas de comida compradas (GH-36): las que se indican, en lugar
// de las que tuviera. Una entrada que ya tiene otra factura no se cambia de factura sin quitarla antes.
export async function asociarEntradas(tx: Transaccion, facturaId: string, movimientoIds: string[]) {
  const actual = await filaFactura(tx, facturaId)
  if (actual.tipo !== 'recibida')
    throw invalido('movimientoIds', 'Solo las facturas recibidas tienen entradas de comida')
  const ids = [...new Set(movimientoIds)]
  if (ids.length > 0) {
    const encontradas = (
      await consultaEntradas(tx).where(
        and(eq(movimientosComida.tipo, 'entrada'), inArray(movimientosComida.id, ids)),
      )
    ).map(entrada)
    if (encontradas.length !== ids.length || encontradas.some((e) => e.origen !== 'compra'))
      throw invalido('movimientoIds', 'Solo se asocian entradas de comida compradas')
    const deOtra = encontradas.find((e) => e.factura && e.factura.id !== facturaId)
    if (deOtra?.factura) {
      const mensaje = `La entrada del ${deOtra.fecha} en ${deOtra.almacen.nombre} ya es de la factura ${deOtra.factura.numero}`
      throw new ErrorApi(409, 'entrada_con_factura', mensaje, [{ campo: 'movimientoIds', mensaje }])
    }
  }
  await tx
    .delete(facturasMovimientosComida)
    .where(eq(facturasMovimientosComida.facturaId, facturaId))
  if (ids.length > 0)
    await tx
      .insert(facturasMovimientosComida)
      .values(ids.map((movimientoId) => ({ facturaId, movimientoId })))
  return verFactura(tx, facturaId)
}
