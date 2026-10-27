import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db/cliente.js'
import { member, organization, ROLES_EXPLOTACION } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { actualizarExplotacion, DatosExplotacion } from '../explotaciones.js'
import {
  type EnvExplotacion,
  type EnvSesion,
  MODULOS,
  permitir,
  puedeAcceder,
  requiereSesion,
} from '../permisos.js'

// Explotaciones del usuario: la lista para elegir con cuál trabajar, y los datos y permisos de una.
// El administrador edita los datos de la suya.

const Rol = z.enum(ROLES_EXPLOTACION).openapi('RolExplotacion')

const ExplotacionDelUsuario = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    rega: z.string().openapi({ example: 'ES150780000001' }),
    rol: Rol,
  })
  .openapi('ExplotacionDelUsuario')

const DetalleExplotacion = ExplotacionDelUsuario.extend({
  municipio: z.string().nullable(),
  provincia: z.string().nullable(),
  modulos: z.array(z.enum(MODULOS)).openapi({
    description: 'Partes de la explotación a las que da acceso el rol',
    example: ['animales', 'comida', 'fincas'],
  }),
}).openapi('DetalleExplotacion')

const ParametrosExplotacion = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const listar = createRoute({
  method: 'get',
  path: '/explotaciones',
  tags: ['Explotaciones'],
  summary: 'Explotaciones activas a las que el usuario tiene acceso, con su rol',
  security: [{ sesion: [] }],
  middleware: [requiereSesion()] as const,
  responses: {
    200: {
      description: 'Ordenadas por nombre',
      content: { 'application/json': { schema: z.array(ExplotacionDelUsuario) } },
    },
    401: error('Sin sesión'),
    403: error('Contraseña temporal sin cambiar (cambio_contrasena_obligatorio)'),
  },
})

const respuestasExplotacion = {
  401: error('Sin sesión'),
  403: error(
    'Contraseña temporal sin cambiar (cambio_contrasena_obligatorio), explotación o miembro desactivados (explotacion_desactivada, miembro_desactivado) o sin permiso (sin_permiso)',
  ),
  404: error('No existe o el usuario no pertenece a ella (explotacion_no_encontrada)'),
}

const detalle = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}',
  tags: ['Explotaciones'],
  summary: 'Datos de una explotación y permisos del usuario en ella',
  security: [{ sesion: [] }],
  middleware: [permitir()] as const,
  request: { params: ParametrosExplotacion },
  responses: {
    200: {
      description: 'La explotación',
      content: { 'application/json': { schema: DetalleExplotacion } },
    },
    ...respuestasExplotacion,
  },
})

const editar = createRoute({
  method: 'patch',
  path: '/explotaciones/{explotacionId}',
  tags: ['Explotaciones'],
  summary: 'Editar los datos de la explotación (administrador)',
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  request: {
    params: ParametrosExplotacion,
    body: { content: { 'application/json': { schema: DatosExplotacion } }, required: true },
  },
  responses: {
    200: {
      description: 'La explotación actualizada',
      content: { 'application/json': { schema: DetalleExplotacion } },
    },
    400: error('Datos no válidos (validacion)'),
    ...respuestasExplotacion,
    409: error('El código REGA ya es de otra explotación (rega_en_uso)'),
  },
})

const modulosDe = (rol: (typeof ROLES_EXPLOTACION)[number]) =>
  MODULOS.filter((m) => puedeAcceder(rol, m))

export const rutasExplotaciones = () =>
  new OpenAPIHono<EnvSesion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const filas = await db
        .select({
          id: organization.id,
          nombre: organization.name,
          rega: organization.rega,
          rol: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(
          and(
            eq(member.userId, c.var.usuario.id),
            eq(member.activo, true),
            eq(organization.activa, true),
          ),
        )
        .orderBy(asc(organization.name))
      return c.json(
        filas.map((f) => ({ ...f, rol: Rol.parse(f.rol) })),
        200,
      )
    })
    .route(
      '/',
      new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
        .openapi(detalle, (c) =>
          c.json({ ...c.var.explotacion, rol: c.var.rol, modulos: modulosDe(c.var.rol) }, 200),
        )
        .openapi(editar, async (c) => {
          const e = await actualizarExplotacion(c.var.explotacion.id, c.req.valid('json'))
          return c.json(
            {
              id: e.id,
              nombre: e.name,
              rega: e.rega,
              municipio: e.municipio,
              provincia: e.provincia,
              rol: c.var.rol,
              modulos: modulosDe(c.var.rol),
            },
            200,
          )
        }),
    )
