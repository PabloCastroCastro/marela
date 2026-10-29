import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  anularAplicacion,
  crearAplicaciones,
  DatosAplicacion,
  listarAplicaciones,
  opcionesAplicacion,
} from '../aplicaciones.js'
import { TIPOS_ABONO, TIPOS_APLICACION, UNIDADES_DOSIS } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import { DatosAnulacion } from '../tratamientos.js'

// Abonados y tratamientos fitosanitarios de las fincas (GH-27)

const Aplicacion = z
  .object({
    id: z.uuid(),
    fincaId: z.uuid(),
    tipo: z.enum(TIPOS_APLICACION),
    fecha: z.iso.date(),
    producto: z.string(),
    tipoAbono: z.enum(TIPOS_ABONO).nullable(),
    dosis: z.number(),
    unidadDosis: z.enum(UNIDADES_DOSIS),
    superficie: z.number().openapi({ description: 'Hectáreas tratadas' }),
    aplicadoPor: z
      .object({
        id: z.uuid().nullable().openapi({ description: 'Sin él, es un nombre escrito a mano' }),
        nombre: z.string(),
      })
      .nullable(),
    lote: z.string().nullable(),
    plaga: z.string().nullable(),
    diasSeguridad: z.number().int(),
    finSeguridad: z.iso.date().openapi({
      description:
        'Día en que termina el plazo de seguridad (la fecha más los días): desde él se puede cosechar o pastar',
    }),
    ropo: z.string().nullable(),
    equipo: z.string().nullable(),
    observaciones: z.string().nullable(),
    anulacion: z.object({ en: z.iso.datetime(), por: z.string(), motivo: z.string() }).nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Aplicacion')

const OpcionesAplicacion = z
  .object({
    personas: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
    abonos: z.array(z.string()),
    fitosanitarios: z.array(z.string()),
    plagas: z.array(z.string()),
    equipos: z.array(z.string()),
  })
  .openapi('OpcionesAplicacion')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosFinca = Parametros.extend({
  fincaId: z.uuid().openapi({ param: { name: 'fincaId', in: 'path' } }),
})

const ParametrosAplicacion = Parametros.extend({
  aplicacionId: z.uuid().openapi({ param: { name: 'aplicacionId', in: 'path' } }),
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
  404: error(
    'No existe la explotación, la finca o el abonado o tratamiento (aplicacion_no_encontrada)',
  ),
}

const ruta = '/explotaciones/{explotacionId}/aplicaciones'

const listar = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/fincas/{fincaId}/aplicaciones',
  tags: ['Fincas'],
  summary: 'Abonados y tratamientos fitosanitarios de una finca',
  description: 'También los anulados, con su anulación.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: ParametrosFinca },
  responses: {
    200: json(z.array(Aplicacion), 'Del más reciente al más antiguo'),
    ...comunes,
  },
})

const opciones = createRoute({
  method: 'get',
  path: `${ruta}/opciones`,
  tags: ['Fincas'],
  summary: 'Personas del equipo y productos, plagas y equipos ya usados, para el formulario',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: { params: Parametros },
  responses: { 200: json(OpcionesAplicacion, 'Ordenados'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Fincas'],
  summary: 'Registrar un abonado o tratamiento fitosanitario en una o varias fincas',
  description:
    'Crea uno por finca. Sin superficie, cada uno con la de su finca entera; con superficie, solo para una finca. Con ids (uno por finca), los registrados sin conexión: si ya se guardaron, se devuelven los mismos.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosAplicacion } }, required: true },
  },
  responses: {
    201: json(z.array(Aplicacion), 'Registrados'),
    400: error('Datos no válidos, fincas desactivadas o de otra explotación (validacion)'),
    ...comunes,
    409: error('Algún id es de otro registro (id_en_uso)'),
  },
})

const anular = createRoute({
  method: 'post',
  path: `${ruta}/{aplicacionId}/anulacion`,
  tags: ['Fincas'],
  summary: 'Anular un abonado o tratamiento registrado por error',
  description: 'No se borra: queda en la ficha como anulado, con el motivo.',
  security: [{ sesion: [] }],
  middleware: [permitir('fincas')] as const,
  request: {
    params: ParametrosAplicacion,
    body: { content: { 'application/json': { schema: DatosAnulacion } }, required: true },
  },
  responses: {
    200: json(Aplicacion, 'Anulado'),
    400: error('Falta el motivo (validacion)'),
    ...comunes,
    409: error('Ya está anulado (ya_anulado)'),
  },
})

export const rutasAplicaciones = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { fincaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarAplicaciones(tx, fincaId)), 200)
    })
    .openapi(opciones, async (c) => c.json(await enLaExplotacion(c, opcionesAplicacion), 200))
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearAplicaciones(tx, datos)), 201)
    })
    .openapi(anular, async (c) => {
      const { aplicacionId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => anularAplicacion(tx, aplicacionId, datos)),
        200,
      )
    })
