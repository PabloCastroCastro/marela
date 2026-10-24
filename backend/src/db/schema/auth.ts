import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { actualizadoEn, creadoEn, id } from './comun.js'

// Tablas de Better Auth con los plugins de usuario (inicio de sesión con nombre de usuario) y de
// organizaciones (cada organización es una explotación). Los nombres de las propiedades son los que
// espera su adaptador de Drizzle. Los identificadores los genera PostgreSQL (uuidv7), así que Better
// Auth debe configurarse con advanced.database.generateId: false (GH-7).

export const user = pgTable('user', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Plugin de usuario: se guarda en minúsculas; displayUsername conserva cómo se escribió
  username: text('username').unique(),
  displayUsername: text('display_username'),
  // Propietario de la plataforma: crea las explotaciones y su primer administrador
  propietario: boolean('propietario').notNull().default(false),
  // Un usuario desactivado no puede iniciar sesión y pierde las sesiones abiertas
  activo: boolean('activo').notNull().default(true),
  // Contraseña temporal: hasta cambiarla, el usuario no puede hacer nada más (GH-8)
  debeCambiarContrasena: boolean('debe_cambiar_contrasena').notNull().default(false),
  createdAt: creadoEn(),
  updatedAt: actualizadoEn(),
})

// Explotaciones
export const organization = pgTable(
  'organization',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'),
    // Código del Registro General de Explotaciones Ganaderas: ES y 12 dígitos
    rega: text('rega').notNull().unique(),
    // Obligatorios al crear una explotación desde la API (GH-11)
    municipio: text('municipio'),
    provincia: text('provincia'),
    // Una explotación desactivada desaparece para sus miembros, que no pueden entrar en ella; sus datos
    // se conservan y el propietario puede reactivarla
    activa: boolean('activa').notNull().default(true),
    createdAt: creadoEn(),
  },
  (t) => [check('organization_rega_formato', sql`${t.rega} ~ '^ES[0-9]{12}$'`)],
)

export const ROLES_EXPLOTACION = ['administrador', 'empleado'] as const

export type RolExplotacion = (typeof ROLES_EXPLOTACION)[number]

// Pertenencia de un usuario a una explotación, con su rol en ella
export const member = pgTable(
  'member',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('empleado'),
    // Un miembro desactivado no puede entrar en la explotación; sus datos y su historial se conservan
    activo: boolean('activo').notNull().default(true),
    createdAt: creadoEn(),
  },
  (t) => [
    unique('member_organization_user_unique').on(t.organizationId, t.userId),
    index('member_user_id_idx').on(t.userId),
    check(
      'member_role_valido',
      sql`${t.role} in (${sql.raw(ROLES_EXPLOTACION.map((r) => `'${r}'`).join(', '))})`,
    ),
  ],
)

export const invitation = pgTable(
  'invitation',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    inviterId: uuid('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: creadoEn(),
  },
  (t) => [
    index('invitation_organization_id_idx').on(t.organizationId),
    index('invitation_email_idx').on(t.email),
  ],
)

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Explotación con la que trabaja el usuario en esta sesión
    activeOrganizationId: uuid('active_organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: creadoEn(),
    updatedAt: actualizadoEn(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)
