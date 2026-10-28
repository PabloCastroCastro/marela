import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { TIPOS_LABOR, UNIDADES_COSECHA } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  borrarLabor,
  CambioLabor,
  corregirLabor,
  crearLabores,
  DatosLabor,
  listarLabores,
  opcionesLabor,
} from '../labores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Siembras, cosechas y otras labores de las fincas (GH-26)

const Labor = z
  .object({
    id: z.uuid(),
    fincaId: z.uuid(),
    tipo: z.enum(TIPOS_LABOR),
    fecha: z.iso.date(),
    cultivo: z.string().nullable(),
    labor: z.string().nullable(),
    superficie: z.number().openapi({ description: 'Hectáreas' }),
    cantidad: z.number().nullable(),
    unidad: z.enum(UNIDADES_COSECHA).nullable(),
    realizadaPor: z
      .object({
        id: z.uuid().nullable().openapi({ description: 'Sin él, es un nombre escrito a mano' }),
        nombre: z.string(),
      })
      .nullable(),
    observaciones: z.string().nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Labor')

const OpcionesLabor = z
  .object({
    personas: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
    cultivos: z.array(z.string()),
    labores: z.array(z.string()),
  })
  .openapi('OpcionesLabor')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosFinca = Parametros.extend({
  fincaId: z.uuid().openapi({ param: { name: 'fincaId', in: 'path' } }),
})

const ParametrosLabor = Parametros.extend({
  laborId: z.uuid().openapi({ param: { name: 'laborId', in: 'path' } }),
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
  404: error('No existe la explotación, la finca o la labor (labor_no_encontrada)'),
}

const ruta = '/explotaciones/{explotacionId}/labores'

const listar = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/fincas/{fincaId}/labores',
  tags: ['Fincas'],
  summary: 'Siembras, cosechas y otras labores de una finca',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosFinca },
  responses: { 200: json(z.array(Labor), 'De la más reciente a la más antigua'), ...comunes },
})

const opciones = createRoute({
  method: 'get',
  path: `${ruta}/opciones`,
  tags: ['Fincas'],
  summary: 'Personas del equipo y cultivos y labores ya usados, para el formulario',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros },
  responses: { 200: json(OpcionesLabor, 'Ordenados'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Fincas'],
  summary: 'Registrar una labor en una o varias fincas',
  description:
    'Crea una por finca. Sin superficie, cada una con la de su finca entera; con superficie, solo para una finca.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosLabor } }, required: true },
  },
  responses: {
    201: json(z.array(Labor), 'Registradas'),
    400: error('Datos no válidos, fincas desactivadas o de otra explotación (validacion)'),
    ...comunes,
  },
})

const corregir = createRoute({
  method: 'put',
  path: `${ruta}/{laborId}`,
  tags: ['Fincas'],
  summary: 'Corregir una labor',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: ParametrosLabor,
    body: { content: { 'application/json': { schema: CambioLabor } }, required: true },
  },
  responses: {
    200: json(Labor, 'Corregida'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
  },
})

const borrar = createRoute({
  method: 'delete',
  path: `${ruta}/{laborId}`,
  tags: ['Fincas'],
  summary: 'Borrar una labor registrada por error',
  description: 'Queda en el historial de cambios.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosLabor },
  responses: { 200: json(Labor, 'La labor borrada, para poder deshacerlo'), ...comunes },
})

export const rutasLabores = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { fincaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarLabores(tx, fincaId)), 200)
    })
    // Antes que /{laborId}, para que "opciones" no se tome por un identificador
    .openapi(opciones, async (c) => c.json(await enLaExplotacion(c, opcionesLabor), 200))
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearLabores(tx, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { laborId } = c.req.valid('param')
      const cambio = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => corregirLabor(tx, laborId, cambio)), 200)
    })
    .openapi(borrar, async (c) => {
      const { laborId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => borrarLabor(tx, laborId)), 200)
    })
