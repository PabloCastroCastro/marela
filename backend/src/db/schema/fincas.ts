import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Fincas de una explotación (docs/diseno.md, "Fincas"). Una finca junta una o varias parcelas, cada
// una con su referencia SIGPAC, su referencia catastral y su superficie; la de la finca es la suma.
// No se borran: se desactivan, y sus datos y su historial se conservan.

export const REGIMENES_FINCA = [
  'propiedad',
  'arrendamiento',
  'aparceria',
  'cesion',
  'otro',
] as const

export const regimenFinca = pgEnum('regimen_finca', REGIMENES_FINCA)

export const fincas = pgTable(
  'fincas',
  {
    id: id(),
    ...deExplotacion(),
    nombre: text('nombre').notNull(),
    municipio: text('municipio'),
    provincia: text('provincia'),
    regimen: regimenFinca('regimen').notNull().default('propiedad'),
    observaciones: text('observaciones'),
    activa: boolean('activa').notNull().default(true),
    ...auditoria(),
  },
  (t) => [
    // Las parcelas, siempre de una finca de la misma explotación (clave foránea compuesta)
    unique('fincas_explotacion_id_unique').on(t.explotacionId, t.id),
    // Sin dos fincas con el mismo nombre en la explotación, para no confundirlas
    uniqueIndex('fincas_nombre_unico').on(t.explotacionId, sql`lower(${t.nombre})`),
    index('fincas_explotacion_idx').on(t.explotacionId),
    check('fincas_nombre_no_vacio', sql`btrim(${t.nombre}) <> ''`),
    separacionPorExplotacion(),
  ],
)

// Hectáreas con cuatro decimales (la precisión de la superficie en el SIGPAC). El límite superior
// solo descarta errores al teclear.
export const HECTAREAS_MAXIMO = 100_000

export const parcelas = pgTable(
  'parcelas',
  {
    id: id(),
    ...deExplotacion(),
    fincaId: uuid('finca_id').notNull(),
    // Referencia SIGPAC, como texto: o las cinco partes o ninguna
    provincia: text('sigpac_provincia'),
    municipio: text('sigpac_municipio'),
    poligono: text('sigpac_poligono'),
    parcela: text('sigpac_parcela'),
    recinto: text('sigpac_recinto'),
    referenciaCatastral: text('referencia_catastral'),
    superficie: numeric('superficie', { precision: 10, scale: 4, mode: 'number' }).notNull(),
    ...auditoria(),
  },
  (t) => [
    foreignKey({
      name: 'parcelas_finca_fk',
      columns: [t.explotacionId, t.fincaId],
      foreignColumns: [fincas.explotacionId, fincas.id],
    }).onDelete('cascade'),
    index('parcelas_explotacion_idx').on(t.explotacionId),
    index('parcelas_finca_idx').on(t.fincaId),
    // Un recinto SIGPAC, en una sola finca de la explotación
    uniqueIndex('parcelas_sigpac_unico')
      .on(t.explotacionId, t.provincia, t.municipio, t.poligono, t.parcela, t.recinto)
      .where(sql`${t.recinto} is not null`),
    check(
      'parcelas_superficie',
      sql`${t.superficie} > 0 and ${t.superficie} <= ${sql.raw(String(HECTAREAS_MAXIMO))}`,
    ),
    check(
      'parcelas_sigpac_completa',
      sql`num_nonnulls(${t.provincia}, ${t.municipio}, ${t.poligono}, ${t.parcela}, ${t.recinto}) in (0, 5)`,
    ),
    // Con alguna referencia: SIGPAC o catastral
    check(
      'parcelas_con_referencia',
      sql`${t.recinto} is not null or ${t.referenciaCatastral} is not null`,
    ),
    separacionPorExplotacion(),
  ],
)
