import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { EsquemaError, validacionFallida } from '../errores.js'
import { FiltrosResumen, PERIODOS, resumen } from '../informes.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Informes de finanzas (GH-39): solo el administrador

const Cifras = {
  ingresos: z.object({
    facturas: z.number().openapi({ description: 'Facturas emitidas, con impuestos' }),
    ventas: z.number().openapi({ description: 'Ventas sin factura (las que la tienen, por ella)' }),
    otros: z.number().openapi({ description: 'Otros ingresos vigentes' }),
    total: z.number(),
  }),
  gastos: z.object({
    facturas: z.number().openapi({ description: 'Facturas recibidas, con impuestos' }),
    otros: z.number().openapi({ description: 'Otros gastos vigentes' }),
    total: z.number(),
  }),
  resultado: z.number().openapi({ description: 'Ingresos menos gastos' }),
}

const Resumen = z
  .object({
    periodo: z.enum(PERIODOS),
    desde: z.iso.date(),
    hasta: z.iso.date(),
    filas: z
      .array(
        z.object({
          clave: z.string().openapi({ example: '2026-T4', description: '2026-10, 2026-T4 o 2026' }),
          desde: z.iso.date(),
          hasta: z.iso.date(),
          ...Cifras,
        }),
      )
      .openapi({ description: 'Cada periodo entre desde y hasta, también los vacíos' }),
    total: z.object(Cifras),
    pendiente: z
      .object({ cobro: z.number(), pago: z.number() })
      .openapi({ description: 'Facturas sin fecha de pago del rango: emitidas y recibidas' }),
  })
  .openapi('ResumenFinanzas')

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const ver = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/informes/resumen',
  tags: ['Finanzas'],
  summary: 'Resumen de ingresos y gastos por mes, trimestre o año',
  description:
    'Con impuestos y por la fecha de cada factura o movimiento. Ingresos: facturas emitidas, ventas sin factura y otros ingresos; gastos: facturas recibidas y otros gastos. Sin los anulados. Como mucho 10 años.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: z.object({
      explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
    }),
    query: FiltrosResumen,
  },
  responses: {
    200: { description: 'El resumen', content: { 'application/json': { schema: Resumen } } },
    400: error('Fechas no válidas (validacion)'),
    401: error('Sin sesión'),
    403: error('Sin acceso a la explotación, o no es su administrador'),
    404: error('No existe la explotación'),
  },
})

export const rutasInformes = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida }).openapi(ver, async (c) => {
    const filtros = c.req.valid('query')
    return c.json(await enLaExplotacion(c, (tx) => resumen(tx, filtros)), 200)
  })
