import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  METODOS_DIAGNOSTICO,
  RESULTADOS_DIAGNOSTICO,
  TIPOS_EVENTO_REPRODUCTIVO,
} from '../db/schema/index.js'
import { validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import {
  anularEvento,
  crearEventos,
  DatosAnulacionEvento,
  DatosEvento,
  listarEventos,
} from '../reproduccion.js'
import { comunes, error, json, ParametrosAnimal } from './animales.js'

// Eventos reproductivos (GH-22)

const Resumen = z.object({
  id: z.uuid(),
  crotal: z.string().nullable(),
  nombre: z.string().nullable(),
})

const EventoReproductivo = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_EVENTO_REPRODUCTIVO),
    fecha: z.iso.date(),
    animalId: z.uuid(),
    animal: Resumen.openapi({ description: 'En el historial de una vaca, el ternero destetado' }),
    padreId: z.uuid().nullable(),
    padre: Resumen.nullable(),
    padreTexto: z.string().nullable(),
    fechaPrevistaParto: z.iso
      .date()
      .nullable()
      .openapi({ description: 'Cubrición e inseminación: la fecha más 283 días' }),
    metodo: z.enum(METODOS_DIAGNOSTICO).nullable(),
    resultado: z.enum(RESULTADOS_DIAGNOSTICO).nullable(),
    observaciones: z.string().nullable(),
    anulacion: z.object({ en: z.iso.datetime(), por: z.string(), motivo: z.string() }).nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('EventoReproductivo')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosEvento = Parametros.extend({
  eventoId: z.uuid().openapi({ param: { name: 'eventoId', in: 'path' } }),
})

const ruta = '/explotaciones/{explotacionId}/reproduccion'

const listar = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/animales/{animalId}/reproduccion',
  tags: ['Animales'],
  summary: 'Historial reproductivo de un animal',
  description: 'Sus eventos y los destetes de sus hijos.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosAnimal },
  responses: {
    200: json(z.array(EventoReproductivo), 'Del más reciente al más antiguo, anulados incluidos'),
    ...comunes,
  },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Animales'],
  summary: 'Registrar un evento reproductivo a uno o varios animales',
  description:
    'Crea un evento por animal, todos con los mismos datos. Un destete con peso guarda también la pesada al destete.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosEvento } }, required: true },
  },
  responses: {
    201: json(z.array(EventoReproductivo), 'Registrados'),
    400: error(
      'Datos no válidos, machos en un evento de hembra, animales de otra explotación o fecha fuera de su vida (validacion)',
    ),
    ...comunes,
  },
})

const anular = createRoute({
  method: 'post',
  path: `${ruta}/{eventoId}/anulacion`,
  tags: ['Animales'],
  summary: 'Anular un evento reproductivo registrado por error',
  description:
    'No se borra: queda en el historial como anulado, con el motivo, y deja de contar para la gestación.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: ParametrosEvento,
    body: { content: { 'application/json': { schema: DatosAnulacionEvento } }, required: true },
  },
  responses: {
    200: json(EventoReproductivo, 'Anulado'),
    400: error('Falta el motivo (validacion)'),
    ...comunes,
    404: error('No existe la explotación o el evento (evento_no_encontrado)'),
    409: error('Ya está anulado (ya_anulado)'),
  },
})

export const rutasReproduccion = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { animalId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarEventos(tx, animalId)), 200)
    })
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearEventos(tx, datos)), 201)
    })
    .openapi(anular, async (c) => {
      const { eventoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => anularEvento(tx, eventoId, datos)), 200)
    })
