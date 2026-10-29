import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { borrarArchivo, guardarArchivo } from '../archivos.js'
import {
  IMPUESTOS_FACTURA,
  ORIGENES_ENTRADA,
  TIPOS_FACTURA,
  UNIDADES_ALMACEN,
} from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  archivoDe,
  asociarEntradas,
  borrarFactura,
  CambioPago,
  cambiarPago,
  corregirFactura,
  crearFactura,
  DatosFactura,
  listarEntradasComida,
  listarFacturas,
  ponerArchivo,
  siguienteNumero,
  verFactura,
} from '../facturas.js'
import { hoyEnMadrid } from '../fechas.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import {
  contenidoArchivo,
  cuerpoArchivo,
  enviarArchivo,
  erroresSubida,
  limiteSubida,
} from './archivos.js'

// Facturas (GH-35) y sus entradas de comida (GH-36), en Finanzas: solo el administrador

// Una entrada de comida comprada, con su almacén
const campoEntrada = {
  id: z.uuid(),
  fecha: z.iso.date(),
  cantidad: z.number().openapi({ description: 'En la unidad del almacén' }),
  origen: z.enum(ORIGENES_ENTRADA).nullable(),
  observaciones: z.string().nullable(),
  almacen: z.object({ id: z.uuid(), nombre: z.string(), unidad: z.enum(UNIDADES_ALMACEN) }),
}

const EntradaComida = z
  .object({
    ...campoEntrada,
    factura: z
      .object({ id: z.uuid(), numero: z.string(), tercero: z.string() })
      .nullable()
      .openapi({ description: 'La factura con la que se compró, si la tiene' }),
  })
  .openapi('EntradaComida')

const Factura = z
  .object({
    id: z.uuid(),
    tipo: z.enum(TIPOS_FACTURA),
    numero: z.string(),
    fecha: z.iso.date(),
    tercero: z.string().openapi({ description: 'Proveedor (recibidas) o cliente (emitidas)' }),
    nif: z.string(),
    nifExtranjero: z.boolean(),
    concepto: z.string(),
    impuesto: z.enum(IMPUESTOS_FACTURA),
    lineas: z.array(z.object({ base: z.number(), porcentaje: z.number(), cuota: z.number() })),
    baseImponible: z.number(),
    cuota: z.number().openapi({ description: 'IVA o compensación, la suma de las líneas' }),
    total: z.number(),
    pagadaEn: z.iso.date().nullable().openapi({ description: 'null si está pendiente' }),
    archivo: z
      .object({ nombre: z.string(), tipo: z.string(), tamano: z.number().int() })
      .nullable(),
    animales: z.array(
      z.object({ id: z.uuid(), crotal: z.string().nullable(), nombre: z.string().nullable() }),
    ),
    ventaId: z.uuid().nullable().openapi({ description: 'La venta de una emitida (GH-38)' }),
    entradasComida: z
      .array(z.object(campoEntrada))
      .openapi({ description: 'Entradas de comida compradas con la factura (GH-36)' }),
    creadoEn: z.iso.datetime(),
    modificadoEn: z.iso.datetime(),
  })
  .openapi('Factura')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ParametrosFactura = Parametros.extend({
  facturaId: z.uuid().openapi({ param: { name: 'facturaId', in: 'path' } }),
})

const Filtros = z.object({
  tipo: z.enum(TIPOS_FACTURA).optional(),
  estado: z.enum(['pendiente', 'pagada']).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  q: z.string().optional().openapi({ description: 'Proveedor o cliente, número o NIF' }),
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
  404: error('No existe la explotación o la factura (factura_no_encontrada)'),
}

const ruta = '/explotaciones/{explotacionId}/facturas'
const cuerpo = { content: { 'application/json': { schema: DatosFactura } }, required: true }
const enUso = error(
  'Número repetido: de otra emitida, o de otra recibida del proveedor (numero_en_uso)',
)

const listar = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Facturas, con filtros',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros, query: Filtros },
  responses: {
    200: json(z.array(Factura), 'De la más reciente a la más antigua'),
    ...comunes,
  },
})

