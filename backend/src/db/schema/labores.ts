import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'
import { fincas, HECTAREAS_MAXIMO } from './fincas.js'

// Siembras, cosechas y otras labores de las fincas (docs/diseno.md, "Siembra, cosecha y otras
// labores"). No son datos sanitarios: se corrigen o se borran, y los cambios quedan en el historial.

export const TIPOS_LABOR = ['siembra', 'cosecha', 'otra'] as const

export const tipoLabor = pgEnum('tipo_labor', TIPOS_LABOR)

// Unidades de la cantidad cosechada: el grano en kilos o toneladas; la hierba y el silo, en pacas,
// rolos o remolques
export const UNIDADES_COSECHA = ['kg', 't', 'pacas', 'rolos', 'remolques'] as const

export const unidadCosecha = pgEnum('unidad_cosecha', UNIDADES_COSECHA)

export const labores = pgTable(
  'labores',
  {
    id: id(),
    ...deExplotacion(),
    fincaId: uuid('finca_id').notNull(),
    tipo: tipoLabor('tipo').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    // Siembra y cosecha: el cultivo ("Maíz forrajero", "Pradera")
    cultivo: text('cultivo'),
    // Otras labores: cuál ("Siega", "Laboreo", "Riego")
    labor: text('labor'),
    superficie: numeric('superficie', { precision: 10, scale: 4, mode: 'number' }).notNull(),
    // Cosecha: cuánto y en qué
    cantidad: numeric('cantidad', { precision: 12, scale: 2, mode: 'number' }),
    unidad: unidadCosecha('unidad'),
    // Quién la realiza: un usuario de la explotación o un texto libre (el contratista)
    realizadaPorId: uuid('realizada_por_id').references(() => user.id),
    realizadaPorTexto: text('realizada_por_texto'),
    observaciones: text('observaciones'),
    ...auditoria(),
  },
  (t) => [
    // Compuesta, para que la labor y la finca sean siempre de la misma explotación
    foreignKey({
      name: 'labores_finca_fk',
      columns: [t.explotacionId, t.fincaId],
      foreignColumns: [fincas.explotacionId, fincas.id],
    }).onDelete('cascade'),
    index('labores_explotacion_idx').on(t.explotacionId),
    index('labores_finca_idx').on(t.fincaId, t.fecha),
    check(
      'labores_superficie',
      sql`${t.superficie} > 0 and ${t.superficie} <= ${sql.raw(String(HECTAREAS_MAXIMO))}`,
    ),
    // Cada tipo, con sus datos y sin los de los demás
    check(
      'labores_datos',
      sql`case ${t.tipo}
        when 'otra' then btrim(coalesce(${t.labor}, '')) <> '' and ${t.cultivo} is null
          and ${t.cantidad} is null
        else btrim(coalesce(${t.cultivo}, '')) <> '' and ${t.labor} is null
      end`,
    ),
    check(
      'labores_cantidad',
      sql`(${t.cantidad} is null and ${t.unidad} is null)
        or (${t.tipo} = 'cosecha' and ${t.cantidad} > 0 and ${t.unidad} is not null)`,
    ),
    check(
      'labores_realizada_por',
      sql`not (${t.realizadaPorId} is not null and ${t.realizadaPorTexto} is not null)`,
    ),
    separacionPorExplotacion(),
  ],
)
