import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  anularApunte,
  archivoDeApunte,
  corregirApunte,
  crearApunte,
  DatosAnulacionApunte,
  DatosApunte,
  listarApuntes,
  ponerArchivoApunte,
  verApunte,
} from '../apuntes.js'
import { borrarArchivo, guardarArchivo } from '../archivos.js'
import { CATEGORIAS_APUNTE, TIPOS_APUNTE } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import {
  contenidoArchivo,
  cuerpoArchivo,
  enviarArchivo,
  erroresSubida,
  limiteSubida,
} from './archivos.js'

// Otros ingresos y gastos (GH-37), en Finanzas: solo el administrador

const Apunte = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_APUNTE),
    categoria: z.enum(CATEGORIAS_APUNTE),
    fecha: z.iso.date(),
    concepto: z.string(),
    importe: z.number().openapi({ description: 'En euros, siempre positivo; el tipo da el signo' }),
    observaciones: z.string().nullable(),
    archivo: z
      .object({ nombre: z.string(), tipo: z.string(), tamano: z.number().int() })
      .nullable(),
    anulacion: z
      .object({ en: z.iso.datetime(), por: z.string(), motivo: z.string() })
      .nullable()
      .openapi({ description: 'Si se anuló: no cuenta en los totales' }),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Apunte')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosApunte = Parametros.extend({
  apunteId: z.uuid().openapi({ param: { name: 'apunteId', in: 'path' } }),
})

export const ConsultaApuntes = z.object({
  tipo: z.enum(TIPOS_APUNTE).optional(),
  categoria: z.enum(CATEGORIAS_APUNTE).optional(),
  estado: z.enum(['vigente', 'anulado']).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  q: z.string().optional().openapi({ description: 'Concepto u observaciones' }),
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
  403: error('Sin acceso a la explotación, o no es su administrador'),
  404: error('No existe la explotación o el ingreso o gasto (apunte_no_encontrado)'),
}

const yaAnulado = error('Está anulado: ya no se cambia (ya_anulado)')

const ruta = '/explotaciones/{explotacionId}/apuntes'
const rutaApunte = `${ruta}/{apunteId}`
const cuerpo = { content: { 'application/json': { schema: DatosApunte } }, required: true }

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Otros ingresos y gastos, con filtros',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros, query: ConsultaApuntes },
  responses: {
    200: json(z.array(Apunte), 'Del más reciente al más antiguo, con los anulados'),
    ...comunes,
  },
})

const ver = createRoute({
  method: 'get',
  path: rutaApunte,
  tags: ['Finanzas'],
  summary: 'Un ingreso o gasto',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosApunte },
  responses: { 200: json(Apunte, 'El ingreso o gasto'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Registrar un ingreso o un gasto sin factura',
  description: 'La categoría tiene que ser del tipo. El archivo se sube después.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(Apunte, 'Registrado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
  },
})

const corregir = createRoute({
  method: 'put',
  path: rutaApunte,
  tags: ['Finanzas'],
  summary: 'Corregir un ingreso o gasto',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosApunte, body: cuerpo },
  responses: {
    200: json(Apunte, 'Corregido'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: yaAnulado,
  },
})

const anular = createRoute({
  method: 'post',
  path: `${rutaApunte}/anulacion`,
  tags: ['Finanzas'],
  summary: 'Anular un ingreso o gasto registrado por error',
  description:
    'No se borra: sigue a la vista como anulado, con el motivo, y no cuenta en los totales.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: ParametrosApunte,
    body: { content: { 'application/json': { schema: DatosAnulacionApunte } }, required: true },
  },
  responses: {
    200: json(Apunte, 'Anulado'),
    400: error('Falta el motivo (validacion)'),
    ...comunes,
    409: yaAnulado,
  },
})

const rutaArchivo = `${rutaApunte}/archivo`

const subirArchivo = createRoute({
  method: 'put',
  path: rutaArchivo,
  tags: ['Finanzas'],
  summary: 'Adjuntar el archivo de un ingreso o gasto, o cambiarlo',
  description: 'Un PDF o una foto (JPEG, PNG o WebP) de hasta 10 MB; sustituye al anterior.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas'), limiteSubida] as const,
  request: { params: ParametrosApunte, body: cuerpoArchivo },
  responses: {
    200: json(Apunte, 'Con su archivo'),
    ...erroresSubida,
    ...comunes,
    409: yaAnulado,
  },
})

const descargarArchivo = createRoute({
  method: 'get',
  path: rutaArchivo,
  tags: ['Finanzas'],
  summary: 'Archivo de un ingreso o gasto',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosApunte },
  responses: {
    200: contenidoArchivo,
    ...comunes,
    404: error('No existe la explotación, el ingreso o gasto o su archivo (archivo_no_encontrado)'),
  },
})

const quitarArchivo = createRoute({
  method: 'delete',
  path: rutaArchivo,
  tags: ['Finanzas'],
  summary: 'Quitar el archivo de un ingreso o gasto',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosApunte },
  responses: { 200: json(Apunte, 'Sin archivo'), ...comunes, 409: yaAnulado },
})

export const rutasApuntes = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const filtros = c.req.valid('query')
      return c.json(await enLaExplotacion(c, (tx) => listarApuntes(tx, filtros)), 200)
    })
    .openapi(ver, async (c) => {
      const { apunteId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verApunte(tx, apunteId)), 200)
    })
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearApunte(tx, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { apunteId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => corregirApunte(tx, apunteId, datos)), 200)
    })
    .openapi(anular, async (c) => {
      const { apunteId } = c.req.valid('param')
      const { motivo } = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => anularApunte(tx, apunteId, motivo, c.var.usuario.id)),
        200,
      )
    })
    .openapi(subirArchivo, async (c) => {
      const { apunteId } = c.req.valid('param')
      const { archivo } = c.req.valid('form')
      const guardado = await guardarArchivo(c.var.explotacion.id, 'apuntes', archivo)
      try {
        const { anterior, apunte } = await enLaExplotacion(c, (tx) =>
          ponerArchivoApunte(tx, apunteId, guardado),
        )
        await borrarArchivo(anterior)
        return c.json(apunte, 200)
      } catch (error) {
        // Si no se ha podido enlazar, el archivo sobra
        await borrarArchivo(guardado.ruta)
        throw error
      }
    })
    .openapi(descargarArchivo, async (c) => {
      const { apunteId } = c.req.valid('param')
      return enviarArchivo(c, await enLaExplotacion(c, (tx) => archivoDeApunte(tx, apunteId)))
    })
    .openapi(quitarArchivo, async (c) => {
      const { apunteId } = c.req.valid('param')
      const { anterior, apunte } = await enLaExplotacion(c, (tx) =>
        ponerArchivoApunte(tx, apunteId, null),
      )
      await borrarArchivo(anterior)
      return c.json(apunte, 200)
    })