const siguiente = createRoute({
  method: 'get',
  path: `${ruta}/siguiente-numero`,
  tags: ['Finanzas'],
  summary: 'Número que se propone para la siguiente factura emitida',
  description: 'El siguiente del año con el formato aaaa-nnnn (2026-0007 tras la 2026-0006).',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: Parametros,
    query: z.object({
      fecha: z.iso
        .date()
        .optional()
        .openapi({ description: 'Fecha de la factura; por defecto, hoy' }),
    }),
  },
  responses: {
    200: json(z.object({ numero: z.string() }).openapi('SiguienteNumero'), 'El número'),
    ...comunes,
  },
})

const ver = createRoute({
  method: 'get',
  path: `${ruta}/{facturaId}`,
  tags: ['Finanzas'],
  summary: 'Una factura',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosFactura },
  responses: { 200: json(Factura, 'La factura'), ...comunes },
})

const crear = createRoute({
  method: 'post',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Registrar una factura',
  description:
    'Comprueba el NIF (salvo los extranjeros), que cada cuota sea su porcentaje de la base (con un céntimo de margen) y que el total sea la suma de las líneas. El archivo se sube después.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros, body: cuerpo },
  responses: {
    201: json(Factura, 'La factura registrada'),
    400: error('Datos no válidos (validacion)'),
    409: enUso,
    ...comunes,
  },
})

const corregir = createRoute({
  method: 'put',
  path: `${ruta}/{facturaId}`,
  tags: ['Finanzas'],
  summary: 'Corregir una factura',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosFactura, body: cuerpo },
  responses: {
    200: json(Factura, 'La factura corregida'),
    400: error('Datos no válidos (validacion)'),
    409: enUso,
    ...comunes,
  },
})

const pago = createRoute({
  method: 'patch',
  path: `${ruta}/{facturaId}/pago`,
  tags: ['Finanzas'],
  summary: 'Marcar una factura como pagada, o volver a dejarla pendiente',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: ParametrosFactura,
    body: { content: { 'application/json': { schema: CambioPago } }, required: true },
  },
  responses: {
    200: json(Factura, 'La factura'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
  },
})

const borrar = createRoute({
  method: 'delete',
  path: `${ruta}/{facturaId}`,
  tags: ['Finanzas'],
  summary: 'Borrar una factura',
  description: 'Con su archivo y sus enlaces a los animales. Queda en el historial.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosFactura },
  responses: { 204: { description: 'Borrada' }, ...comunes },
})

const rutaArchivo = `${ruta}/{facturaId}/archivo`

const subirArchivo = createRoute({
  method: 'put',
  path: rutaArchivo,
  tags: ['Finanzas'],
  summary: 'Adjuntar el archivo de la factura, o cambiarlo',
  description: 'Un PDF o una foto (JPEG, PNG o WebP) de hasta 10 MB; sustituye al anterior.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas'), limiteSubida] as const,
  request: {
    params: ParametrosFactura,
    body: cuerpoArchivo,
  },
  responses: {
    200: json(Factura, 'La factura con su archivo'),
    ...erroresSubida,
    ...comunes,
  },
})

const descargarArchivo = createRoute({
  method: 'get',
  path: rutaArchivo,
  tags: ['Finanzas'],
  summary: 'Archivo de la factura',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosFactura },
  responses: {
    200: contenidoArchivo,
    ...comunes,
    404: error('No existe la explotación, la factura o su archivo (archivo_no_encontrado)'),
  },
})

const quitarArchivo = createRoute({
  method: 'delete',
  path: rutaArchivo,
  tags: ['Finanzas'],
  summary: 'Quitar el archivo de la factura',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: ParametrosFactura },
  responses: { 200: json(Factura, 'La factura sin archivo'), ...comunes },
})

const entradas = createRoute({
  method: 'put',
  path: `${ruta}/{facturaId}/entradas-comida`,
  tags: ['Finanzas'],
  summary: 'Asociar a una factura recibida sus entradas de comida',
  description:
    'Las entradas compradas que se indican, en lugar de las que tuviera; una lista vacía las quita todas. Una entrada solo es de una factura.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: ParametrosFactura,
    body: {
      content: {
        'application/json': {
          schema: z
            .object({ movimientoIds: z.array(z.uuid()).max(500) })
            .openapi('EntradasFactura'),
        },
      },
      required: true,
    },
  },
  responses: {
    200: json(Factura, 'La factura con sus entradas'),
    400: error('No es recibida, o alguna no es una entrada comprada (validacion)'),
    409: error('Alguna entrada ya es de otra factura (entrada_con_factura)'),
    ...comunes,
  },
})

