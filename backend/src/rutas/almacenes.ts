import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  CambioEstadoAlmacen,
  cambiarEstadoAlmacen,
  crearAlmacen,
  DatosAlmacen,
  editarAlmacen,
  listarAlmacenes,
  verAlmacen,
} from '../almacenes.js'
import { TIPOS_ALMACEN, UNIDADES_ALMACEN } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Almacenes de comida de la explotación (GH-29). Los ven todos los que acceden a Comida; los crea,
// edita y desactiva el administrador.

export const Almacen = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    tipo: z.enum(TIPOS_ALMACEN).openapi({ description: 'Qué comida guarda' }),
    unidad: z.enum(UNIDADES_ALMACEN),
    activo: z.boolean(),
    stock: z.number().openapi({
      description: 'Cantidad actual, en su unidad, de sus movimientos. Puede ser negativa.',
    }),
    conMovimientos: z
      .boolean()
      .openapi({ description: 'Si tiene movimientos, la unidad no cambia' }),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Almacen')

export const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

export const ParametrosAlmacen = Parametros.extend({
  almacenId: z.uuid().openapi({ param: { name: 'almacenId', in: 'path' } }),
})

const Filtros = z.object({
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
  404: error('No existe la explotación o el almacén (almacen_no_encontrado)'),
}

const soloAdministrador = error('Sin acceso a la explotación, o no es su administrador')

const ruta = '/explotaciones/{explotacionId}/almacenes'
const cuerpo = { content: { 'application/json': { schema: DatosAlmacen } }, required: true }

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Comida'],
  summary: 'Almacenes de comida de la explotación, con su stock',
  security: [{ sesion: [] }],
  middleware: [permitir('comida')] as const,
  request: { params: Parametros, query: Filtros },
  responses: {
    200: json(z.array(Almacen), 'En el orden en que se crearon'),
    ...comunes,
    403: error('Sin acceso a la explotación o a su comida'),
  },
})

const ver = createRoute({
  method: 'get',
  path: `${ruta}/{almacenId}`,
  tags: ['Comida'],
  summary: 'Un almacén, con su stock',
  security: [{ sesion: [] }],
  middleware: [permitir('comida')] as const,
  request: { params: ParametrosAlmacen },
  responses: {
    200: json(Almacen, 'El almacén'),
    ...comunes,
    403: error('Sin acceso a la explotación o a su comida'),
  },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Comida'],
  summary: 'Crear un almacén (administrador)',
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(Almacen, 'El almacén creado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    403: soloAdministrador,
    409: error('Ya hay un almacén con ese nombre (nombre_en_uso)'),
  },
})

const editar = createRoute({
  method: 'put',
  path: `${ruta}/{almacenId}`,
  tags: ['Comida'],
  summary: 'Cambiar el nombre, el tipo o la unidad de un almacén (administrador)',
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  request: { params: ParametrosAlmacen, body: cuerpo },
  responses: {
    200: json(Almacen, 'El almacén actualizado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    403: soloAdministrador,
    409: error(
      'Ya hay un almacén con ese nombre, o cambia la unidad de uno con movimientos (nombre_en_uso, unidad_con_movimientos)',
    ),
  },
})

const estado = createRoute({
  method: 'patch',
  path: `${ruta}/{almacenId}/estado`,
  tags: ['Comida'],
  summary: 'Desactivar o reactivar un almacén (administrador)',
  description: 'Un almacén no se borra: se desactiva, y sus datos y su historial se conservan.',
  security: [{ sesion: [] }],
  middleware: [permitir('administracion')] as const,
  request: {
    params: ParametrosAlmacen,
    body: { content: { 'application/json': { schema: CambioEstadoAlmacen } }, required: true },
  },
  responses: { 200: json(Almacen, 'El almacén'), ...comunes, 403: soloAdministrador },
})

export const rutasAlmacenes = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => listarAlmacenes(tx, c.req.valid('query'))), 200),
    )
    .openapi(ver, async (c) => {
      const { almacenId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verAlmacen(tx, almacenId)), 200)
    })
    .openapi(crear, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => crearAlmacen(tx, c.req.valid('json'))), 201),
    )
    .openapi(editar, async (c) => {
      const { almacenId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => editarAlmacen(tx, almacenId, datos)), 200)
    })
    .openapi(estado, async (c) => {
      const { almacenId } = c.req.valid('param')
      const { activo } = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => cambiarEstadoAlmacen(tx, almacenId, activo)),
        200,
      )
    })
