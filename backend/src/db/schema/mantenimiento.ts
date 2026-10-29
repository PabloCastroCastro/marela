import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Maquinaria e infraestructuras de la explotación (docs/diseno.md, "Mantenimiento", GH-111): el
// tractor, la nave, el bebedero… con sus tareas de mantenimiento (GH-112). No se borran: se
// desactivan.

export const TIPOS_EQUIPO = ['maquinaria', 'infraestructura'] as const

export const tipoEquipo = pgEnum('tipo_equipo', TIPOS_EQUIPO)

export const equipos = pgTable(
  'equipos',
  {
    id: id(),
    ...deExplotacion(),
    nombre: text('nombre').notNull(),
    tipo: tipoEquipo('tipo').notNull(),
    // Marca, modelo, matrícula, ubicación…
    descripcion: text('descripcion'),
    necesitaMantenimiento: boolean('necesita_mantenimiento').notNull().default(false),
    activo: boolean('activo').notNull().default(true),
    ...auditoria(),
  },
  (t) => [
    // Las tareas, siempre de un equipo de la misma explotación (clave foránea compuesta)
    unique('equipos_explotacion_id_unique').on(t.explotacionId, t.id),
    // Sin dos equipos con el mismo nombre en la explotación, para no confundirlos
    uniqueIndex('equipos_nombre_unico').on(t.explotacionId, sql`lower(${t.nombre})`),
    index('equipos_explotacion_idx').on(t.explotacionId),
    check('equipos_nombre_no_vacio', sql`btrim(${t.nombre}) <> ''`),
    separacionPorExplotacion(),
  ],
)
