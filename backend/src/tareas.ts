import { z } from '@hono/zod-openapi'
import { and, asc, desc, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Transaccion } from './db/explotacion.js'
import {
  equipos,
  member,
  PRIORIDADES_TAREA,
  type RolExplotacion,
  tareas,
  user,
} from './db/schema/index.js'
import { verEquipo } from './equipos.js'
import { ErrorApi } from './errores.js'

// Tareas de mantenimiento (GH-112): lo que hay por hacer, como "Cambiar la boya del bebedero", de un
// equipo o suelta. Cualquiera del equipo las crea, las corrige, las marca como hechas y las borra; el
// administrador las asigna. Como en labores.ts, todas las funciones reciben la transacción de
// enLaExplotacion.

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

export const DatosTarea = z
  .object({
    titulo: z
      .string('Indica la tarea')
      .trim()
      .min(1, 'Indica la tarea')
      .max(120, 'Como mucho 120 caracteres')
      .openapi({ example: 'Cambiar la boya' }),
    equipoId: z.uuid().nullish(),
    descripcion: textoOpcional,
    fechaLimite: z.iso.date('Fecha no válida (aaaa-mm-dd)').nullish(),
    prioridad: z.enum(PRIORIDADES_TAREA).default('normal'),
    // Solo el administrador asigna
    asignadaAId: z.uuid().nullish(),
  })
  .openapi('DatosTarea')

export type DatosTarea = z.output<typeof DatosTarea>

export const CambioHecha = z.object({ hecha: z.boolean() }).openapi('CambioHecha')

const asignada = alias(user, 'asignada')
const hechaPor = alias(user, 'hecha_por')

const columnas = {
  id: tareas.id,
  titulo: tareas.titulo,
  equipoId: tareas.equipoId,
  equipoNombre: equipos.nombre,
  descripcion: tareas.descripcion,
  fechaLimite: tareas.fechaLimite,
  prioridad: tareas.prioridad,
  asignadaAId: tareas.asignadaAId,
  asignadaANombre: asignada.name,
  hechaEn: tareas.hechaEn,
  hechaPorId: tareas.hechaPorId,
  hechaPorNombre: hechaPor.name,
  creadoEn: tareas.creadoEn,
  modificadoEn: tareas.modificadoEn,
}

const consulta = (tx: Transaccion) =>
  tx
    .select(columnas)
    .from(tareas)
    .leftJoin(equipos, eq(equipos.id, tareas.equipoId))
    .leftJoin(asignada, eq(asignada.id, tareas.asignadaAId))
    .leftJoin(hechaPor, eq(hechaPor.id, tareas.hechaPorId))

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// El equipo, la persona asignada y quién la hizo, como objetos
const tarea = ({
  equipoId,
  equipoNombre,
  asignadaAId,
  asignadaANombre,
  hechaEn,
  hechaPorId,
  hechaPorNombre,
  ...t
}: Fila) => ({
  ...t,
  equipo: equipoId ? { id: equipoId, nombre: equipoNombre ?? '' } : null,
  asignadaA: asignadaAId ? { id: asignadaAId, nombre: asignadaANombre ?? '' } : null,
  hecha:
    hechaEn && hechaPorId
      ? { en: hechaEn.toISOString(), por: { id: hechaPorId, nombre: hechaPorNombre ?? '' } }
      : null,
  creadoEn: t.creadoEn.toISOString(),
  modificadoEn: t.modificadoEn.toISOString(),
})

export type FiltrosTareas = {
  estado?: 'pendiente' | 'hecha'
  // "Mis tareas": las asignadas a quien pregunta y las que no tienen a nadie
  para?: 'mi'
  asignadaA?: string
  equipoId?: string
}

// Las pendientes, por fecha límite (las que no tienen, al final) y prioridad; las hechas, de la más
// reciente a la más antigua
export async function listarTareas(tx: Transaccion, filtros: FiltrosTareas, usuarioId: string) {
  const condiciones: (SQL | undefined)[] = []
  if (filtros.estado === 'pendiente') condiciones.push(isNull(tareas.hechaEn))
  if (filtros.estado === 'hecha') condiciones.push(isNotNull(tareas.hechaEn))
  if (filtros.para === 'mi')
    condiciones.push(or(eq(tareas.asignadaAId, usuarioId), isNull(tareas.asignadaAId)))
  if (filtros.asignadaA) condiciones.push(eq(tareas.asignadaAId, filtros.asignadaA))
  if (filtros.equipoId) condiciones.push(eq(tareas.equipoId, filtros.equipoId))
  const filas = await consulta(tx)
    .where(and(...condiciones))
    .orderBy(
      sql`${tareas.hechaEn} is not null`,
      desc(tareas.hechaEn),
      sql`${tareas.fechaLimite} nulls last`,
      sql`case ${tareas.prioridad} when 'alta' then 0 when 'normal' then 1 else 2 end`,
      asc(tareas.creadoEn),
    )
  return filas.map(tarea)
}

