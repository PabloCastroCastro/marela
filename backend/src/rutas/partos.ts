import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { ESTADOS_ANIMAL, SEXOS, TIPOS_PARTO } from '../db/schema/index.js'
import { validacionFallida } from '../errores.js'
import {
  anularParto,
  crearParto,
  DatosAnulacionParto,
  DatosParto,
  listarPartos,
} from '../partos.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import { comunes, error, json, ParametrosAnimal } from './animales.js'

// Partos (GH-23)

const Parto = z
  .object({
    id: z.uuid(),
    madreId: z.uuid(),
    fecha: z.iso.date(),
    tipo: z.enum(TIPOS_PARTO),
    padreId: z.uuid().nullable(),
    padre: z
      .object({ id: z.uuid(), crotal: z.string().nullable(), nombre: z.string().nullable() })
      .nullable(),
    padreTexto: z.string().nullable(),
    observaciones: z.string().nullable(),
    terneros: z
      .array(
        z.object({
          id: z.uuid(),
          crotal: z.string().nullable(),
          nombre: z.string().nullable(),
          sexo: z.enum(SEXOS),
          estado: z.enum(ESTADOS_ANIMAL),
        }),
      )
      .openapi({ description: 'Sus fichas; vacío si el parto está anulado, porque se borran' }),
    anulacion: z.object({ en: z.iso.datetime(), por: z.string(), motivo: z.string() }).nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Parto')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosParto = Parametros.extend({
  partoId: z.uuid().openapi({ param: { name: 'partoId', in: 'path' } }),
})

const ruta = '/explotaciones/{explotacionId}/animales/{animalId}/partos'

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Animales'],
  summary: 'Partos de una vaca',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosAnimal },
  responses: {
    200: json(z.array(Parto), 'Del más reciente al más antiguo, anulados incluidos'),
    ...comunes,
  },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Animales'],
  summary: 'Registrar un parto y crear las fichas de sus terneros',
  description:
    'Todo en una transacción. Los terneros se enlazan a la madre y al padre de la gestación en curso (o al indicado si no la hay); los nacidos muertos, con estado "muerto". El peso al nacer se guarda como su pesada al nacer. El parto cierra la gestación. Con id (y los de sus terneros), el registrado sin conexión: si ya se guardó, se devuelve el mismo.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: ParametrosAnimal,
    body: { content: { 'application/json': { schema: DatosParto } }, required: true },
  },
  responses: {
    201: json(Parto, 'Registrado, con sus terneros'),
    400: error('Datos no válidos, madre que no es hembra o fecha fuera de su vida (validacion)'),
    ...comunes,
    409: error(
      'El crotal de un ternero ya está en uso, o un id es de otro registro (crotal_en_uso, id_en_uso)',
    ),
  },
})

const anular = createRoute({
  method: 'post',
  path: '/explotaciones/{explotacionId}/partos/{partoId}/anulacion',
  tags: ['Animales'],
  summary: 'Anular un parto registrado por error',
  description:
    'Queda en el historial como anulado y se borran las fichas de sus terneros, que quedan en el historial de cambios. No se puede si algún ternero tiene ya otros datos.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: ParametrosParto,
    body: { content: { 'application/json': { schema: DatosAnulacionParto } }, required: true },
  },
  responses: {
    200: json(Parto, 'Anulado'),
    400: error('Falta el motivo (validacion)'),
    ...comunes,
    404: error('No existe la explotación o el parto (parto_no_encontrado)'),
    409: error(
      'Ya está anulado, o algún ternero tiene pesadas, tratamientos, eventos o hijos (ya_anulado, terneros_con_datos)',
    ),
  },
})

export const rutasPartos = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { animalId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarPartos(tx, animalId)), 200)
    })
    .openapi(crear, async (c) => {
      const { animalId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearParto(tx, animalId, datos)), 201)
    })
    .openapi(anular, async (c) => {
      const { partoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => anularParto(tx, partoId, datos)), 200)
    })
