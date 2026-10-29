import { z } from '@hono/zod-openapi'
import { asc, eq, sql } from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import { almacenes, TIPOS_ALMACEN, UNIDADES_ALMACEN } from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { alCrearExplotacion } from './explotaciones.js'

// Almacenes de comida de una explotación (GH-29). Como en fincas.ts, todas las funciones reciben la
// transacción de enLaExplotacion.

export const DatosAlmacen = z
  .object({
    nombre: z
      .string('Indica el nombre')
      .trim()
      .min(1, 'Indica el nombre')
      .max(80, 'Como mucho 80 caracteres')
      .openapi({ example: 'Pacas de hierba seca' }),
    tipo: z.enum(TIPOS_ALMACEN, 'Indica qué comida guarda'),
    unidad: z.enum(UNIDADES_ALMACEN, 'Indica si se mide en unidades o en kilos'),
  })
  .openapi('DatosAlmacen')

export type DatosAlmacen = z.output<typeof DatosAlmacen>

export const CambioEstadoAlmacen = z.object({ activo: z.boolean() }).openapi('CambioEstadoAlmacen')

// Los de una explotación nueva: las pacas se cuentan en unidades y los silos se pesan en kilos
export const ALMACENES_POR_DEFECTO: DatosAlmacen[] = [
  { nombre: 'Pacas de hierba verde', tipo: 'hierba_verde', unidad: 'unidades' },
  { nombre: 'Pacas de hierba seca', tipo: 'hierba_seca', unidad: 'unidades' },
  { nombre: 'Silo de maíz', tipo: 'maiz', unidad: 'kg' },
  { nombre: 'Silo de pienso', tipo: 'pienso', unidad: 'kg' },
]

// Al crear una explotación, en su misma transacción. Esa transacción no fija la explotación ni el
// usuario, así que van explícitos; si ya existen (el seed), se dejan como están.
export async function crearAlmacenesPorDefecto(
  tx: Transaccion,
  explotacionId: string,
  creadorId: string,
) {
  await tx
    .insert(almacenes)
    .values(
      ALMACENES_POR_DEFECTO.map((a) => ({
        ...a,
        explotacionId,
        creadoPor: creadorId,
        modificadoPor: creadorId,
      })),
    )
    .onConflictDoNothing()
}

alCrearExplotacion.push(crearAlmacenesPorDefecto)

const columnas = {
  id: almacenes.id,
  nombre: almacenes.nombre,
  tipo: almacenes.tipo,
  unidad: almacenes.unidad,
  activo: almacenes.activo,
  creadoEn: almacenes.creadoEn,
  modificadoEn: almacenes.modificadoEn,
  // El stock sale de sus entradas, salidas y ajustes (GH-30, función stock_almacen)
  stock: sql<number>`stock_almacen("almacenes"."id")::float8`,
  conMovimientos: sql<boolean>`exists (select from movimientos_comida m
    where m.almacen_id = "almacenes"."id")`,
}

const almacen = <T extends { creadoEn: Date; modificadoEn: Date }>(a: T) => ({
  ...a,
  creadoEn: a.creadoEn.toISOString(),
  modificadoEn: a.modificadoEn.toISOString(),
})

// En el orden en que se crearon: los de por defecto primero, como se dieron de alta
export async function listarAlmacenes(tx: Transaccion, filtros: { activo?: boolean }) {
  const filas = await tx
    .select(columnas)
    .from(almacenes)
    .where(filtros.activo === undefined ? undefined : eq(almacenes.activo, filtros.activo))
    .orderBy(asc(almacenes.creadoEn), asc(almacenes.id))
  return filas.map(almacen)
}

export async function verAlmacen(tx: Transaccion, almacenId: string) {
  const [fila] = await tx.select(columnas).from(almacenes).where(eq(almacenes.id, almacenId))
  if (!fila)
    throw new ErrorApi(404, 'almacen_no_encontrado', 'No existe el almacén en esta explotación')
  return almacen(fila)
}

// Traduce los errores de la base de datos que puede provocar el usuario
async function conErroresClaros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
    if (causa?.code === '23505' && causa.constraint === 'almacenes_nombre_unico') {
      const mensaje = 'Ya hay un almacén con este nombre'
      throw new ErrorApi(409, 'nombre_en_uso', mensaje, [{ campo: 'nombre', mensaje }])
    }
    throw error
  }
}

export async function crearAlmacen(tx: Transaccion, datos: DatosAlmacen) {
  const [creado] = await conErroresClaros(() =>
    tx.insert(almacenes).values(datos).returning({ id: almacenes.id }),
  )
  if (!creado) throw new Error('No se pudo crear el almacén')
  return verAlmacen(tx, creado.id)
}

export async function editarAlmacen(tx: Transaccion, almacenId: string, datos: DatosAlmacen) {
  const actual = await verAlmacen(tx, almacenId)
  // La base de datos lo impide también; aquí se comprueba antes para dar el error en su campo
  if (actual.conMovimientos && datos.unidad !== actual.unidad) {
    const mensaje = 'El almacén ya tiene movimientos: su unidad no cambia'
    throw new ErrorApi(409, 'unidad_con_movimientos', mensaje, [{ campo: 'unidad', mensaje }])
  }
  await conErroresClaros(() => tx.update(almacenes).set(datos).where(eq(almacenes.id, almacenId)))
  return verAlmacen(tx, almacenId)
}

// Desactivar un almacén lo quita de la pantalla de stock; sus datos y su historial se conservan
export async function cambiarEstadoAlmacen(tx: Transaccion, almacenId: string, activo: boolean) {
  await verAlmacen(tx, almacenId)
  await tx.update(almacenes).set({ activo }).where(eq(almacenes.id, almacenId))
  return verAlmacen(tx, almacenId)
}