async function verTarea(tx: Transaccion, tareaId: string) {
  const [fila] = await consulta(tx).where(eq(tareas.id, tareaId))
  if (!fila)
    throw new ErrorApi(404, 'tarea_no_encontrada', 'No existe la tarea en esta explotación')
  return tarea(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// El equipo, de la explotación y activo; la persona asignada, del equipo de la explotación y solo
// si quien la asigna es el administrador. La base de datos lo comprueba también; aquí se hace antes
// para dar el error en su campo.
async function comprobar(
  tx: Transaccion,
  datos: DatosTarea,
  rol: RolExplotacion,
  asignadaAntes: string | null = null,
) {
  if (datos.equipoId) {
    const equipo = await verEquipo(tx, datos.equipoId).catch(() => null)
    if (!equipo) throw invalido('equipoId', 'El equipo no está entre los de la explotación')
  }
  const asignada = datos.asignadaAId ?? null
  if (asignada !== asignadaAntes && rol !== 'administrador') {
    const mensaje = 'Solo el administrador asigna las tareas'
    throw new ErrorApi(403, 'sin_permiso', mensaje, [{ campo: 'asignadaAId', mensaje }])
  }
  if (asignada) {
    const [miembro] = await tx
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, asignada),
          eq(member.organizationId, sql`explotacion_actual()`),
          eq(member.activo, true),
        ),
      )
    if (!miembro) throw invalido('asignadaAId', 'Esa persona no es del equipo de la explotación')
  }
}

const valores = (d: DatosTarea) => ({
  titulo: d.titulo,
  equipoId: d.equipoId ?? null,
  descripcion: d.descripcion ?? null,
  fechaLimite: d.fechaLimite ?? null,
  prioridad: d.prioridad,
  asignadaAId: d.asignadaAId ?? null,
})

export async function crearTarea(tx: Transaccion, datos: DatosTarea, rol: RolExplotacion) {
  await comprobar(tx, datos, rol)
  const [creada] = await tx.insert(tareas).values(valores(datos)).returning({ id: tareas.id })
  if (!creada) throw new Error('No se pudo crear la tarea')
  return verTarea(tx, creada.id)
}

export async function corregirTarea(
  tx: Transaccion,
  tareaId: string,
  datos: DatosTarea,
  rol: RolExplotacion,
) {
  const actual = await verTarea(tx, tareaId)
  await comprobar(tx, datos, rol, actual.asignadaA?.id ?? null)
  await tx.update(tareas).set(valores(datos)).where(eq(tareas.id, tareaId))
  return verTarea(tx, tareaId)
}

// Hecha (con quién y cuándo) o, si se marcó por error, otra vez pendiente
export async function marcarHecha(
  tx: Transaccion,
  tareaId: string,
  hecha: boolean,
  usuarioId: string,
) {
  await verTarea(tx, tareaId)
  await tx
    .update(tareas)
    .set(
      hecha ? { hechaEn: new Date(), hechaPorId: usuarioId } : { hechaEn: null, hechaPorId: null },
    )
    .where(eq(tareas.id, tareaId))
  return verTarea(tx, tareaId)
}

// Borra una tarea registrada por error y la devuelve, para poder deshacerlo. Queda en el historial.
export async function borrarTarea(tx: Transaccion, tareaId: string) {
  const borrada = await verTarea(tx, tareaId)
  await tx.delete(tareas).where(eq(tareas.id, tareaId))
  return borrada
}

// Para el formulario: las personas activas del equipo, a quienes el administrador asigna
export async function personasTareas(tx: Transaccion) {
  return tx
    .select({ id: user.id, nombre: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, sql`explotacion_actual()`),
        eq(member.activo, true),
        eq(user.activo, true),
      ),
    )
    .orderBy(asc(user.name))
}