const listarEntradas = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/entradas-comida',
  tags: ['Finanzas'],
  summary: 'Entradas de comida de todos los almacenes, con su factura',
  description: 'De la más reciente a la más antigua. Para asociarlas a una factura (GH-36).',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: Parametros,
    query: z.object({
      origen: z.enum(ORIGENES_ENTRADA).optional(),
      factura: z.enum(['con', 'sin']).optional(),
      almacenId: z.uuid().optional(),
      desde: z.iso.date().optional(),
      hasta: z.iso.date().optional(),
    }),
  },
  responses: {
    200: json(z.array(EntradaComida), 'Las entradas'),
    ...comunes,
    404: error('No existe la explotación'),
  },
})

export const rutasFacturas = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(listar, async (c) => {
      const filtros = c.req.valid('query')
      return c.json(await enLaExplotacion(c, (tx) => listarFacturas(tx, filtros)), 200)
    })
    // Antes que /{facturaId}, para que "siguiente-numero" no se tome por un identificador
    .openapi(siguiente, async (c) => {
      const { fecha = hoyEnMadrid() } = c.req.valid('query')
      const numero = await enLaExplotacion(c, (tx) =>
        siguienteNumero(tx, Number(fecha.slice(0, 4))),
      )
      return c.json({ numero }, 200)
    })
    .openapi(ver, async (c) => {
      const { facturaId } = c.req.valid('param')
      return c.json(await enLaExplotacion(c, (tx) => verFactura(tx, facturaId)), 200)
    })
    .openapi(crear, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => crearFactura(tx, datos)), 201)
    })
    .openapi(corregir, async (c) => {
      const { facturaId } = c.req.valid('param')
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => corregirFactura(tx, facturaId, datos)), 200)
    })
    .openapi(pago, async (c) => {
      const { facturaId } = c.req.valid('param')
      const { pagadaEn } = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => cambiarPago(tx, facturaId, pagadaEn)), 200)
    })
    .openapi(borrar, async (c) => {
      const { facturaId } = c.req.valid('param')
      const ruta = await enLaExplotacion(c, (tx) => borrarFactura(tx, facturaId))
      // El archivo, una vez borrada la factura
      await borrarArchivo(ruta)
      return c.body(null, 204)
    })
    .openapi(subirArchivo, async (c) => {
      const { facturaId } = c.req.valid('param')
      const { archivo } = c.req.valid('form')
      const guardado = await guardarArchivo(c.var.explotacion.id, 'facturas', archivo)
      try {
        const { anterior, factura } = await enLaExplotacion(c, (tx) =>
          ponerArchivo(tx, facturaId, guardado),
        )
        await borrarArchivo(anterior)
        return c.json(factura, 200)
      } catch (error) {
        // Si no se ha podido enlazar a la factura, el archivo sobra
        await borrarArchivo(guardado.ruta)
        throw error
      }
    })
    .openapi(descargarArchivo, async (c) => {
      const { facturaId } = c.req.valid('param')
      const archivo = await enLaExplotacion(c, (tx) => archivoDe(tx, facturaId))
      return enviarArchivo(c, archivo)
    })
    .openapi(quitarArchivo, async (c) => {
      const { facturaId } = c.req.valid('param')
      const { anterior, factura } = await enLaExplotacion(c, (tx) =>
        ponerArchivo(tx, facturaId, null),
      )
      await borrarArchivo(anterior)
      return c.json(factura, 200)
    })
    .openapi(entradas, async (c) => {
      const { facturaId } = c.req.valid('param')
      const { movimientoIds } = c.req.valid('json')
      return c.json(
        await enLaExplotacion(c, (tx) => asociarEntradas(tx, facturaId, movimientoIds)),
        200,
      )
    })
    .openapi(listarEntradas, async (c) => {
      const filtros = c.req.valid('query')
      return c.json(await enLaExplotacion(c, (tx) => listarEntradasComida(tx, filtros)), 200)
    })
