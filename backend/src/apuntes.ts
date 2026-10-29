import { z } from '@hono/zod-openapi'
import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Transaccion } from './db/explotacion.js'
import {
  apuntes,
  CATEGORIAS_APUNTE,
  CATEGORIAS_INGRESO,
  TIPOS_APUNTE,
  user,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import type { ArchivoGuardado } from './facturas.js'

// Otros ingresos y gastos (GH-37), solo para el administrador (módulo finanzas): los movimientos sin
// factura (subvenciones de la PAC, seguros, tickets…). Se corrigen; uno registrado por error se anula
// con su motivo y sigue a la vista, sin contar en los totales. Como facturas.ts, las funciones reciben
// la transacción de enLaExplotacion; el archivo adjunto se guarda fuera de ella (src/archivos.ts).

const textoOpcional = z
  .string()
  .trim()
  .max(1000, 'Como mucho 1000 caracteres')
  .transform((t) => t || null)
  .nullish()

export const DatosApunte = z
  .object({
    tipo: z.enum(TIPOS_APUNTE, 'Indica si es un ingreso o un gasto'),
    categoria: z.enum(CATEGORIAS_APUNTE, 'Indica la categoría'),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    concepto: z
      .string('Indica el concepto')
      .trim()
      .min(1, 'Indica el concepto')
      .max(200, 'Como mucho 200 caracteres')
      .openapi({ example: 'Pago básico de la PAC 2026' }),
    importe: z
      .number('Indica el importe')
      .positive('El importe tiene que ser mayor que 0')
      .max(9_999_999_999.99, 'Importe demasiado grande')
      .transform((n) => Math.round(n * 100) / 100)
      .openapi({ example: 3250.4 }),
    observaciones: textoOpcional,
  })
  // La categoría, del tipo: una subvención es un ingreso; el combustible, un gasto
  .superRefine((d, ctx) => {
    const deIngreso = (CATEGORIAS_INGRESO as readonly string[]).includes(d.categoria)
    if (deIngreso !== (d.tipo === 'ingreso'))
      ctx.addIssue({
        code: 'custom',
        path: ['categoria'],
        message:
          d.tipo === 'ingreso' ? 'No es una categoría de ingreso' : 'No es una categoría de gasto',
      })
  })
  .openapi('DatosApunte')

export type DatosApunte = z.output<typeof DatosApunte>

export const DatosAnulacionApunte = z
  .object({
    motivo: z
      .string('Indica por qué se anula')
      .trim()
      .min(1, 'Indica por qué se anula')
      .max(500, 'Como mucho 500 caracteres'),
  })
  .openapi('DatosAnulacionApunte')

const anulador = alias(user, 'anulador')

const columnas = {
  id: apuntes.id,
  tipo: apuntes.tipo,
  categoria: apuntes.categoria,
  fecha: apuntes.fecha,
  concepto: apuntes.concepto,
  importe: apuntes.importe,
  observaciones: apuntes.observaciones,
  archivoRuta: apuntes.archivoRuta,
  archivoNombre: apuntes.archivoNombre,
  archivoTipo: apuntes.archivoTipo,
  archivoTamano: apuntes.archivoTamano,
  anuladoEn: apuntes.anuladoEn,
  anuladoPorNombre: anulador.name,
  motivoAnulacion: apuntes.motivoAnulacion,
  creadoEn: apuntes.creadoEn,
  modificadoEn: apuntes.modificadoEn,
}

const consulta = (tx: Transaccion) =>
  tx.select(columnas).from(apuntes).leftJoin(anulador, eq(anulador.id, apuntes.anuladoPor))

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// El archivo, sin la ruta interna, y la anulación como objeto
const apunte = ({
  archivoRuta,
  archivoNombre,
  archivoTipo,
  archivoTamano,
  anuladoEn,
  anuladoPorNombre,
  motivoAnulacion,
  ...a
}: Fila) => ({
  ...a,
  archivo:
    archivoRuta && archivoNombre && archivoTipo && archivoTamano !== null
      ? { nombre: archivoNombre, tipo: archivoTipo, tamano: archivoTamano }
      : null,
  anulacion: anuladoEn
    ? { en: anuladoEn.toISOString(), por: anuladoPorNombre ?? '', motivo: motivoAnulacion ?? '' }
    : null,
  creadoEn: a.creadoEn.toISOString(),
  modificadoEn: a.modificadoEn.toISOString(),
})

export type FiltrosApuntes = {
  tipo?: (typeof TIPOS_APUNTE)[number]
  categoria?: (typeof CATEGORIAS_APUNTE)[number]
  estado?: 'vigente' | 'anulado'
  desde?: string
  hasta?: string
  // Por concepto u observaciones
  q?: string
}

// Del más reciente al más antiguo, anulados incluidos salvo que se filtre
export async function listarApuntes(tx: Transaccion, filtros: FiltrosApuntes) {
  const condiciones: (SQL | undefined)[] = []
  if (filtros.tipo) condiciones.push(eq(apuntes.tipo, filtros.tipo))
  if (filtros.categoria) condiciones.push(eq(apuntes.categoria, filtros.categoria))
  if (filtros.estado === 'vigente') condiciones.push(isNull(apuntes.anuladoEn))
  if (filtros.estado === 'anulado') condiciones.push(isNotNull(apuntes.anuladoEn))
  if (filtros.desde) condiciones.push(gte(apuntes.fecha, filtros.desde))
  if (filtros.hasta) condiciones.push(lte(apuntes.fecha, filtros.hasta))
  const q = filtros.q?.trim()
  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    condiciones.push(or(ilike(apuntes.concepto, patron), ilike(apuntes.observaciones, patron)))
  }
  const filas = await consulta(tx)
    .where(and(...condiciones))
    .orderBy(desc(apuntes.fecha), desc(apuntes.creadoEn))
  return filas.map(apunte)
}

