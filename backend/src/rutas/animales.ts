import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  CambioAnimal,
  crearAnimal,
  DatosAnimal,
  editarAnimal,
  listarAnimales,
  razas,
  verAnimal,
} from '../animales.js'
import { ESTADOS_ANIMAL, ORIGENES, SEXOS } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Animales de la explotación (GH-14)

const Progenitor = z
  .object({ id: z.uuid(), crotal: z.string(), nombre: z.string().nullable() })
  .nullable()

const Animal = z
  .object({
    id: z.uuid(),
    crotal: z.string(),
    nombre: z.string().nullable(),
    raza: z.string(),
    sexo: z.enum(SEXOS),
    fechaNacimiento: z.iso.date(),
    madreId: z.uuid().nullable(),
    madreTexto: z.string().nullable(),
    madre: Progenitor,
    padreId: z.uuid().nullable(),
    padreTexto: z.string().nullable(),
    padre: Progenitor,
    origen: z.enum(ORIGENES),
    fechaEntrada: z.iso.date().nullable(),
    regaOrigen: z.string().nullable(),
    estado: z.enum(ESTADOS_ANIMAL),
    fechaBaja: z.iso.date().nullable(),
    causaBaja: z.string().nullable(),
    observaciones: z.string().nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Animal')

const AnimalDetalle = Animal.extend({
  hijos: z.array(
    z.object({
      id: z.uuid(),
      crotal: z.string(),
      nombre: z.string().nullable(),
      sexo: z.enum(SEXOS),
      fechaNacimiento: z.iso.date(),
      estado: z.enum(ESTADOS_ANIMAL),
    }),
  ),
}).openapi('AnimalDetalle')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosAnimal = Parametros.extend({
  animalId: z.uuid().openapi({ param: { name: 'animalId', in: 'path' } }),
})

const Filtros = z.object({
  q: z
    .string()
    .optional()
    .openapi({ description: 'Busca en el crotal, el nombre y la raza', example: 'Rubia' }),
  estado: z.enum(ESTADOS_ANIMAL).optional(),
  sexo: z.enum(SEXOS).optional(),
})

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const comunes = {
  401: error('Sin sesión'),
  403: error('Sin acceso a la explotación o a sus animales'),
  404: error('No existe la explotación o el animal (animal_no_encontrado)'),
}

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const listar = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/animales',
  tags: ['Animales'],
  summary: 'Animales de la explotación, con búsqueda y filtros',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: Parametros, query: Filtros },
  responses: { 200: json(z.array(Animal), 'Ordenados por crotal'), ...comunes },
})

const listarRazas = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/animales/razas',
  tags: ['Animales'],
  summary: 'Razas para sugerir: las habituales y las que ya se usan en la explotación',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: Parametros },
  responses: { 200: json(z.array(z.string()), 'En orden alfabético'), ...comunes },
})

const ver = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/animales/{animalId}',
  tags: ['Animales'],
  summary: 'Ficha de un animal',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: { params: ParametrosAnimal },
  responses: { 200: json(AnimalDetalle, 'La ficha, con sus hijos'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: '/explotaciones/{explotacionId}/animales',
  tags: ['Animales'],
  summary: 'Dar de alta un animal',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosAnimal } }, required: true },
  },
  responses: {
    201: json(AnimalDetalle, 'Creado'),
    400: error('Datos no válidos, madre o padre que no corresponden (validacion)'),
    ...comunes,
    409: error('Ya hay un animal con este crotal en la plataforma (crotal_en_uso)'),
  },
})

const editar = createRoute({
  method: 'patch',
  path: '/explotaciones/{explotacionId}/animales/{animalId}',
  tags: ['Animales'],
  summary: 'Editar la ficha de un animal',
  description: 'Solo los campos que cambian. El estado y la baja tienen su propio flujo.',
  security: [{ sesion: [] }],
  middleware: [permitir('animales')] as const,
  request: {
    params: ParametrosAnimal,
    body: { content: { 'application/json': { schema: CambioAnimal } }, required: true },
  },
  responses: {
    200: json(AnimalDetalle, 'La ficha actualizada'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: error(
      'Crotal en uso o cambio de sexo de un animal con hijos (crotal_en_uso, sexo_con_hijos)',
    ),
  },
})

export const rutasAnimales = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    // Antes que /{animalId}, para que "razas" no se tome por un identificador
    .openapi(listarRazas, async (c) => c.json(await enLaExplotacion(c, razas), 200))
    .openapi(listar, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => listarAnimales(tx, c.req.valid('query'))), 200),
    )
    .openapi(ver, async (c) => {
      const { animalId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verAnimal(tx, animalId)), 200)
    })
    .openapi(crear, async (c) =>
      c.json(await enLaExplotacion(c, (tx) => crearAnimal(tx, c.req.valid('json'))), 201),
    )
    .openapi(editar, async (c) => {
      const { animalId } = c.req.valid('param')
      const cambios = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => editarAnimal(tx, animalId, cambios)), 200)
    })
