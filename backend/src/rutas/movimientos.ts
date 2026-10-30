import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { ORIGENES_ENTRADA, TIPOS_AJUSTE, TIPOS_MOVIMIENTO } from '../db/schema/index.js'
import { ErrorApi, EsquemaError, validacionFallida } from '../errores.js'
import {
  borrarMovimiento,
  corregirMovimiento,
  crearMovimiento,
  DatosMovimiento,
  listarMovimientos,
} from '../movimientos.js'
import { type EnvExplotacion, enLaExplotacion, permitir, puedeAcceder } from '../permisos.js'
import { ParametrosAlmacen } from './almacenes.js'

// Entradas, salidas y ajustes de inventario de los almacenes de comida (GH-30). Los registra
// cualquiera que acceda a Comida.

const Movimiento = z
  .object({
    id: z.uuid(),
    almacenId: z.uuid(),
    tipo: z.enum(TIPOS_MOVIMIENTO),
    fecha: z.iso.date(),
    cantidad: z.number().openapi({
      description: 'En la unidad del almacén. En un recuento, la cantidad contada.',
    }),
    origen: z.enum(ORIGENES_ENTRADA).nullable(),
    finca: z
      .object({ id: z.uuid(), nombre: z.string() })
      .nullable()
      .openapi({ description: 'De qué finca viene la producción propia, si se sabe' }),
    ajuste: z.enum(TIPOS_AJUSTE).nullable(),
    motivo: z.string().nullable(),
    observaciones: z.string().nullable(),
    diferencia: z.number().openapi({
      description: 'Lo que cambió el stock: positiva si sube, negativa si baja',
    }),
    stock: z.number().openapi({ description: 'El stock que dejó en el almacén' }),
    factura: z
      .object({ id: z.uuid(), numero: z.string(), tercero: z.string() })
      .nullable()
      .optional()
      .openapi({
        description:
          'La factura de una entrada comprada (GH-36). Solo en el listado y para quien accede a Finanzas.',
      }),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('MovimientoComida')

const ParametrosMovimiento = ParametrosAlmacen.extend({
  movimientoId: z.uuid().openapi({ param: { name: 'movimientoId', in: 'path' } }),
})

const Filtros = z.object({
  desde: z.iso.date().optional().openapi({ description: 'Desde esta fecha, incluida' }),
  hasta: z.iso.date().optional().openapi({ description: 'Hasta esta fecha, incluida' }),
  tipo: z.enum(TIPOS_MOVIMIENTO).optional(),
  origen: z.enum(ORIGENES_ENTRADA).optional(),
  factura: z
    .enum(['con', 'sin'])
    .optional()
    .openapi({ description: 'Con factura o sin ella; solo para quien accede a Finanzas' }),
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
  403: error('Sin acceso a la explotación o a su comida'),
  404: error(
    'No existe la explotación, el almacén o el movimiento (almacen_no_encontrado, movimiento_no_encontrado)',
  ),
}

const ruta = '/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos'
const cuerpo = { content: { 'application/json': { schema: DatosMovimiento } }, required: true }

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Comida'],
  summary: 'Movimientos de un almacén, con filtros de fecha, tipo, origen y factura',
  security: [{ sesion: [] }],
  middleware: [permitir('comida')] as const,
  request: { params: ParametrosAlmacen, query: Filtros },
  responses: {
    200: json(z.array(Movimiento), 'Del más reciente al más antiguo'),
    ...comunes,
    403: error('Sin acceso a la comida, o filtra por factura quien no accede a Finanzas'),
  },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Comida'],
  summary: 'Registrar una entrada, una salida o un ajuste de inventario',
  description:
    'Entrada: con origen (compra o producción propia) y, si es producción propia, la finca si se sabe. Salida: solo fecha y cantidad. Ajuste: recuento (la cantidad contada) o merma (la cantidad perdida), con motivo. El stock puede quedar en negativo.',
  security: [{ sesion: [] }],
  middleware: [permitir('comida')] as const,
  request: { params: ParametrosAlmacen, body: cuerpo },
  responses: {
    201: json(Movimiento, 'El movimiento registrado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: error('El almacén está desactivado (almacen_desactivado)'),
  },
})

const conFactura = error(
  'La entrada tiene factura: no deja de ser una compra ni se borra (entrada_con_factura)',
)

const corregir = createRoute({
  method: 'put',
  path: `${ruta}/{movimientoId}`,
  tags: ['Comida'],
  summary: 'Corregir un movimiento',
  security: [{ sesion: [] }],
  middleware: [permitir('comida')] as const,
  request: { params: ParametrosMovimiento, body: cuerpo },
  responses: {
    200: json(Movimiento, 'El movimiento corregido'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
    409: conFactura,
  },
})

const borrar = createRoute({
  method: 'delete',
  path: `${ruta}/{movimientoId}`,
  tags: ['Comida'],
  summary: 'Borrar un movimiento registrado por error',
  description: 'Devuelve el movimiento borrado, para poder deshacerlo. Queda en el historial.',
  security: [{ sesion: [] }],
  middleware: [permitir('comida')] as const,
  request: { params: ParametrosMovimiento },
  responses: { 200: json(Movimiento, 'El movimiento borrado'), ...comunes, 409: conFactura },
})

export const rutasMovimientos = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const { almacenId } = c.req.valid('param')
      const filtros = c.req.valid('query')
      // Las facturas, solo para quien accede a Finanzas
      const verFacturas = puedeAcceder(c.var.rol, 'finanzas')
      if (filtros.factura && !verFacturas)
        throw new ErrorApi(403, 'sin_permiso', 'Solo el administrador ve las facturas')
      return c.json(
        await enLaExplotacion(c, (tx) => listarMovimientos(tx, almacenId, filtros, verFacturas)),
        200,
      )
    })
    .openapi(crear, async (c) => {
      const { almacenId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearMovimiento(tx, almacenId, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { almacenId, movimientoId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => corregirMovimiento(tx, almacenId, movimientoId, datos)),
        200,
      )
    })
    .openapi(borrar, async (c) => {
      const { almacenId, movimientoId } = c.req.valid('param')
      return c.json(
        await enLaExplotacion(c, (tx) => borrarMovimiento(tx, almacenId, movimientoId)),
        200,
      )
    })
