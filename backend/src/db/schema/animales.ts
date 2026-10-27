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
export const ESTADOS_ANIMAL = ['activo', 'vendido', 'muerto'] as const

export const sexoAnimal = pgEnum('sexo_animal', SEXOS)
export const origenAnimal = pgEnum('origen_animal', ORIGENES)
export const estadoAnimal = pgEnum('estado_animal', ESTADOS_ANIMAL)

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
    crotal: text('crotal').notNull(),
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
    fechaBaja: date('fecha_baja', { mode: 'string' }),
    causaBaja: text('causa_baja'),
    observaciones: text('observaciones'),
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
    check(
      'animales_origen',
      sql`(${t.origen} = 'nacido' and ${t.fechaEntrada} is null and ${t.regaOrigen} is null)
        or (${t.origen} = 'comprado' and ${t.fechaEntrada} is not null
            and ${t.regaOrigen} ~ '^ES[0-9]{12}$')`,
    ),
    check(
      'animales_baja',
      sql`(${t.estado} = 'activo' and ${t.fechaBaja} is null and ${t.causaBaja} is null)
        or (${t.estado} <> 'activo' and ${t.fechaBaja} is not null)`,
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
