import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { organization, username } from 'better-auth/plugins'
import { adminAc, memberAc } from 'better-auth/plugins/organization/access'
import { eq } from 'drizzle-orm'
import { config } from './config.js'
import { db } from './db/cliente.js'
import * as schema from './db/schema/index.js'
import { logger } from './logger.js'

// Autenticación con Better Auth (docs/diseno.md, "Autenticación"). Rutas bajo /api/auth.

export const LONGITUD_MINIMA_CONTRASENA = 10

// Rutas de Better Auth que se publican: iniciar sesión con usuario o email, cerrar sesión, consultar
// la sesión y cambiar la contraseña. El resto responden 404 (registro, recuperación por email,
// gestión de organizaciones…): lo que haga falta se expone con rutas propias.
export const RUTAS_AUTH = [
  '/sign-in/username',
  '/sign-in/email',
  '/sign-out',
  '/get-session',
  '/change-password',
]

const RUTAS_INICIO_SESION = ['/sign-in/username', '/sign-in/email']

const DIA = 60 * 60 * 24

export const auth = betterAuth({
  appName: 'Marela',
  baseURL: config.urlPublica,
  basePath: '/api/auth',
  secret: config.secretoAuth,
  // Solo se aceptan peticiones que modifican datos desde la propia aplicación (protección CSRF)
  trustedOrigins: [config.urlPublica],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  // Los mensajes de Better Auth van al log de la aplicación, con su nivel
  logger: {
    level: 'debug',
    log: (nivel, mensaje, ...datos) =>
      logger[nivel]({ origen: 'better-auth', datos: datos.length ? datos : undefined }, mensaje),
  },
  emailAndPassword: {
    enabled: true,
    // Los usuarios los crean el propietario (crear-propietario) y los administradores (GH-12)
    disableSignUp: true,
    minPasswordLength: LONGITUD_MINIMA_CONTRASENA,
  },
  user: {
    additionalFields: {
      propietario: { type: 'boolean', required: false, defaultValue: false, input: false },
      activo: { type: 'boolean', required: false, defaultValue: true, input: false },
      debeCambiarContrasena: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  session: {
    // 30 días, renovada con el uso una vez al día: en el móvil no hay que volver a entrar, y se
    // puede trabajar varios días sin conexión
    expiresIn: 30 * DIA,
    updateAge: DIA,
  },
  plugins: [
    // Inicio de sesión con nombre de usuario; se guarda en minúsculas
    username(),
    // Cada organización es una explotación, con un rol por miembro. Las explotaciones las crea el
    // propietario con rutas propias (GH-11), no Better Auth.
    organization({
      allowUserToCreateOrganization: false,
      creatorRole: 'administrador',
      roles: { administrador: adminAc, empleado: memberAc },
      schema: {
        organization: { additionalFields: { rega: { type: 'string', required: true } } },
      },
    }),
  ],
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 100,
    // Límite de intentos de inicio de sesión: 5 por minuto desde cada IP
    customRules: Object.fromEntries(RUTAS_INICIO_SESION.map((r) => [r, { window: 60, max: 5 }])),
  },
  databaseHooks: {
    session: {
      create: {
        // Un usuario desactivado no puede iniciar sesión, aunque la contraseña sea correcta
        before: async (sesion) => {
          const [usuario] = await db
            .select({ activo: schema.user.activo })
            .from(schema.user)
            .where(eq(schema.user.id, sesion.userId))
          if (!usuario?.activo) {
            throw new APIError('FORBIDDEN', {
              code: 'USUARIO_DESACTIVADO',
              message: 'El usuario está desactivado',
            })
          }
        },
      },
    },
  },
  hooks: {
    // Al cambiar la contraseña deja de ser temporal
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/change-password' || ctx.context.returned instanceof Error) return
      const usuarioId = ctx.context.session?.user.id
      if (!usuarioId) return
      await db
        .update(schema.user)
        .set({ debeCambiarContrasena: false })
        .where(eq(schema.user.id, usuarioId))
    }),
  },
  advanced: {
    database: { generateId: false },
    // HttpOnly y SameSite=Lax son los valores por defecto; Secure salvo en desarrollo (http://localhost)
    useSecureCookies: config.entorno !== 'desarrollo',
    cookiePrefix: 'marela',
    // nginx sobrescribe X-Real-IP con la IP de la conexión; X-Forwarded-For lo puede falsear el cliente
    ipAddress: { ipAddressHeaders: ['x-real-ip'] },
  },
})

export type Sesion = typeof auth.$Infer.Session
