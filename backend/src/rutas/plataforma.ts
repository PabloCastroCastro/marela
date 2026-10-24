import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { asc, count, eq } from 'drizzle-orm'
import { db } from '../db/cliente.js'
import { member, organization } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  cambiarActiva,
  crearExplotacion,
  DatosExplotacion,
  PrimerAdministrador,
} from '../explotaciones.js'
import { type EnvSesion, soloPropietario } from '../permisos.js'

// Gestión de la plataforma por su propietario: las explotaciones y su primer administrador (GH-11).
// El propietario no ve los datos de una explotación si no es miembro de ella.

const ExplotacionPlataforma = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    rega: z.string(),
    municipio: z.string().nullable(),
    provincia: z.string().nullable(),
    activa: z.boolean(),
    miembros: z.number().int(),
    creadaEn: z.iso.datetime(),
  })
  .openapi('ExplotacionPlataforma')

const NuevaExplotacion = DatosExplotacion.extend({ administrador: PrimerAdministrador }).openapi(
  'NuevaExplotacion',
)

const ExplotacionCreada = z
  .object({
    explotacion: ExplotacionPlataforma,
    administrador: z.object({ id: z.uuid(), usuario: z.string(), nombre: z.string() }),
    contrasenaTemporal: z.string().optional().openapi({
      description: 'Solo si el administrador es un usuario nuevo. No se puede volver a consultar.',
    }),
  })
  .openapi('ExplotacionCreada')

const ParametrosExplotacion = z.object({
  explotacionId: z.uuid().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const comunes = {
  401: error('Sin sesión'),
  403: error('No es el propietario de la plataforma (sin_permiso)'),
}

const listar = createRoute({
  method: 'get',
  path: '/plataforma/explotaciones',
  tags: ['Plataforma'],
  summary: 'Todas las explotaciones, activas y desactivadas',
  security: [{ sesion: [] }],
  middleware: [soloPropietario()] as const,
  responses: {
    200: {
      description: 'Ordenadas por nombre',
      content: { 'application/json': { schema: z.array(ExplotacionPlataforma) } },
    },
    ...comunes,
  },
})

const crear = createRoute({
  method: 'post',
  path: '/plataforma/explotaciones',
  tags: ['Plataforma'],
  summary: 'Crear una explotación con su primer administrador',
  description:
    'El administrador puede ser un usuario nuevo, que recibe una contraseña temporal, o uno existente, por su nombre de usuario.',
  security: [{ sesion: [] }],
  middleware: [soloPropietario()] as const,
  request: {
    body: { content: { 'application/json': { schema: NuevaExplotacion } }, required: true },
  },
  responses: {
    201: {
      description: 'Creada',
      content: { 'application/json': { schema: ExplotacionCreada } },
    },
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    404: error('El usuario existente no existe o está desactivado (usuario_no_encontrado)'),
    409: error('REGA, usuario o email ya en uso (rega_en_uso, usuario_en_uso, email_en_uso)'),
  },
})

const cambiarEstado = createRoute({
  method: 'patch',
  path: '/plataforma/explotaciones/{explotacionId}',
  tags: ['Plataforma'],
  summary: 'Desactivar o reactivar una explotación',
  description:
    'Una explotación desactivada desaparece para sus miembros, que no pueden entrar en ella. No se borra ningún dato.',
  security: [{ sesion: [] }],
  middleware: [soloPropietario()] as const,
  request: {
    params: ParametrosExplotacion,
    body: {
      content: { 'application/json': { schema: z.object({ activa: z.boolean() }) } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'La explotación',
      content: { 'application/json': { schema: ExplotacionPlataforma } },
    },
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    404: error('No existe la explotación (explotacion_no_encontrada)'),
  },
})

async function explotacionesConMiembros(id?: string) {
  const filas = await db
    .select({
      id: organization.id,
      nombre: organization.name,
      rega: organization.rega,
      municipio: organization.municipio,
      provincia: organization.provincia,
      activa: organization.activa,
      creadaEn: organization.createdAt,
      miembros: count(member.id),
    })
    .from(organization)
    .leftJoin(member, eq(member.organizationId, organization.id))
    .where(id ? eq(organization.id, id) : undefined)
    .groupBy(organization.id)
    .orderBy(asc(organization.name))
  return filas.map((f) => ({ ...f, creadaEn: f.creadaEn.toISOString() }))
}

async function unaExplotacion(id: string) {
  const [e] = await explotacionesConMiembros(id)
  if (!e) throw new Error('La explotación acaba de crearse o cambiarse y no aparece')
  return e
}

export const rutasPlataforma = () =>
  new OpenAPIHono<EnvSesion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => c.json(await explotacionesConMiembros(), 200))
    .openapi(crear, async (c) => {
      const { administrador, ...datos } = c.req.valid('json')
      const creada = await crearExplotacion(datos, administrador, c.var.usuario.id)
      return c.json(
        {
          explotacion: await unaExplotacion(creada.explotacion.id),
          administrador: {
            id: creada.administrador.id,
            usuario: creada.administrador.username ?? '',
            nombre: creada.administrador.name,
          },
          ...(creada.contrasenaTemporal ? { contrasenaTemporal: creada.contrasenaTemporal } : {}),
        },
        201,
      )
    })
    .openapi(cambiarEstado, async (c) => {
      const { explotacionId } = c.req.valid('param')
      await cambiarActiva(explotacionId, c.req.valid('json').activa)
      return c.json(await unaExplotacion(explotacionId), 200)
    })
