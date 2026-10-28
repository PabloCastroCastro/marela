import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { animales } from './animales.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Pesadas de los animales (docs/diseno.md, "Pesos"). Los cambios y los borrados quedan en
// historial_cambios.

// Momento de la pesada. Nacimiento, destete y venta, como mucho una vez por animal.
export const MOMENTOS_PESADA = ['nacimiento', 'destete', 'venta', 'otro'] as const

export const momentoPesada = pgEnum('momento_pesada', MOMENTOS_PESADA)

// Kilos con un decimal. El límite superior solo descarta errores al teclear.
export const KG_MAXIMO = 2000

export const pesos = pgTable(
  'pesos',
  {
    id: id(),
    ...deExplotacion(),
    animalId: uuid('animal_id').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    kg: numeric('kg', { precision: 5, scale: 1, mode: 'number' }).notNull(),
    momento: momentoPesada('momento').notNull().default('otro'),
    ...auditoria(),
  },
  (t) => [
    // Compuesta, para que la pesada y el animal sean siempre de la misma explotación. Al borrar el
    // animal se borran sus pesadas.
    foreignKey({
      name: 'pesos_animal_fk',
      columns: [t.explotacionId, t.animalId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('cascade'),
    index('pesos_explotacion_idx').on(t.explotacionId),
    index('pesos_animal_idx').on(t.animalId, t.fecha),
    uniqueIndex('pesos_momento_unico').on(t.animalId, t.momento).where(sql`${t.momento} <> 'otro'`),
    check('pesos_kg', sql`${t.kg} > 0 and ${t.kg} <= ${sql.raw(String(KG_MAXIMO))}`),
    separacionPorExplotacion(),
  ],
)