async function filaApunte(tx: Transaccion, apunteId: string) {
  const [fila] = await consulta(tx).where(eq(apuntes.id, apunteId))
  if (!fila)
    throw new ErrorApi(
      404,
      'apunte_no_encontrado',
      'No existe el ingreso o gasto en esta explotación',
    )
  return fila
}

export const verApunte = async (tx: Transaccion, apunteId: string) =>
  apunte(await filaApunte(tx, apunteId))

// Uno anulado ya no se cambia
async function vigente(tx: Transaccion, apunteId: string) {
  const fila = await filaApunte(tx, apunteId)
  if (fila.anuladoEn) throw new ErrorApi(409, 'ya_anulado', 'Está anulado: ya no se cambia')
  return fila
}

const valores = (d: DatosApunte) => ({
  tipo: d.tipo,
  categoria: d.categoria,
  fecha: d.fecha,
  concepto: d.concepto,
  importe: d.importe,
  observaciones: d.observaciones ?? null,
})

export async function crearApunte(tx: Transaccion, datos: DatosApunte) {
  const [creado] = await tx.insert(apuntes).values(valores(datos)).returning({ id: apuntes.id })
  if (!creado) throw new Error('No se pudo registrar el ingreso o gasto')
  return verApunte(tx, creado.id)
}

export async function corregirApunte(tx: Transaccion, apunteId: string, datos: DatosApunte) {
  await vigente(tx, apunteId)
  await tx.update(apuntes).set(valores(datos)).where(eq(apuntes.id, apunteId))
  return verApunte(tx, apunteId)
}

// Anulado: sigue a la vista con quién, cuándo y por qué, y deja de contar. Queda en el historial.
export async function anularApunte(
  tx: Transaccion,
  apunteId: string,
  motivo: string,
  usuarioId: string,
) {
  await vigente(tx, apunteId)
  await tx
    .update(apuntes)
    .set({ anuladoEn: new Date(), anuladoPor: usuarioId, motivoAnulacion: motivo })
    .where(eq(apuntes.id, apunteId))
  return verApunte(tx, apunteId)
}

// Pone (o cambia, o quita) el archivo y devuelve la ruta del anterior, para borrarlo cuando se
// confirme la transacción
export async function ponerArchivoApunte(
  tx: Transaccion,
  apunteId: string,
  archivo: ArchivoGuardado | null,
) {
  const { archivoRuta } = await vigente(tx, apunteId)
  await tx
    .update(apuntes)
    .set({
      archivoRuta: archivo?.ruta ?? null,
      archivoNombre: archivo?.nombre ?? null,
      archivoTipo: archivo?.tipo ?? null,
      archivoTamano: archivo?.tamano ?? null,
    })
    .where(eq(apuntes.id, apunteId))
  return { anterior: archivoRuta, apunte: await verApunte(tx, apunteId) }
}

export async function archivoDeApunte(tx: Transaccion, apunteId: string) {
  const a = await filaApunte(tx, apunteId)
  if (!a.archivoRuta || !a.archivoTipo)
    throw new ErrorApi(404, 'archivo_no_encontrado', 'No tiene archivo')
  return { ruta: a.archivoRuta, nombre: a.archivoNombre ?? 'archivo', tipo: a.archivoTipo }
}
