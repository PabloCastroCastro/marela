import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'
import { fincas, HECTAREAS_MAXIMO } from './fincas.js'

// Abonados y tratamientos fitosanitarios de las fincas (docs/diseno.md, "Abono y fitosanitarios").
// Como los tratamientos de los animales, no se borran ni se corrigen: uno registrado por error se
// anula, con su motivo, y se registra de nuevo.

export const TIPOS_APLICACION = ['abono', 'fitosanitario'] as const

export const tipoAplicacion = pgEnum('tipo_aplicacion', TIPOS_APLICACION)

// Abono mineral (NPK, urea...) u orgánico (purín, estiércol...), para el cuaderno de explotación
export const TIPOS_ABONO = ['mineral', 'organico'] as const

export const tipoAbono = pgEnum('tipo_abono', TIPOS_ABONO)

// Unidades de la dosis por hectárea: sólidos en kilos o toneladas, líquidos en litros o, el purín,
// en metros cúbicos
export const UNIDADES_DOSIS = ['kg_ha', 't_ha', 'l_ha', 'm3_ha'] as const

export const unidadDosis = pgEnum('unidad_dosis', UNIDADES_DOSIS)

// El límite solo descarta errores al teclear: los plazos de seguridad no pasan de unos meses
export const DIAS_SEGURIDAD_MAXIMO = 999

export const aplicaciones = pgTable(
  'aplicaciones',
  {
    id: id(),
    ...deExplotacion(),
    fincaId: uuid('finca_id').notNull(),
    tipo: tipoAplicacion('tipo').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    producto: text('producto').notNull(),
    // Solo abono
    tipoAbono: tipoAbono('tipo_abono'),
    dosis: numeric('dosis', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    unidadDosis: unidadDosis('unidad_dosis').notNull(),
    superficie: numeric('superficie', { precision: 10, scale: 4, mode: 'number' }).notNull(),
    // Quién lo aplica: un usuario de la explotación o un texto libre (la cooperativa)
    aplicadoPorId: uuid('aplicado_por_id').references(() => user.id),
    aplicadoPorTexto: text('aplicado_por_texto'),
    lote: text('lote'),
    // Solo fitosanitarios: contra qué, el plazo de seguridad, el carné ROPO de quien lo aplica y
    // con qué equipo
    plaga: text('plaga'),
    diasSeguridad: integer('dias_seguridad').notNull().default(0),
    // Primer día en que se puede cosechar o pastar la finca
    finSeguridad: date('fin_seguridad', { mode: 'string' })
      .notNull()
      .generatedAlwaysAs(sql`fecha + dias_seguridad`),
    ropo: text('ropo'),
    equipo: text('equipo'),
    observaciones: text('observaciones'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => user.id),
    motivoAnulacion: text('motivo_anulacion'),
    ...auditoria(),
  },
  (t) => [
    // Compuesta, para que la aplicación y la finca sean siempre de la misma explotación. Una finca
    // no se borra (se desactiva), así que basta con impedirlo.
    foreignKey({
      name: 'aplicaciones_finca_fk',
      columns: [t.explotacionId, t.fincaId],
      foreignColumns: [fincas.explotacionId, fincas.id],
    }).onDelete('restrict'),
    index('aplicaciones_explotacion_idx').on(t.explotacionId),
    index('aplicaciones_finca_idx').on(t.fincaId, t.fecha),
    check('aplicaciones_producto', sql`btrim(${t.producto}) <> ''`),
    check('aplicaciones_dosis', sql`${t.dosis} > 0`),
    check(
      'aplicaciones_superficie',
      sql`${t.superficie} > 0 and ${t.superficie} <= ${sql.raw(String(HECTAREAS_MAXIMO))}`,
    ),
    // Cada tipo, con sus datos y sin los del otro
    check(
      'aplicaciones_datos',
      sql`case ${t.tipo}
        when 'abono' then ${t.tipoAbono} is not null and ${t.plaga} is null
          and ${t.diasSeguridad} = 0 and ${t.ropo} is null and ${t.equipo} is null
        else ${t.tipoAbono} is null and btrim(coalesce(${t.plaga}, '')) <> ''
      end`,
    ),
    check(
      'aplicaciones_dias_seguridad',
      sql`${t.diasSeguridad} >= 0 and ${t.diasSeguridad} <= ${sql.raw(String(DIAS_SEGURIDAD_MAXIMO))}`,
    ),
    check(
      'aplicaciones_aplicado_por',
      sql`not (${t.aplicadoPorId} is not null and ${t.aplicadoPorTexto} is not null)`,
    ),
    check(
      'aplicaciones_anulacion',
      sql`(${t.anuladoEn} is null and ${t.anuladoPor} is null and ${t.motivoAnulacion} is null)
        or (${t.anuladoEn} is not null and ${t.anuladoPor} is not null
          and btrim(coalesce(${t.motivoAnulacion}, '')) <> '')`,
    ),
    separacionPorExplotacion(),
  ],
)
