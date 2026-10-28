import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { animales } from './animales.js'
import { user } from './auth.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Tratamientos sanitarios de los animales (docs/diseno.md, "Tratamientos"). No se borran ni se
// corrigen: uno registrado por error se anula, con su motivo, y se registra de nuevo.

export const MOTIVOS_TRATAMIENTO = ['enfermedad', 'vacuna', 'desparasitacion', 'otro'] as const

export const motivoTratamiento = pgEnum('motivo_tratamiento', MOTIVOS_TRATAMIENTO)

export const VIAS_ADMINISTRACION = [
  'intramuscular',
  'subcutanea',
  'intravenosa',
  'oral',
  'topica',
  'intramamaria',
  'intrauterina',
  'otra',
] as const

export const viaAdministracion = pgEnum('via_administracion', VIAS_ADMINISTRACION)

// El límite solo descarta errores al teclear: las supresiones de carne no pasan de unos meses
export const DIAS_SUPRESION_MAXIMO = 999

export const tratamientos = pgTable(
  'tratamientos',
  {
    id: id(),
    ...deExplotacion(),
    animalId: uuid('animal_id').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    producto: text('producto').notNull(),
    dosis: text('dosis'),
    via: viaAdministracion('via'),
    motivo: motivoTratamiento('motivo').notNull(),
    // Enfermedad o motivo concreto: "Neumonía", "Lengua azul"...
    diagnostico: text('diagnostico'),
    // Quién lo administra: un usuario de la explotación o un texto libre (el veterinario)
    aplicadoPorId: uuid('aplicado_por_id').references(() => user.id),
    aplicadoPorTexto: text('aplicado_por_texto'),
    lote: text('lote'),
    diasSupresion: integer('dias_supresion').notNull().default(0),
    // Primer día en que el animal puede ir a matadero
    finSupresion: date('fin_supresion', { mode: 'string' })
      .notNull()
      .generatedAlwaysAs(sql`fecha + dias_supresion`),
    observaciones: text('observaciones'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => user.id),
    motivoAnulacion: text('motivo_anulacion'),
    ...auditoria(),
  },
  (t) => [
    // Compuesta, para que el tratamiento y el animal sean siempre de la misma explotación. Un
    // animal con tratamientos no se puede borrar.
    foreignKey({
      name: 'tratamientos_animal_fk',
      columns: [t.explotacionId, t.animalId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('restrict'),
    index('tratamientos_explotacion_idx').on(t.explotacionId),
    index('tratamientos_animal_idx').on(t.animalId, t.fecha),
    check('tratamientos_producto', sql`btrim(${t.producto}) <> ''`),
    check(
      'tratamientos_dias_supresion',
      sql`${t.diasSupresion} >= 0 and ${t.diasSupresion} <= ${sql.raw(String(DIAS_SUPRESION_MAXIMO))}`,
    ),
    check(
      'tratamientos_aplicado_por',
      sql`not (${t.aplicadoPorId} is not null and ${t.aplicadoPorTexto} is not null)`,
    ),
    check(
      'tratamientos_anulacion',
      sql`(${t.anuladoEn} is null and ${t.anuladoPor} is null and ${t.motivoAnulacion} is null)
        or (${t.anuladoEn} is not null and ${t.anuladoPor} is not null
          and btrim(coalesce(${t.motivoAnulacion}, '')) <> '')`,
    ),
    separacionPorExplotacion(),
  ],
)
