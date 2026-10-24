import { and, eq } from 'drizzle-orm'
import type { Context, MiddlewareHandler } from 'hono'
import { auth } from './auth.js'
import { db } from './db/cliente.js'
import { enExplotacion, type Transaccion } from './db/explotacion.js'
import { member, organization, type RolExplotacion } from './db/schema/index.js'
import { ErrorApi } from './errores.js'

// Autorización por explotación y rol (docs/diseno.md, "Usuarios y accesos"). Los permisos se aplican
// siempre aquí, en el backend; el frontend solo oculta lo que el usuario no puede hacer.
//
//   createRoute({ path: '/explotaciones/{explotacionId}/animales', middleware: [permitir('animales')] })
//   ... (c) => enLaExplotacion(c, (tx) => tx.select().from(animales))

// Módulos de una explotación y los roles que acceden a cada uno
export const PERMISOS = {
  animales: ['administrador', 'empleado'],
  comida: ['administrador', 'empleado'],
  fincas: ['administrador', 'empleado'],
  finanzas: ['administrador'],
  // Gestión del equipo y de los datos de la explotación
  administracion: ['administrador'],
} as const satisfies Record<string, readonly RolExplotacion[]>

export type Modulo = keyof typeof PERMISOS

export const MODULOS = Object.keys(PERMISOS) as Modulo[]

export const puedeAcceder = (rol: RolExplotacion, modulo: Modulo) =>
  (PERMISOS[modulo] as readonly RolExplotacion[]).includes(rol)

type Sesion = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

export type VariablesSesion = {
  usuario: Sesion['user']
  sesion: Sesion['session']
}

export type EnvSesion = { Variables: VariablesSesion }

export type EnvExplotacion = {
  Variables: VariablesSesion & {
    explotacion: {
      id: string
      nombre: string
      rega: string
      municipio: string | null
      provincia: string | null
    }
    rol: RolExplotacion
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Sesión de Better Auth de la petición: 401 si no la hay y 403 si la contraseña es temporal. La deja
// en el contexto y devuelve el usuario.
async function cargarSesion<E extends EnvSesion>(c: Context<E>) {
  const sesion = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!sesion) throw new ErrorApi(401, 'no_autenticado', 'Tienes que iniciar sesión')
  if (sesion.user.debeCambiarContrasena) {
    throw new ErrorApi(
      403,
      'cambio_contrasena_obligatorio',
      'Tienes que cambiar la contraseña temporal antes de seguir',
    )
  }
  const contexto = c as unknown as Context<EnvSesion>
  contexto.set('usuario', sesion.user)
  contexto.set('sesion', sesion.session)
  return sesion.user
}

// Solo exige sesión
export const requiereSesion = (): MiddlewareHandler<EnvSesion> => async (c, next) => {
  await cargarSesion(c)
  await next()
}

// Rutas de la plataforma (crear explotaciones…): solo el propietario
export const soloPropietario = (): MiddlewareHandler<EnvSesion> => async (c, next) => {
  const usuario = await cargarSesion(c)
  if (!usuario.propietario) {
    throw new ErrorApi(403, 'sin_permiso', 'Solo el propietario de la plataforma puede hacer esto')
  }
  await next()
}

// Rutas /explotaciones/{explotacionId}/...: exige pertenecer a la explotación y, si se indica un
// módulo, que el rol tenga acceso a él. 404 si no existe o no se pertenece a ella (no se revela si
// existe), 403 si está desactivada o si el rol no alcanza. El propietario de la plataforma no tiene acceso a los datos de
// una explotación si no es miembro.
export const permitir =
  (modulo?: Modulo, parametro = 'explotacionId'): MiddlewareHandler<EnvExplotacion> =>
  async (c, next) => {
    const usuario = await cargarSesion(c)
    const explotacionId = c.req.param(parametro) ?? ''
    const noEncontrada = new ErrorApi(404, 'explotacion_no_encontrada', 'No existe la explotación')
    if (!UUID.test(explotacionId)) throw noEncontrada

    const [fila] = await db
      .select({
        id: organization.id,
        nombre: organization.name,
        rega: organization.rega,
        municipio: organization.municipio,
        provincia: organization.provincia,
        activa: organization.activa,
        rol: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.organizationId, explotacionId), eq(member.userId, usuario.id)))
    if (!fila) throw noEncontrada
    if (!fila.activa) {
      throw new ErrorApi(403, 'explotacion_desactivada', 'Esta explotación está desactivada')
    }

    const rol = fila.rol as RolExplotacion
    if (modulo && !puedeAcceder(rol, modulo)) {
      throw new ErrorApi(403, 'sin_permiso', 'Tu rol en esta explotación no da acceso a esto')
    }

    c.set('explotacion', {
      id: fila.id,
      nombre: fila.nombre,
      rega: fila.rega,
      municipio: fila.municipio,
      provincia: fila.provincia,
    })
    c.set('rol', rol)
    await next()
  }

// Ejecuta fn con los datos de la explotación de la petición: Row-Level Security con esa explotación
// y el usuario en la auditoría
export const enLaExplotacion = <T>(
  c: Context<EnvExplotacion>,
  fn: (tx: Transaccion) => Promise<T>,
) => enExplotacion({ explotacionId: c.var.explotacion.id, usuarioId: c.var.usuario.id }, fn)
