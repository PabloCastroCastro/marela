import { type SQL, sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Ficha de cada animal (docs/diseno.md, "Animales"). Los cambios quedan además en historial_cambios.

export const SEXOS = ['hembra', 'macho'] as const
export const ORIGENES = ['nacido', 'comprado'] as const
// "baja": fuera de la explotación por otra causa que no es la venta ni la muerte (robo, extravío…)
export const ESTADOS_ANIMAL = ['activo', 'vendido', 'muerto', 'baja'] as const

// Tipo de baja y estado en que deja al animal. La venta la registra Finanzas (GH-38).
export const TIPOS_BAJA = ['venta', 'muerte', 'sacrificio', 'robo_extravio', 'otra'] as const
export const ESTADO_POR_BAJA = {
  venta: 'vendido',
  muerte: 'muerto',
  sacrificio: 'muerto',
  robo_extravio: 'baja',
  otra: 'baja',
} as const satisfies Record<(typeof TIPOS_BAJA)[number], (typeof ESTADOS_ANIMAL)[number]>

export const sexoAnimal = pgEnum('sexo_animal', SEXOS)

// A quién afecta que una madre no sea apta para reposición (GH-110)
export const ALCANCES_NO_APTA = ['hijas', 'descendencia'] as const

export const alcanceNoApta = pgEnum('alcance_no_apta', ALCANCES_NO_APTA)
export const origenAnimal = pgEnum('origen_animal', ORIGENES)
export const estadoAnimal = pgEnum('estado_animal', ESTADOS_ANIMAL)
export const tipoBaja = pgEnum('tipo_baja', TIPOS_BAJA)

// Crotal oficial: los españoles, ES y 12 dígitos; los de otros países (animales comprados fuera),
// su código de país y hasta 12 dígitos
export const FORMATO_CROTAL = /^(ES\d{12}|(?!ES)[A-Z]{2}\d{1,12})$/
const crotalValido = (c: AnyPgColumn): SQL =>
  sql`(${c} ~ '^ES[0-9]{12}$' or (${c} ~ '^[A-Z]{2}[0-9]{1,12}$' and left(${c}, 2) <> 'ES'))`

const noVacio = (c: AnyPgColumn): SQL => sql`(${c} is null or btrim(${c}) <> '')`

export const animales = pgTable(
  'animales',
  {
    id: id(),
    ...deExplotacion(),
    // Sin crotal solo mientras se le pone, en los 20 días siguientes al nacimiento (GH-23)
    crotal: text('crotal'),
    nombre: text('nombre'),
    raza: text('raza').notNull(),
    sexo: sexoAnimal('sexo').notNull(),
    fechaNacimiento: date('fecha_nacimiento', { mode: 'string' }).notNull(),
    // Madre y padre: la ficha si está en la explotación o un texto libre (p. ej. dosis externa)
    madreId: uuid('madre_id'),
    madreTexto: text('madre_texto'),
    padreId: uuid('padre_id'),
    padreTexto: text('padre_texto'),
    origen: origenAnimal('origen').notNull().default('nacido'),
    fechaEntrada: date('fecha_entrada', { mode: 'string' }),
    regaOrigen: text('rega_origen'),
    estado: estadoAnimal('estado').notNull().default('activo'),
    tipoBaja: tipoBaja('tipo_baja'),
    fechaBaja: date('fecha_baja', { mode: 'string' }),
    // Detalle de la baja; obligatorio si el tipo es "otra"
    causaBaja: text('causa_baja'),
    observaciones: text('observaciones'),
    // Parto en que nació (GH-23). La clave foránea a partos está en la migración 0015, para no
    // importar aquí reproduccion.ts, que importa animales.
    partoId: uuid('parto_id'),
    // Una hembra con una enfermedad que se transmite a la descendencia (GH-110): desde cuándo, por qué
    // y a quién afecta, solo a sus hijas (no se dejan para reposición) o a toda su descendencia
    noAptaReposicionDesde: date('no_apta_reposicion_desde', { mode: 'string' }),
    motivoNoAptaReposicion: text('motivo_no_apta_reposicion'),
    alcanceNoAptaReposicion: alcanceNoApta('alcance_no_apta_reposicion'),
    ...auditoria(),
  },
  (t) => [
    // Único en toda la plataforma: un animal está en una sola explotación (los traslados lo mueven)
    unique('animales_crotal_unique').on(t.crotal),
    // Para que madre y padre sean siempre de la misma explotación (claves foráneas compuestas)
    unique('animales_explotacion_id_unique').on(t.explotacionId, t.id),
    foreignKey({
      name: 'animales_madre_fk',
      columns: [t.explotacionId, t.madreId],
      foreignColumns: [t.explotacionId, t.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'animales_padre_fk',
      columns: [t.explotacionId, t.padreId],
      foreignColumns: [t.explotacionId, t.id],
    }).onDelete('restrict'),
    index('animales_explotacion_idx').on(t.explotacionId),
    index('animales_madre_idx').on(t.madreId),
    index('animales_padre_idx').on(t.padreId),
    check('animales_crotal_formato', crotalValido(t.crotal)),
    check('animales_raza_no_vacia', sql`btrim(${t.raza}) <> ''`),
    check('animales_nombre_no_vacio', noVacio(t.nombre)),
    check('animales_madre_una', sql`${t.madreId} is null or ${t.madreTexto} is null`),
    check('animales_padre_uno', sql`${t.padreId} is null or ${t.padreTexto} is null`),
    check('animales_madre_no_propia', sql`${t.madreId} is distinct from ${t.id}`),
    check('animales_padre_no_propio', sql`${t.padreId} is distinct from ${t.id}`),
    // Con fecha y motivo, o sin los dos; y solo en hembras
    check(
      'animales_no_apta_reposicion',
      sql`(${t.noAptaReposicionDesde} is null and ${t.motivoNoAptaReposicion} is null
          and ${t.alcanceNoAptaReposicion} is null)
        or (${t.noAptaReposicionDesde} is not null and btrim(coalesce(${t.motivoNoAptaReposicion}, '')) <> ''
            and ${t.alcanceNoAptaReposicion} is not null and ${t.sexo} = 'hembra')`,
    ),
    check(
      'animales_origen',
      sql`(${t.origen} = 'nacido' and ${t.fechaEntrada} is null and ${t.regaOrigen} is null)
        or (${t.origen} = 'comprado' and ${t.fechaEntrada} is not null
            and ${t.regaOrigen} ~ '^ES[0-9]{12}$')`,
    ),
    check(
      'animales_baja',
      // Con ::text: un valor nuevo de un enum no se puede usar en la misma transacción que lo añade
      sql`(${t.estado}::text = 'activo' and ${t.tipoBaja} is null and ${t.fechaBaja} is null
            and ${t.causaBaja} is null)
        or (${t.fechaBaja} is not null and (${t.tipoBaja}::text, ${t.estado}::text) in (
            ('venta', 'vendido'), ('muerte', 'muerto'), ('sacrificio', 'muerto'),
            ('robo_extravio', 'baja'), ('otra', 'baja'))
          and (${t.tipoBaja}::text <> 'otra' or btrim(coalesce(${t.causaBaja}, '')) <> ''))`,
    ),
    separacionPorExplotacion(),
  ],
)

// Historial de altas, cambios y borrados de las tablas de datos, con el estado anterior y el nuevo.
// Lo rellena el trigger registrar_cambio() (migración de animales); no se escribe a mano.
export const historialCambios = pgTable(
  'historial_cambios',
  {
    id: id(),
    ...deExplotacion(),
    tabla: text('tabla').notNull(),
    filaId: uuid('fila_id').notNull(),
    operacion: text('operacion').notNull(),
    usuarioId: uuid('usuario_id')
      .default(sql`usuario_actual()`)
      .references(() => user.id),
    fecha: timestamp('fecha', { withTimezone: true }).notNull().defaultNow(),
    antes: jsonb('antes'),
    despues: jsonb('despues'),
  },
  (t) => [
    index('historial_fila_idx').on(t.tabla, t.filaId),
    check('historial_operacion', sql`${t.operacion} in ('alta', 'cambio', 'borrado')`),
    separacionPorExplotacion(),
  ],
)
