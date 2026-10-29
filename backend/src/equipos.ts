import { z } from '@hono/zod-openapi'
import { and, asc, eq, ilike, or, type SQL, sql } from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import { equipos, TIPOS_EQUIPO } from './db/schema/index.js'
import { ErrorApi } from './errores.js'

// Maquinaria e infraestructuras de la explotación (GH-111). Como en almacenes.ts, todas las funciones
// reciben la transacción de enLaExplotacion. Los da de alta y los edita cualquiera del equipo.

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

export const DatosEquipo = z
  .object({
    nombre: z
      .string('Indica el nombre')
      .trim()
      .min(1, 'Indica el nombre')
      .max(80, 'Como mucho 80 caracteres')
      .openapi({ example: 'Tractor John Deere 6120M' }),
    tipo: z.enum(TIPOS_EQUIPO, 'Indica si es maquinaria o una infraestructura'),
    descripcion: textoOpcional.openapi({ example: 'Matrícula E-1234-BCD' }),
    necesitaMantenimiento: z.boolean().default(false),
  })
  .openapi('DatosEquipo')

export type DatosEquipo = z.output<typeof DatosEquipo>

export const CambioEstadoEquipo = z.object({ activo: z.boolean() }).openapi('CambioEstadoEquipo')

const columnas = {
  id: equipos.id,
  nombre: equipos.nombre,
  tipo: equipos.tipo,
  descripcion: equipos.descripcion,
  necesitaMantenimiento: equipos.necesitaMantenimiento,
  activo: equipos.activo,
  creadoEn: equipos.creadoEn,
  modificadoEn: equipos.modificadoEn,
}

const equipo = <T extends { creadoEn: Date; modificadoEn: Date }>(e: T) => ({
  ...e,
  creadoEn: e.creadoEn.toISOString(),
  modificadoEn: e.modificadoEn.toISOString(),
})

export type FiltrosEquipos = {
  q?: string
  tipo?: (typeof TIPOS_EQUIPO)[number]
  activo?: boolean
}

// Los que necesitan mantenimiento primero, y después por nombre
export async function listarEquipos(tx: Transaccion, filtros: FiltrosEquipos) {
  const condiciones: (SQL | undefined)[] = []
  const q = filtros.q?.trim()
  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    condiciones.push(or(ilike(equipos.nombre, patron), ilike(equipos.descripcion, patron)))
  }
  if (filtros.tipo) condiciones.push(eq(equipos.tipo, filtros.tipo))
  if (filtros.activo !== undefined) condiciones.push(eq(equipos.activo, filtros.activo))
  const filas = await tx
    .select(columnas)
    .from(equipos)
    .where(and(...condiciones))
    .orderBy(sql`${equipos.necesitaMantenimiento} desc`, asc(sql`lower(${equipos.nombre})`))
  return filas.map(equipo)
}

export async function verEquipo(tx: Transaccion, equipoId: string) {
  const [fila] = await tx.select(columnas).from(equipos).where(eq(equipos.id, equipoId))
  if (!fila)
    throw new ErrorApi(404, 'equipo_no_encontrado', 'No existe el equipo en esta explotación')
  return equipo(fila)
}

// Traduce los errores de la base de datos que puede provocar el usuario
async function conErroresClaros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
    if (causa?.code === '23505' && causa.constraint === 'equipos_nombre_unico') {
      const mensaje = 'Ya hay un equipo con este nombre'
      throw new ErrorApi(409, 'nombre_en_uso', mensaje, [{ campo: 'nombre', mensaje }])
    }
    throw error
  }
}

const valores = (d: DatosEquipo) => ({
  nombre: d.nombre,
  tipo: d.tipo,
  descripcion: d.descripcion ?? null,
  necesitaMantenimiento: d.necesitaMantenimiento,
})

export async function crearEquipo(tx: Transaccion, datos: DatosEquipo) {
  const [creado] = await conErroresClaros(() =>
    tx.insert(equipos).values(valores(datos)).returning({ id: equipos.id }),
  )
  if (!creado) throw new Error('No se pudo crear el equipo')
  return verEquipo(tx, creado.id)
}

export async function editarEquipo(tx: Transaccion, equipoId: string, datos: DatosEquipo) {
  await verEquipo(tx, equipoId)
  await conErroresClaros(() =>
    tx.update(equipos).set(valores(datos)).where(eq(equipos.id, equipoId)),
  )
  return verEquipo(tx, equipoId)
}

// Desactivar un equipo (vendido, desmontado) lo quita del listado; sus datos y su historial se
// conservan
export async function cambiarEstadoEquipo(tx: Transaccion, equipoId: string, activo: boolean) {
  await verEquipo(tx, equipoId)
  await tx.update(equipos).set({ activo }).where(eq(equipos.id, equipoId))
  return verEquipo(tx, equipoId)
}
