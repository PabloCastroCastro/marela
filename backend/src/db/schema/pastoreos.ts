import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'
import { fincas } from './fincas.js'

// Pastoreos de las fincas (docs/diseno.md, "Pastoreo"): cuándo entran los animales, cuándo salen y
// cuántos son, sin enlazar sus fichas. Como las labores, se corrigen o se borran, y los cambios
// quedan en el historial.

// El límite solo descarta errores al teclear
export const ANIMALES_PASTOREO_MAXIMO = 9999

export const pastoreos = pgTable(
  'pastoreos',
  {
    id: id(),
    ...deExplotacion(),
    fincaId: uuid('finca_id').notNull(),
    fechaEntrada: date('fecha_entrada', { mode: 'string' }).notNull(),
    // Sin ella, los animales siguen en la finca
    fechaSalida: date('fecha_salida', { mode: 'string' }),
    animales: integer('animales').notNull(),
    observaciones: text('observaciones'),
    ...auditoria(),
  },
  (t) => [
    // Compuesta, para que el pastoreo y la finca sean siempre de la misma explotación
    foreignKey({
      name: 'pastoreos_finca_fk',
      columns: [t.explotacionId, t.fincaId],
      foreignColumns: [fincas.explotacionId, fincas.id],
    }).onDelete('cascade'),
    index('pastoreos_explotacion_idx').on(t.explotacionId),
    index('pastoreos_finca_idx').on(t.fincaId, t.fechaEntrada),
    // Un solo pastoreo en curso por finca
    uniqueIndex('pastoreos_en_curso_unico').on(t.fincaId).where(sql`${t.fechaSalida} is null`),
    check(
      'pastoreos_animales',
      sql`${t.animales} > 0 and ${t.animales} <= ${sql.raw(String(ANIMALES_PASTOREO_MAXIMO))}`,
    ),
    check('pastoreos_fechas', sql`${t.fechaSalida} >= ${t.fechaEntrada}`),
    separacionPorExplotacion(),
  ],
)
