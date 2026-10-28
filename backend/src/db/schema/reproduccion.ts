import { sql } from 'drizzle-orm'
import {
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
import { animales } from './animales.js'
import { user } from './auth.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Eventos reproductivos (docs/diseno.md, "Reproducción"). Como los tratamientos, no se corrigen ni
// se borran: uno registrado por error se anula, con su motivo. El parto (GH-23) tiene su tabla.

export const TIPOS_EVENTO_REPRODUCTIVO = [
  'cubricion',
  'inseminacion',
  'diagnostico',
  'aborto',
  'destete',
] as const

// Los de la madre; el destete es del ternero
export const EVENTOS_DE_HEMBRA = ['cubricion', 'inseminacion', 'diagnostico', 'aborto'] as const

export const METODOS_DIAGNOSTICO = ['ecografia', 'palpacion'] as const
export const RESULTADOS_DIAGNOSTICO = ['gestante', 'vacia'] as const

export const tipoEventoReproductivo = pgEnum('tipo_evento_reproductivo', TIPOS_EVENTO_REPRODUCTIVO)
export const metodoDiagnostico = pgEnum('metodo_diagnostico', METODOS_DIAGNOSTICO)
export const resultadoDiagnostico = pgEnum('resultado_diagnostico', RESULTADOS_DIAGNOSTICO)

// Duración media de la gestación en el vacuno de carne, para la fecha prevista de parto
export const DIAS_GESTACION = 283

export const eventosReproductivos = pgTable(
  'eventos_reproductivos',
  {
    id: id(),
    ...deExplotacion(),
    animalId: uuid('animal_id').notNull(),
    tipo: tipoEventoReproductivo('tipo').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    // Cubrición e inseminación: el padre, un toro de la explotación o un texto (toro ajeno, dosis)
    padreId: uuid('padre_id'),
    padreTexto: text('padre_texto'),
    fechaPrevistaParto: date('fecha_prevista_parto', { mode: 'string' }).generatedAlwaysAs(
      sql.raw(`case when tipo in ('cubricion', 'inseminacion') then fecha + ${DIAS_GESTACION} end`),
    ),
    // Diagnóstico de gestación
    metodo: metodoDiagnostico('metodo'),
    resultado: resultadoDiagnostico('resultado'),
    observaciones: text('observaciones'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => user.id),
    motivoAnulacion: text('motivo_anulacion'),
    ...auditoria(),
  },
  (t) => [
    // Compuestas, para que el evento, el animal y el padre sean siempre de la misma explotación. Un
    // animal con eventos no se puede borrar.
    foreignKey({
      name: 'eventos_reproductivos_animal_fk',
      columns: [t.explotacionId, t.animalId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'eventos_reproductivos_padre_fk',
      columns: [t.explotacionId, t.padreId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('restrict'),
    index('eventos_reproductivos_explotacion_idx').on(t.explotacionId),
    index('eventos_reproductivos_animal_idx').on(t.animalId, t.fecha),
    // Un solo destete por ternero, sin contar los anulados
    uniqueIndex('eventos_reproductivos_destete_unico')
      .on(t.animalId)
      .where(sql`${t.tipo} = 'destete' and ${t.anuladoEn} is null`),
    // Cada tipo, con sus datos y sin los de los demás
    check(
      'eventos_reproductivos_datos',
      sql`case ${t.tipo}
        when 'cubricion' then ${t.metodo} is null and ${t.resultado} is null
          and not (${t.padreId} is not null and ${t.padreTexto} is not null)
          and (${t.padreId} is not null or btrim(coalesce(${t.padreTexto}, '')) <> '')
        when 'inseminacion' then ${t.metodo} is null and ${t.resultado} is null
          and not (${t.padreId} is not null and ${t.padreTexto} is not null)
          and (${t.padreId} is not null or btrim(coalesce(${t.padreTexto}, '')) <> '')
        when 'diagnostico' then ${t.padreId} is null and ${t.padreTexto} is null
          and ${t.metodo} is not null and ${t.resultado} is not null
        else ${t.padreId} is null and ${t.padreTexto} is null
          and ${t.metodo} is null and ${t.resultado} is null
      end`,
    ),
    check(
      'eventos_reproductivos_anulacion',
      sql`(${t.anuladoEn} is null and ${t.anuladoPor} is null and ${t.motivoAnulacion} is null)
        or (${t.anuladoEn} is not null and ${t.anuladoPor} is not null
          and btrim(coalesce(${t.motivoAnulacion}, '')) <> '')`,
    ),
    separacionPorExplotacion(),
  ],
)

// Partos (GH-23): la madre, el padre (el de la gestación) y los terneros, que son fichas de animales
// con su parto_id. Como los eventos, un parto no se corrige ni se borra: se anula, y con él se borran
// las fichas de sus terneros.
export const TIPOS_PARTO = ['normal', 'con_ayuda', 'cesarea'] as const

export const tipoParto = pgEnum('tipo_parto', TIPOS_PARTO)

// Terneros en un parto: gemelos, o como mucho cuatrillizos
export const TERNEROS_MAXIMO = 4

// Plazo para crotalar a un ternero desde que nace
export const DIAS_PARA_CROTALAR = 20

export const partos = pgTable(
  'partos',
  {
    id: id(),
    ...deExplotacion(),
    madreId: uuid('madre_id').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    tipo: tipoParto('tipo').notNull().default('normal'),
    padreId: uuid('padre_id'),
    padreTexto: text('padre_texto'),
    observaciones: text('observaciones'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => user.id),
    motivoAnulacion: text('motivo_anulacion'),
    ...auditoria(),
  },
  (t) => [
    unique('partos_explotacion_id_unique').on(t.explotacionId, t.id),
    foreignKey({
      name: 'partos_madre_fk',
      columns: [t.explotacionId, t.madreId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'partos_padre_fk',
      columns: [t.explotacionId, t.padreId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('restrict'),
    index('partos_explotacion_idx').on(t.explotacionId),
    index('partos_madre_idx').on(t.madreId, t.fecha),
    check('partos_padre_uno', sql`not (${t.padreId} is not null and ${t.padreTexto} is not null)`),
    check(
      'partos_anulacion',
      sql`(${t.anuladoEn} is null and ${t.anuladoPor} is null and ${t.motivoAnulacion} is null)
        or (${t.anuladoEn} is not null and ${t.anuladoPor} is not null
          and btrim(coalesce(${t.motivoAnulacion}, '')) <> '')`,
    ),
    separacionPorExplotacion(),
  ],
)
