import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { ROLES_EXPLOTACION } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  anadirMiembro,
  CambioMiembro,
  cambiarMiembro,
  listarMiembros,
  NuevoMiembro,
  restablecerContrasenaMiembro,
} from '../miembros.js'
import { type EnvExplotacion, permitir } from '../permisos.js'

// Equipo de la explotación, que gestiona su administrador (GH-12)

const Miembro = z
  .object({
    id: z.uuid().openapi({ description: 'Identificador del miembro (no del usuario)' }),
    usuarioId: z.uuid(),
    usuario: z.string().nullable(),
    nombre: z.string(),
    email: z.string(),
    rol: z.enum(ROLES_EXPLOTACION),
    activo: z.boolean(),
  })
  .openapi('Miembro')

const ConContrasena = z
  .object({
    miembro: Miembro,
    contrasenaTemporal: z.string().optional().openapi({
      description: 'Solo para usuarios nuevos o al restablecerla. No se puede volver a consultar.',
    }),
  })
  .openapi('MiembroConContrasena')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosMiembro = Parametros.extend({
  miembroId: z.uuid().openapi({ param: { name: 'miembroId', in: 'path' } }),
})

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const comunes = {
  401: error('Sin sesión'),
  403: error('No es administrador de la explotación (sin_permiso)'),
}

const listar = createRoute({
  tags: ['Equipo'],
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  method: 'get',
  path: '/explotaciones/{explotacionId}/miembros',
  summary: 'Miembros de la explotación, activos y desactivados',
  request: { params: Parametros },
  responses: {
    200: {
      description: 'Ordenados por nombre',
      content: { 'application/json': { schema: z.array(Miembro) } },
    },
    ...comunes,
    404: error('No existe la explotación o no se pertenece a ella'),
  },
})

const anadir = createRoute({
  tags: ['Equipo'],
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  method: 'post',
  path: '/explotaciones/{explotacionId}/miembros',
  summary: 'Añadir a una persona nueva o a un usuario que ya existe',
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: NuevoMiembro } }, required: true },
  },
  responses: {
    201: { description: 'Añadido', content: { 'application/json': { schema: ConContrasena } } },
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    404: error('El usuario existente no existe o está desactivado (usuario_no_encontrado)'),
    409: error(
      'Usuario o email en uso, o ya es miembro (usuario_en_uso, email_en_uso, ya_es_miembro)',
    ),
  },
})

const cambiar = createRoute({
  tags: ['Equipo'],
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  method: 'patch',
  path: '/explotaciones/{explotacionId}/miembros/{miembroId}',
  summary: 'Cambiar el rol de un miembro, o desactivarlo o reactivarlo',
  description:
    'Un miembro desactivado no puede entrar en la explotación. La explotación nunca se queda sin un administrador activo.',
  request: {
    params: ParametrosMiembro,
    body: { content: { 'application/json': { schema: CambioMiembro } }, required: true },
  },
  responses: {
    200: { description: 'El miembro', content: { 'application/json': { schema: Miembro } } },
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    404: error('No existe el miembro (miembro_no_encontrado)'),
    409: error('Dejaría la explotación sin administradores activos (ultimo_administrador)'),
  },
})

const restablecer = createRoute({
  tags: ['Equipo'],
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  method: 'post',
  path: '/explotaciones/{explotacionId}/miembros/{miembroId}/restablecer-contrasena',
  summary: 'Dar una contraseña temporal nueva a un miembro',
  description:
    'Solo si el miembro pertenece únicamente a esta explotación; si no, lo hace el propietario de la plataforma. Se cierran sus sesiones.',
  request: { params: ParametrosMiembro },
  responses: {
    200: {
      description: 'La contraseña temporal',
      content: { 'application/json': { schema: ConContrasena } },
    },
    ...comunes,
    404: error('No existe el miembro (miembro_no_encontrado)'),
    409: error('Tiene acceso a otras explotaciones o es uno mismo (otras_explotaciones, es_usted)'),
  },
})

const conRol = <T extends { rol: string }>(m: T) => ({
  ...m,
  rol: z.enum(ROLES_EXPLOTACION).parse(m.rol),
})

export const rutasMiembros = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) =>
      c.json((await listarMiembros(c.var.explotacion.id)).map(conRol), 200),
    )
    .openapi(anadir, async (c) => {
      const { miembro, contrasenaTemporal } = await anadirMiembro(
        c.var.explotacion.id,
        c.req.valid('json'),
      )
      return c.json(
        { miembro: conRol(miembro), ...(contrasenaTemporal ? { contrasenaTemporal } : {}) },
        201,
      )
    })
    .openapi(cambiar, async (c) => {
      const { miembroId } = c.req.valid('param')
      const miembro = await cambiarMiembro(c.var.explotacion.id, miembroId, c.req.valid('json'))
      return c.json(conRol(miembro), 200)
    })
    .openapi(restablecer, async (c) => {
      const { miembroId } = c.req.valid('param')
      const { miembro, contrasenaTemporal } = await restablecerContrasenaMiembro(
        c.var.explotacion.id,
        miembroId,
        c.var.usuario.id,
      )
      return c.json({ miembro: conRol(miembro), contrasenaTemporal }, 200)
    })
