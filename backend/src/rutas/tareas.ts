import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { PRIORIDADES_TAREA } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import {
  borrarTarea,
  CambioHecha,
  corregirTarea,
  crearTarea,
  DatosTarea,
  listarTareas,
  marcarHecha,
  personasTareas,
} from '../tareas.js'

// Tareas de mantenimiento (GH-112), en la sección Mantenimiento

const Persona = z.object({ id: z.uuid(), nombre: z.string() })

const Tarea = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    equipo: z.object({ id: z.uuid(), nombre: z.string() }).nullable(),
    descripcion: z.string().nullable(),
    fechaLimite: z.iso.date().nullable(),
    prioridad: z.enum(PRIORIDADES_TAREA),
    asignadaA: Persona.nullable().openapi({ description: 'Sin nadie, la puede hacer cualquiera' }),
    hecha: z
      .object({ en: z.iso.datetime(), por: Persona })
      .nullable()
      .openapi({ description: 'Cuándo y quién la hizo; null si está pendiente' }),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Tarea')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosTarea = Parametros.extend({
  tareaId: z.uuid().openapi({ param: { name: 'tareaId', in: 'path' } }),
})

const Filtros = z.object({
  estado: z.enum(['pendiente', 'hecha']).optional(),
  para: z
    .enum(['mi'])
    .optional()
    .openapi({ description: '"Mis tareas": las asignadas a quien pregunta y las sin asignar' }),
  asignadaA: z.uuid().optional(),
  equipoId: z.uuid().optional(),
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
  403: error('Sin acceso a la explotación o a su mantenimiento'),
  404: error('No existe la explotación o la tarea (tarea_no_encontrada)'),
}

const ruta = '/explotaciones/{explotacionId}/tareas'
const cuerpo = { content: { 'application/json': { schema: DatosTarea } }, required: true }
const soloAsigna = error(
  'Sin acceso, o asigna la tarea quien no es administrador (sin_permiso, en el campo asignadaAId)',
)

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Mantenimiento'],
  summary: 'Tareas de mantenimiento, con filtros',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: Parametros, query: Filtros },
  responses: {
    200: json(
      z.array(Tarea),
      'Las pendientes por fecha límite y prioridad; las hechas, de la más reciente a la más antigua',
    ),
    ...comunes,
  },
})

const personas = createRoute({
  method: 'get',
  path: `${ruta}/personas`,
  tags: ['Mantenimiento'],
  summary: 'Personas del equipo a quienes asignar las tareas',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: Parametros },
  responses: { 200: json(z.array(Persona), 'Por nombre'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Mantenimiento'],
  summary: 'Dar de alta una tarea',
  description: 'Cualquiera del equipo; solo el administrador la asigna a una persona.',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(Tarea, 'La tarea creada'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    403: soloAsigna,
  },
})

const corregir = createRoute({
  method: 'put',
  path: `${ruta}/{tareaId}`,
  tags: ['Mantenimiento'],
  summary: 'Corregir una tarea',
  description: 'Cualquiera del equipo; solo el administrador cambia a quién está asignada.',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: ParametrosTarea, body: cuerpo },
  responses: {
    200: json(Tarea, 'La tarea corregida'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    403: soloAsigna,
  },
})

const hecha = createRoute({
  method: 'patch',
  path: `${ruta}/{tareaId}/hecha`,
  tags: ['Mantenimiento'],
  summary: 'Marcar una tarea como hecha, o volver a dejarla pendiente',
  description: 'Queda quién la hizo y cuándo.',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: {
    params: ParametrosTarea,
    body: { content: { 'application/json': { schema: CambioHecha } }, required: true },
  },
  responses: { 200: json(Tarea, 'La tarea'), ...comunes },
})

const borrar = createRoute({
  method: 'delete',
  path: `${ruta}/{tareaId}`,
  tags: ['Mantenimiento'],
  summary: 'Borrar una tarea',
  description: 'Devuelve la tarea borrada, para poder deshacerlo. Queda en el historial.',
  security: [{ sesion: [] }],
  middleware: [permitir('mantenimiento')] as const,
  request: { params: ParametrosTarea },
  responses: { 200: json(Tarea, 'La tarea borrada'), ...comunes },
})

export const rutasTareas = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const filtros = c.req.valid('query')
      return c.json(
        await enLaExplotacion(c, (tx) => listarTareas(tx, filtros, c.var.usuario.id)),
        200,
      )
    })
    // Antes que /{tareaId}, para que "personas" no se tome por un identificador
    .openapi(personas, async (c) => c.json(await enLaExplotacion(c, personasTareas), 200))
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearTarea(tx, datos, c.var.rol)), 201)
    })
    .openapi(corregir, async (c) => {
      const { tareaId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => corregirTarea(tx, tareaId, datos, c.var.rol)),
        200,
      )
    })
    .openapi(hecha, async (c) => {
      const { tareaId } = c.req.valid('param')
      const { hecha: valor } = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => marcarHecha(tx, tareaId, valor, c.var.usuario.id)),
        200,
      )
    })
    .openapi(borrar, async (c) => {
      const { tareaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => borrarTarea(tx, tareaId)), 200)
    })
