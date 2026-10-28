import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ConsultaCatastro,
  ConsultaMunicipio,
  ConsultaRecinto,
  consultarCatastro,
  consultarRecinto,
  situarMunicipio,
} from '../cartografia.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { Contorno } from '../fincas.js'
import { type EnvExplotacion, permitir } from '../permisos.js'

// Consultas a SIGPAC, Catastro y CartoCiudad para rellenar las parcelas de una finca (GH-52). No
// tocan la base de datos: solo traducen lo que devuelven esos servicios.

const Recinto = z
  .object({
    provincia: z.string(),
    municipio: z.string(),
    agregado: z.string(),
    zona: z.string(),
    poligono: z.string(),
    parcela: z.string(),
    recinto: z.string(),
    superficie: z.number().openapi({ description: 'Hectáreas' }),
    uso: z.string().nullable().openapi({ description: 'Uso SIGPAC: PS, TA...' }),
    contorno: Contorno,
    referenciaCatastral: z.string().nullable().openapi({
      description: 'La de la parcela catastral en la que está, si el Catastro responde',
    }),
    nombreMunicipio: z.string().nullable(),
    nombreProvincia: z.string().nullable(),
  })
  .openapi('RecintoSigpac')

const ParcelaCatastral = z
  .object({
    referenciaCatastral: z.string(),
    superficie: z.number().nullable().openapi({ description: 'Hectáreas' }),
    contorno: Contorno.nullable(),
    nombreMunicipio: z.string().nullable(),
    nombreProvincia: z.string().nullable(),
  })
  .openapi('ParcelaCatastral')

const SituacionMunicipio = z
  .object({
    recuadro: z
      .array(z.number())
      .length(4)
      .nullable()
      .openapi({ description: '[oeste, sur, este, norte], o null si no se encuentra' }),
  })
  .openapi('SituacionMunicipio')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
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
  400: error('Consulta no válida (validacion)'),
  401: error('Sin sesión'),
  403: error('Sin acceso a la explotación o a sus fincas'),
  404: error('No existe la explotación'),
  502: error('El servicio no responde (servicio_no_disponible)'),
}

const ruta = '/explotaciones/{explotacionId}/cartografia'

const recinto = createRoute({
  method: 'get',
  path: `${ruta}/recinto`,
  tags: ['Fincas'],
  summary: 'Recinto SIGPAC en un punto del mapa o con una referencia',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros, query: ConsultaRecinto },
  responses: {
    200: json(Recinto, 'El recinto'),
    ...comunes,
    404: error('No hay recinto ahí o con esa referencia (recinto_no_encontrado)'),
  },
})

const catastro = createRoute({
  method: 'get',
  path: `${ruta}/catastro`,
  tags: ['Fincas'],
  summary: 'Superficie, municipio y contorno de una parcela catastral',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros, query: ConsultaCatastro },
  responses: {
    200: json(ParcelaCatastral, 'La parcela'),
    ...comunes,
    404: error('No existe esa referencia (parcela_no_encontrada)'),
  },
})

const municipio = createRoute({
  method: 'get',
  path: `${ruta}/municipio`,
  tags: ['Fincas'],
  summary: 'Dónde está un municipio, para centrar el mapa',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros, query: ConsultaMunicipio },
  responses: { 200: json(SituacionMunicipio, 'Su recuadro'), ...comunes },
})

export const rutasCartografia = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(recinto, async (c) => c.json(await consultarRecinto(c.req.valid('query')), 200))
    .openapi(catastro, async (c) => c.json(await consultarCatastro(c.req.valid('query')), 200))
    .openapi(municipio, async (c) => c.json(await situarMunicipio(c.req.valid('query')), 200))
