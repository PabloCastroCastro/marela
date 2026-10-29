import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { TIPOS_EQUIPO } from '../db/schema/index.js'
import {
  CambioEstadoEquipo,
  cambiarEstadoEquipo,
  crearEquipo,
  DatosEquipo,
  editarEquipo,
  listarEquipos,
  verEquipo,
} from '../equipos.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Maquinaria e infraestructuras de la explotación (GH-111), en la sección Mantenimiento

const Equipo = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    tipo: z.enum(TIPOS_EQUIPO),
    descripcion: z.string().nullable(),
    necesitaMantenimiento: z.boolean(),
    activo: z.boolean(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Equipo')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

export const ParametrosEquipo = Parametros.extend({
  equipoId: z.uuid().openapi({ param: { name: 'equipoId', in: 'path' } }),
})

const Filtros = z.object({
  q: z.string().optional().openapi({ description: 'Busca en el nombre y la descripción' }),
  tipo: z.enum(TIPOS_EQUIPO).optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .openapi({ description: 'Solo los activos (true) o los desactivados (false); sin él, todos' }),
})

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const comunes = {
  401: error('Sin sesión'),
  403: error('Sin acceso a la explotación o a su mantenimiento'),
  404: error('No existe la explotación o el equipo (equipo_no_encontrado)'),
}

const ruta = '/explotaciones/{explotacionId}/equipos'
const cuerpo = { content: { 'application/json': { schema: DatosEquipo } }, required: true }
const repetido = error('Ya hay un equipo con ese nombre (nombre_en_uso)')

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Mantenimiento'],
  summary: 'Maquinaria e infraestructuras de la explotación',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: Parametros, query: Filtros },
  responses: {
    200: json(z.array(Equipo), 'Los que necesitan mantenimiento primero, y después por nombre'),
    ...comunes,
  },
})

const ver = createRoute({
  method: 'get',
  path: `${ruta}/{equipoId}`,
  tags: ['Mantenimiento'],
  summary: 'Un equipo',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: ParametrosEquipo },
  responses: { 200: json(Equipo, 'El equipo'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Mantenimiento'],
  summary: 'Dar de alta una máquina o una infraestructura',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(Equipo, 'El equipo creado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: repetido,
  },
})

const editar = createRoute({
  method: 'put',
  path: `${ruta}/{equipoId}`,
  tags: ['Mantenimiento'],
  summary: 'Cambiar los datos de un equipo',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: ParametrosEquipo, body: cuerpo },
  responses: {
    200: json(Equipo, 'El equipo actualizado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: repetido,
  },
})

const estado = createRoute({
  method: 'patch',
  path: `${ruta}/{equipoId}/estado`,
  tags: ['Mantenimiento'],
  summary: 'Desactivar o reactivar un equipo',
  description: 'Un equipo no se borra: se desactiva, y sus datos y su historial se conservan.',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: {
    params: ParametrosEquipo,
    body: { content: { 'application/json': { schema: CambioEstadoEquipo } }, required: true },
  },
  responses: { 200: json(Equipo, 'El equipo'), ...comunes },
})

export const rutasEquipos = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => listarEquipos(tx, c.req.valid('query'))), 200),
    )
    .openapi(ver, async (c) => {
      const { equipoId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verEquipo(tx, equipoId)), 200)
    })
    .openapi(crear, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => crearEquipo(tx, c.req.valid('json'))), 201),
    )
    .openapi(editar, async (c) => {
      const { equipoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => editarEquipo(tx, equipoId, datos)), 200)
    })
    .openapi(estado, async (c) => {
      const { equipoId } = c.req.valid('param')
      const { activo } = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => cambiarEstadoEquipo(tx, equipoId, activo)),
        200,
      )
    })
