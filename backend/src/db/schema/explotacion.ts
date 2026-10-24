import { sql } from 'drizzle-orm'
import { pgPolicy, pgRole, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organization, user } from './auth.js'

// Piezas comunes de las tablas con datos de una explotación (animales, comida, fincas, finanzas).
//
// Separación por explotación con Row-Level Security: el backend accede a esos datos con el rol
// marela_app dentro de una transacción que fija la explotación y el usuario de la petición
// (enExplotacion en src/db/explotacion.ts). La política solo deja ver y escribir filas de esa
// explotación; sin explotación fijada no se ve ninguna. El rol y las funciones explotacion_actual()
// y usuario_actual() los crea la migración 0000_rol_aplicacion.
//
// Cada tabla de datos se define así:
//
//   export const animales = pgTable(
//     'animales',
//     { id: id(), ...deExplotacion(), crotal: text('crotal').notNull(), ...auditoria() },
//     (t) => [index('animales_explotacion_idx').on(t.explotacionId), separacionPorExplotacion()],
//   )

export const ROL_APLICACION = 'marela_app'

const rolAplicacion = pgRole(ROL_APLICACION).existing()

// Explotación a la que pertenece la fila; al insertar toma la de la transacción
export const deExplotacion = () => ({
  explotacionId: uuid('explotacion_id')
    .notNull()
    .default(sql`explotacion_actual()`)
    .references(() => organization.id, { onDelete: 'restrict' }),
})

// Quién creó y modificó la fila, y cuándo. El usuario sale de la transacción; la modificación se
// actualiza en cada update de Drizzle.
export const auditoria = () => ({
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  creadoPor: uuid('creado_por')
    .notNull()
    .default(sql`usuario_actual()`)
    .references(() => user.id),
  modificadoEn: timestamp('modificado_en', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  modificadoPor: uuid('modificado_por')
    .notNull()
    .default(sql`usuario_actual()`)
    .$onUpdate(() => sql`usuario_actual()`)
    .references(() => user.id),
})

// Política de la tabla (activa Row-Level Security en ella): lectura y escritura solo de la
// explotación de la transacción
export const separacionPorExplotacion = () =>
  pgPolicy('separacion_por_explotacion', {
    for: 'all',
    to: rolAplicacion,
    using: sql`explotacion_id = explotacion_actual()`,
    withCheck: sql`explotacion_id = explotacion_actual()`,
  })
