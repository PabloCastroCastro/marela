import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { MODOS_PRECIO } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import {
  CambioFacturaVenta,
  cambiarFacturaVenta,
  corregirVenta,
  DatosVenta,
  deshacerVenta,
  listarVentas,
  registrarVenta,
  verVenta,
} from '../ventas.js'

// Ventas de animales (GH-38), en Finanzas: solo el administrador

const Venta = z
  .object({
    id: z.uuid(),
    fecha: z.iso.date(),
    comprador: z.string(),
    modoPrecio: z.enum(MODOS_PRECIO),
    precio: z.number().openapi({ description: 'El introducido: el total, por animal o por kg' }),
    total: z.number().openapi({ description: 'Sin IVA ni compensación' }),
    kg: z.number().nullable().openapi({ description: 'Los kilos vendidos, si se pesaron todos' }),
    animales: z.array(
      z.object({
        id: z.uuid(),
        crotal: z.string().nullable(),
        nombre: z.string().nullable(),
        kg: z.number().nullable(),
        importe: z.number().openapi({ description: 'Lo que le corresponde del total' }),
      }),
    ),
    factura: z.object({ id: z.uuid(), numero: z.string(), total: z.number() }).nullable(),
    observaciones: z.string().nullable(),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Venta')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosVenta = Parametros.extend({
  ventaId: z.uuid().openapi({ param: { name: 'ventaId', in: 'path' } }),
})

export const ConsultaVentas = z.object({
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  factura: z.enum(['con', 'sin']).optional(),
  q: z.string().optional().openapi({ description: 'Comprador' }),
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
  404: error('No existe la explotación o la venta (venta_no_encontrada)'),
}

const conflictos = error(
  'Algún animal tiene un periodo de supresión en curso (supresion_en_curso: en detalles, cuál y hasta cuándo), o la factura ya es de otra venta (factura_con_venta)',
)

const ruta = '/explotaciones/{explotacionId}/ventas'
const rutaVenta = `${ruta}/{ventaId}`
const cuerpo = { content: { 'application/json': { schema: DatosVenta } }, required: true }

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Ventas de animales, con filtros',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros, query: ConsultaVentas },
  responses: { 200: json(z.array(Venta), 'De la más reciente a la más antigua'), ...comunes },
})

const ver = createRoute({
  method: 'get',
  path: rutaVenta,
  tags: ['Finanzas'],
  summary: 'Una venta',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosVenta },
  responses: { 200: json(Venta, 'La venta'), ...comunes },
})

const registrar = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Registrar una venta de animales',
  description:
    'En la misma transacción, los animales pasan a vendidos (baja por venta, con la fecha y el comprador) y su peso queda como pesada de venta en su ficha. Se bloquea, sin excepciones, si alguno tiene un periodo de supresión en curso en la fecha de la venta.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(Venta, 'La venta registrada'),
    400: error('Datos no válidos (validacion)'),
    409: conflictos,
    ...comunes,
  },
})

const corregir = createRoute({
  method: 'put',
  path: rutaVenta,
  tags: ['Finanzas'],
  summary: 'Corregir una venta',
  description: 'Se deshace y se registra de nuevo con los datos nuevos, también los animales.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosVenta, body: cuerpo },
  responses: {
    200: json(Venta, 'La venta corregida'),
    400: error('Datos no válidos (validacion)'),
    409: conflictos,
    ...comunes,
  },
})

const factura = createRoute({
  method: 'patch',
  path: `${rutaVenta}/factura`,
  tags: ['Finanzas'],
  summary: 'Asociar a la venta su factura emitida, o quitarla',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: ParametrosVenta,
    body: { content: { 'application/json': { schema: CambioFacturaVenta } }, required: true },
  },
  responses: {
    200: json(Venta, 'La venta'),
    400: error('La factura no es emitida o no es de la explotación (validacion)'),
    409: error('La factura ya es de otra venta (factura_con_venta)'),
    ...comunes,
  },
})

const deshacer = createRoute({
  method: 'delete',
  path: rutaVenta,
  tags: ['Finanzas'],
  summary: 'Deshacer una venta',
  description:
    'Los animales vuelven a estar activos y se quitan sus pesadas de venta. La factura, si la tenía, se queda. Queda en el historial.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosVenta },
  responses: { 204: { description: 'Deshecha' }, ...comunes },
})

export const rutasVentas = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const filtros = c.req.valid('query')
      return c.json(await enLaExplotacion(c, (tx) => listarVentas(tx, filtros)), 200)
    })
    .openapi(ver, async (c) => {
      const { ventaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verVenta(tx, ventaId)), 200)
    })
    .openapi(registrar, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => registrarVenta(tx, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { ventaId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => corregirVenta(tx, ventaId, datos)), 200)
    })
    .openapi(factura, async (c) => {
      const { ventaId } = c.req.valid('param')
      const { facturaId } = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => cambiarFacturaVenta(tx, ventaId, facturaId)),
        200,
      )
    })
    .openapi(deshacer, async (c) => {
      const { ventaId } = c.req.valid('param')
      await enLaExplotacion(c, (tx) => deshacerVenta(tx, ventaId))
      return c.body(null, 204)
    })
