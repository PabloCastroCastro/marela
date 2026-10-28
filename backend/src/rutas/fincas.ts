import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { REGIMENES_FINCA } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  CambioEstadoFinca,
  Contorno,
  cambiarEstadoFinca,
  crearFinca,
  DatosFinca,
  editarFinca,
  listarFincas,
  verFinca,
} from '../fincas.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Fincas de la explotación (GH-25)

const Finca = z
  .object({
    id: z.uuid(),
    nombre: z.string(),
    municipio: z.string().nullable(),
    provincia: z.string().nullable(),
    regimen: z.enum(REGIMENES_FINCA),
    observaciones: z.string().nullable(),
    activa: z.boolean(),
    superficie: z.number().openapi({ description: 'Hectáreas: la suma de sus parcelas' }),
    numeroParcelas: z.number().int(),
    finSeguridad: z.iso.date().nullable().openapi({
      description:
        'Fin del plazo de seguridad en curso: hasta ese día no se cosecha ni se pasta (null si no hay)',
    }),
    pastoreo: z
      .object({ id: z.uuid(), desde: z.iso.date(), animales: z.number().int() })
      .nullable()
      .openapi({
        description: 'Pastoreo en curso: desde cuándo y cuántos animales (null si no hay)',
      }),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Finca')

const FincaDetalle = Finca.extend({
  parcelas: z.array(
    z.object({
      id: z.uuid(),
      provincia: z.string().nullable(),
      municipio: z.string().nullable(),
      agregado: z.string().nullable(),
      zona: z.string().nullable(),
      poligono: z.string().nullable(),
      parcela: z.string().nullable(),
      recinto: z.string().nullable(),
      referenciaCatastral: z.string().nullable(),
      superficie: z.number(),
      uso: z.string().nullable().openapi({ description: 'Uso SIGPAC: PS, TA...' }),
      contorno: Contorno.nullable(),
    }),
  ),
}).openapi('FincaDetalle')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosFinca = Parametros.extend({
  fincaId: z.uuid().openapi({ param: { name: 'fincaId', in: 'path' } }),
})

const Filtros = z.object({
  q: z.string().optional().openapi({ description: 'Busca en el nombre y el municipio' }),
  activa: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .openapi({ description: 'Solo las activas (true) o las desactivadas (false); sin él, todas' }),
  seguridad: z
    .enum(['en_curso'])
    .optional()
    .openapi({ description: 'Solo las que tienen un plazo de seguridad en curso' }),
  pastoreo: z
    .enum(['en_curso'])
    .optional()
    .openapi({ description: 'Solo las que tienen animales pastando' }),
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
  403: error('Sin acceso a la explotación o a sus fincas'),
  404: error('No existe la explotación o la finca (finca_no_encontrada)'),
}

const ruta = '/explotaciones/{explotacionId}/fincas'
const cuerpo = { content: { 'application/json': { schema: DatosFinca } }, required: true }
const repetida = error(
  'Ya hay una finca con ese nombre o el recinto SIGPAC está en otra finca (nombre_en_uso, recinto_en_uso)',
)

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Fincas'],
  summary: 'Fincas de la explotación, con búsqueda y filtro',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros, query: Filtros },
  responses: { 200: json(z.array(Finca), 'Ordenadas por nombre'), ...comunes },
})

const ver = createRoute({
  method: 'get',
  path: `${ruta}/{fincaId}`,
  tags: ['Fincas'],
  summary: 'Ficha de una finca, con sus parcelas',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosFinca },
  responses: { 200: json(FincaDetalle, 'La ficha'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Fincas'],
  summary: 'Dar de alta una finca con sus parcelas',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(FincaDetalle, 'La ficha creada'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: repetida,
  },
})

const editar = createRoute({
  method: 'put',
  path: `${ruta}/{fincaId}`,
  tags: ['Fincas'],
  summary: 'Cambiar los datos y las parcelas de una finca',
  description:
    'Las parcelas con id se corrigen, las nuevas se añaden y las que no llegan se quitan.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosFinca, body: cuerpo },
  responses: {
    200: json(FincaDetalle, 'La ficha actualizada'),
    400: error('Datos no válidos o una parcela de otra finca (validacion)'),
    ...comunes,
    409: repetida,
  },
})

const estado = createRoute({
  method: 'patch',
  path: `${ruta}/{fincaId}/estado`,
  tags: ['Fincas'],
  summary: 'Desactivar o reactivar una finca',
  description: 'Una finca no se borra: se desactiva, y sus datos y su historial se conservan.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: ParametrosFinca,
    body: { content: { 'application/json': { schema: CambioEstadoFinca } }, required: true },
  },
  responses: { 200: json(FincaDetalle, 'La ficha'), ...comunes },
})

export const rutasFincas = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => listarFincas(tx, c.req.valid('query'))), 200),
    )
    .openapi(ver, async (c) => {
      const { fincaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verFinca(tx, fincaId)), 200)
    })
    .openapi(crear, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => crearFinca(tx, c.req.valid('json'))), 201),
    )
    .openapi(editar, async (c) => {
      const { fincaId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => editarFinca(tx, fincaId, datos)), 200)
    })
    .openapi(estado, async (c) => {
      const { fincaId } = c.req.valid('param')
      const { activa } = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => cambiarEstadoFinca(tx, fincaId, activa)), 200)
    })
