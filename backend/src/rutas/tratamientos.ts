import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { MOTIVOS_TRATAMIENTO, VIAS_ADMINISTRACION } from '../db/schema/index.js'
import { validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import {
  anularTratamiento,
  crearTratamientos,
  DatosAnulacion,
  DatosTratamiento,
  listarTratamientos,
  opcionesTratamiento,
} from '../tratamientos.js'
import { comunes, error, json, ParametrosAnimal } from './animales.js'

// Tratamientos sanitarios (GH-20)

const Tratamiento = z
  .object({
    id: z.uuid(),
    animalId: z.uuid(),
    fecha: z.iso.date(),
    producto: z.string(),
    dosis: z.string().nullable(),
    via: z.enum(VIAS_ADMINISTRACION).nullable(),
    motivo: z.enum(MOTIVOS_TRATAMIENTO),
    diagnostico: z.string().nullable(),
    aplicadoPor: z
      .object({
        id: z.uuid().nullable().openapi({ description: 'Sin él, es un nombre escrito a mano' }),
        nombre: z.string(),
      })
      .nullable(),
    lote: z.string().nullable(),
    diasSupresion: z.number().int(),
    finSupresion: z.iso
      .date()
      .openapi({ description: 'Día en que termina la supresión: la fecha más los días' }),
    observaciones: z.string().nullable(),
    anulacion: z.object({ en: z.iso.datetime(), por: z.string(), motivo: z.string() }).nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Tratamiento')

const OpcionesTratamiento = z
  .object({
    personas: z.array(z.object({ id: z.uuid(), nombre: z.string() })),
    productos: z.array(z.string()),
  })
  .openapi('OpcionesTratamiento')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosTratamiento = Parametros.extend({
  tratamientoId: z.uuid().openapi({ param: { name: 'tratamientoId', in: 'path' } }),
})

const ruta = '/explotaciones/{explotacionId}/tratamientos'

const listar = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/animales/{animalId}/tratamientos',
  tags: ['Animales'],
  summary: 'Tratamientos de un animal',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosAnimal },
  responses: {
    200: json(z.array(Tratamiento), 'Del más reciente al más antiguo, anulados incluidos'),
    ...comunes,
  },
})

const opciones = createRoute({
  method: 'get',
  path: `${ruta}/opciones`,
  tags: ['Animales'],
  summary: 'Personas del equipo y productos ya usados, para el formulario',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: Parametros },
  responses: { 200: json(OpcionesTratamiento, 'Ordenados por nombre'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Animales'],
  summary: 'Registrar un tratamiento a uno o varios animales',
  description: 'Crea un tratamiento por animal, todos con los mismos datos.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosTratamiento } }, required: true },
  },
  responses: {
    201: json(z.array(Tratamiento), 'Registrados, en el orden de los animales'),
    400: error(
      'Datos no válidos, animales de otra explotación o fecha fuera de su vida (validacion)',
    ),
    ...comunes,
  },
})

const anular = createRoute({
  method: 'post',
  path: `${ruta}/{tratamientoId}/anulacion`,
  tags: ['Animales'],
  summary: 'Anular un tratamiento registrado por error',
  description: 'No se borra: queda en la ficha como anulado, con el motivo.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: ParametrosTratamiento,
    body: { content: { 'application/json': { schema: DatosAnulacion } }, required: true },
  },
  responses: {
    200: json(Tratamiento, 'Anulado'),
    400: error('Falta el motivo (validacion)'),
    ...comunes,
    404: error('No existe la explotación o el tratamiento (tratamiento_no_encontrado)'),
    409: error('Ya está anulado (ya_anulado)'),
  },
})

export const rutasTratamientos = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { animalId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarTratamientos(tx, animalId)), 200)
    })
    .openapi(opciones, async (c) => c.json(await enLaExplotacion(c, opcionesTratamiento), 200))
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearTratamientos(tx, datos)), 201)
    })
    .openapi(anular, async (c) => {
      const { tratamientoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => anularTratamiento(tx, tratamientoId, datos)),
        200,
      )
    })
