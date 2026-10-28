import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  borrarPastoreo,
  CambioPastoreo,
  corregirPastoreo,
  crearPastoreo,
  DatosPastoreo,
  DatosSalida,
  listarPastoreos,
  registrarSalida,
} from '../pastoreos.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Pastoreos de las fincas (GH-28)

const Pastoreo = z
  .object({
    id: z.uuid(),
    fincaId: z.uuid(),
    fechaEntrada: z.iso.date(),
    fechaSalida: z.iso.date().nullable().openapi({ description: 'Sin ella, sigue en curso' }),
    animales: z.number().int(),
    observaciones: z.string().nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Pastoreo')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosFinca = Parametros.extend({
  fincaId: z.uuid().openapi({ param: { name: 'fincaId', in: 'path' } }),
})

const ParametrosPastoreo = Parametros.extend({
  pastoreoId: z.uuid().openapi({ param: { name: 'pastoreoId', in: 'path' } }),
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
  404: error('No existe la explotación, la finca o el pastoreo (pastoreo_no_encontrado)'),
}

const enCurso = error('La finca ya tiene un pastoreo en curso (pastoreo_en_curso)')

const ruta = '/explotaciones/{explotacionId}/pastoreos'

const listar = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/fincas/{fincaId}/pastoreos',
  tags: ['Fincas'],
  summary: 'Pastoreos de una finca',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosFinca },
  responses: {
    200: json(z.array(Pastoreo), 'El que está en curso y luego del más reciente al más antiguo'),
    ...comunes,
  },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Fincas'],
  summary: 'Registrar la entrada de animales a pastar en una finca',
  description: 'Con fecha de salida, un pastoreo que ya terminó.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosPastoreo } }, required: true },
  },
  responses: {
    201: json(Pastoreo, 'Registrado'),
    400: error('Datos no válidos, finca desactivada o de otra explotación (validacion)'),
    ...comunes,
    409: enCurso,
  },
})

const corregir = createRoute({
  method: 'put',
  path: `${ruta}/{pastoreoId}`,
  tags: ['Fincas'],
  summary: 'Corregir un pastoreo',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: ParametrosPastoreo,
    body: { content: { 'application/json': { schema: CambioPastoreo } }, required: true },
  },
  responses: {
    200: json(Pastoreo, 'Corregido'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: enCurso,
  },
})

const salida = createRoute({
  method: 'patch',
  path: `${ruta}/{pastoreoId}/salida`,
  tags: ['Fincas'],
  summary: 'Registrar la salida de los animales',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: ParametrosPastoreo,
    body: { content: { 'application/json': { schema: DatosSalida } }, required: true },
  },
  responses: {
    200: json(Pastoreo, 'Terminado'),
    400: error('Fecha no válida, futura o antes de la entrada (validacion)'),
    ...comunes,
    409: error('Los animales ya salieron (ya_salieron)'),
  },
})

const borrar = createRoute({
  method: 'delete',
  path: `${ruta}/{pastoreoId}`,
  tags: ['Fincas'],
  summary: 'Borrar un pastoreo registrado por error',
  description: 'Queda en el historial de cambios.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosPastoreo },
  responses: { 200: json(Pastoreo, 'El pastoreo borrado, para poder deshacerlo'), ...comunes },
})

export const rutasPastoreos = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { fincaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarPastoreos(tx, fincaId)), 200)
    })
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearPastoreo(tx, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { pastoreoId } = c.req.valid('param')
      const cambio = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => corregirPastoreo(tx, pastoreoId, cambio)), 200)
    })
    .openapi(salida, async (c) => {
      const { pastoreoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => registrarSalida(tx, pastoreoId, datos)), 200)
    })
    .openapi(borrar, async (c) => {
      const { pastoreoId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => borrarPastoreo(tx, pastoreoId)), 200)
    })
