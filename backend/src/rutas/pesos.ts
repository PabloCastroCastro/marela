import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { MOMENTOS_PESADA } from '../db/schema/index.js'
import { validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import { borrarPesada, corregirPesada, crearPesada, DatosPesada, listarPesadas } from '../pesos.js'
import { comunes, error, json, ParametrosAnimal } from './animales.js'

// Pesadas de un animal (GH-21)

const Pesada = z
  .object({
    id: z.uuid(),
    animalId: z.uuid(),
    fecha: z.iso.date(),
    kg: z.number(),
    momento: z.enum(MOMENTOS_PESADA),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Pesada')

const ParametrosPesada = ParametrosAnimal.extend({
  pesoId: z.uuid().openapi({ param: { name: 'pesoId', in: 'path' } }),
})

const ruta = '/explotaciones/{explotacionId}/animales/{animalId}/pesos'

const cuerpo = { content: { 'application/json': { schema: DatosPesada } }, required: true }

const repetido = error('Ya hay una pesada al nacer, al destete o a la venta (momento_repetido)')

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Animales'],
  summary: 'Pesadas de un animal',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosAnimal },
  responses: { 200: json(z.array(Pesada), 'De la más antigua a la más reciente'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Animales'],
  summary: 'Registrar una pesada',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosAnimal, body: cuerpo },
  responses: {
    201: json(Pesada, 'Registrada'),
    400: error('Datos no válidos o fecha fuera de la vida del animal (validacion)'),
    ...comunes,
    409: repetido,
  },
})

const corregir = createRoute({
  method: 'put',
  path: `${ruta}/{pesoId}`,
  tags: ['Animales'],
  summary: 'Corregir una pesada',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosPesada, body: cuerpo },
  responses: {
    200: json(Pesada, 'Corregida'),
    400: error('Datos no válidos o fecha fuera de la vida del animal (validacion)'),
    ...comunes,
    404: error('No existe la explotación, el animal o la pesada (pesada_no_encontrada)'),
    409: repetido,
  },
})

const borrar = createRoute({
  method: 'delete',
  path: `${ruta}/{pesoId}`,
  tags: ['Animales'],
  summary: 'Borrar una pesada registrada por error',
  description: 'Queda en el historial de cambios.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosPesada },
  responses: {
    200: json(Pesada, 'La pesada borrada, para poder deshacerlo'),
    ...comunes,
    404: error('No existe la explotación, el animal o la pesada (pesada_no_encontrada)'),
  },
})

export const rutasPesos = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { animalId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => listarPesadas(tx, animalId)), 200)
    })
    .openapi(crear, async (c) => {
      const { animalId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearPesada(tx, animalId, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { animalId, pesoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => corregirPesada(tx, animalId, pesoId, datos)),
        200,
      )
    })
    .openapi(borrar, async (c) => {
      const { animalId, pesoId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => borrarPesada(tx, animalId, pesoId)), 200)
    })
