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

// Almacenes de comida de una explotación (docs/diseno.md, "Comida"). Cada uno es un stock de una
// comida, que se mide en unidades (pacas) o en kilos. No se borran: se desactivan.

// Qué comida guarda
export const TIPOS_ALMACEN = ['hierba_verde', 'hierba_seca', 'maiz', 'pienso', 'otro'] as const

export const tipoAlmacen = pgEnum('tipo_almacen', TIPOS_ALMACEN)

export const UNIDADES_ALMACEN = ['unidades', 'kg'] as const

export const unidadAlmacen = pgEnum('unidad_almacen', UNIDADES_ALMACEN)

export const almacenes = pgTable(
  'almacenes',
  {
    id: id(),
    ...deExplotacion(),
    nombre: text('nombre').notNull(),
    tipo: tipoAlmacen('tipo').notNull(),
    unidad: unidadAlmacen('unidad').notNull(),
    activo: boolean('activo').notNull().default(true),
    ...auditoria(),
  },
  (t) => [
    // Los movimientos, siempre de un almacén de la misma explotación (clave foránea compuesta)
    unique('almacenes_explotacion_id_unique').on(t.explotacionId, t.id),
    // Sin dos almacenes con el mismo nombre en la explotación, para no confundirlos
    uniqueIndex('almacenes_nombre_unico').on(t.explotacionId, sql`lower(${t.nombre})`),
    index('almacenes_explotacion_idx').on(t.explotacionId),
    check('almacenes_nombre_no_vacio', sql`btrim(${t.nombre}) <> ''`),
    separacionPorExplotacion(),
  ],
)
