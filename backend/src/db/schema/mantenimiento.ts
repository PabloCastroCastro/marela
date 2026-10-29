import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Mantenimiento de la explotación (docs/diseno.md, "Mantenimiento"): la maquinaria y las
// infraestructuras (GH-111) y las tareas por hacer en ellas o sueltas (GH-112), como "Cambiar la boya
// del bebedero". Un equipo necesita mantenimiento cuando tiene tareas pendientes.

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
    // No se borran: se desactivan (vendido, desmontado…)
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

export const PRIORIDADES_TAREA = ['baja', 'normal', 'alta'] as const

export const prioridadTarea = pgEnum('prioridad_tarea', PRIORIDADES_TAREA)

// Las tareas se corrigen o se borran, como las labores; los cambios quedan en el historial
export const tareas = pgTable(
  'tareas',
  {
    id: id(),
    ...deExplotacion(),
    titulo: text('titulo').notNull(),
    // De una máquina o una infraestructura, o suelta
    equipoId: uuid('equipo_id'),
    descripcion: text('descripcion'),
    fechaLimite: date('fecha_limite', { mode: 'string' }),
    prioridad: prioridadTarea('prioridad').notNull().default('normal'),
    // A quién se la asigna el administrador; sin nadie, la puede hacer cualquiera
    asignadaAId: uuid('asignada_a_id').references(() => user.id),
    // Hecha: cuándo y quién
    hechaEn: timestamp('hecha_en', { withTimezone: true }),
    hechaPorId: uuid('hecha_por_id').references(() => user.id),
    ...auditoria(),
  },
  (t) => [
    foreignKey({
      name: 'tareas_equipo_fk',
      columns: [t.explotacionId, t.equipoId],
      foreignColumns: [equipos.explotacionId, equipos.id],
    }).onDelete('restrict'),
    index('tareas_explotacion_idx').on(t.explotacionId),
    index('tareas_equipo_idx').on(t.equipoId),
    index('tareas_asignada_idx').on(t.asignadaAId),
    check('tareas_titulo_no_vacio', sql`btrim(${t.titulo}) <> ''`),
    check('tareas_hecha', sql`(${t.hechaEn} is null) = (${t.hechaPorId} is null)`),
    separacionPorExplotacion(),
  ],
)
