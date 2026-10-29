import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { REGIMENES_FISCALES } from '../db/schema/index.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import { DatosFiscales, guardarFiscal, verFiscal } from '../fiscal.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'

// Régimen fiscal de la explotación (GH-34), en Finanzas: solo el administrador

const Fiscal = z
  .object({
    regimen: z.enum(REGIMENES_FISCALES).openapi({
      description: 'REAGP (recibo de compensación en las ventas) o régimen general de IVA',
    }),
    compensacionReagp: z.number().openapi({ description: 'Porcentaje de compensación del REAGP' }),
    tiposIva: z.array(z.number()).openapi({ description: 'Tipos de IVA, de mayor a menor' }),
    configurado: z.boolean().openapi({
      description: 'Si se ha guardado; si no, son los valores por defecto',
    }),
    modificadoEn: z.iso.datetime().nullable(),
  })
  .openapi('Fiscal')

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
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
  404: error('No existe la explotación'),
}

const ruta = '/explotaciones/{explotacionId}/fiscal'

const ver = createRoute({
  method: 'get',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Régimen fiscal de la explotación',
  description: 'Mientras no se guarda: REAGP con el 10,5 % y los tipos de IVA 21, 10 y 4 %.',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: { params: Parametros },
  responses: { 200: json(Fiscal, 'El régimen y sus porcentajes'), ...comunes },
})

const guardar = createRoute({
  method: 'put',
  path: ruta,
  tags: ['Finanzas'],
  summary: 'Cambiar el régimen fiscal y sus porcentajes',
  security: [{ sesion: [] }],
  middleware: [permitir('finanzas')] as const,
  request: {
    params: Parametros,
    body: { content: { 'application/json': { schema: DatosFiscales } }, required: true },
  },
  responses: {
    200: json(Fiscal, 'Guardado'),
    400: error('Datos no válidos (validacion)'),
    ...comunes,
  },
})

export const rutasFiscal = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(ver, async (c) => c.json(await enLaExplotacion(c, verFiscal), 200))
    .openapi(guardar, async (c) => {
      const datos = c.req.valid('json')
      return c.json(await enLaExplotacion(c, (tx) => guardarFiscal(tx, datos)), 200)
    })
