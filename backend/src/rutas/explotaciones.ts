import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db/cliente.js'
import { member, organization, ROLES_EXPLOTACION } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  type EnvExplotacion,
  type EnvSesion,
  MODULOS,
  permitir,
  puedeAcceder,
  requiereSesion,
} from '../permisos.js'

// Explotaciones del usuario: la lista para elegir con cuál trabajar, y los datos y permisos de una

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
  summary: 'Explotaciones a las que pertenece el usuario, con su rol',
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
    401: error('Sin sesión'),
    403: error('Contraseña temporal sin cambiar (cambio_contrasena_obligatorio)'),
    404: error('No existe o el usuario no pertenece a ella (explotacion_no_encontrada)'),
  },
})

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
        .where(eq(member.userId, c.var.usuario.id))
        .orderBy(asc(organization.name))
      return c.json(
        filas.map((f) => ({ ...f, rol: Rol.parse(f.rol) })),
        200,
      )
    })
    .route(
      '/',
      new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida }).openapi(detalle, (c) =>
        c.json(
          {
            ...c.var.explotacion,
            rol: c.var.rol,
            modulos: MODULOS.filter((m) => puedeAcceder(c.var.rol, m)),
          },
          200,
        ),
      ),
    )
