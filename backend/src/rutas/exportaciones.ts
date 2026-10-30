import { Readable } from 'node:stream'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { listarApuntes } from '../apuntes.js'
import { EsquemaError, validacionFallida } from '../errores.js'
import {
  archivosDe,
  columnasApuntes,
  columnasFacturas,
  columnasResumen,
  columnasVentas,
  csv,
  excel,
  zip,
} from '../exportacion.js'
import { listarFacturas } from '../facturas.js'
import { hoyEnMadrid } from '../fechas.js'
import { PERIODOS, resumen } from '../informes.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import { listarVentas } from '../ventas.js'
import { ConsultaApuntes } from './apuntes.js'
import { ConsultaFacturas } from './facturas.js'
import { ConsultaVentas } from './ventas.js'

// Exportación para el gestor (GH-40), en Finanzas: solo el administrador. Cada listado con sus
// filtros, en Excel, CSV o un .zip con el Excel y los adjuntos; y el periodo entero, en un Excel con
// todas las hojas y el resumen, o en un .zip con sus adjuntos.

const TIPOS = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  zip: 'application/zip',
} as const

const binario = z.string().openapi({ format: 'binary' })

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const conFormato = <T extends z.ZodRawShape>(consulta: z.ZodObject<T>) =>
  consulta.extend({
    formato: z
      .enum(['xlsx', 'csv', 'zip'])
      .default('xlsx')
      .openapi({ description: 'Excel, CSV o .zip con el Excel y los adjuntos' }),
  })

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

const respuestas = (formatos: (keyof typeof TIPOS)[]) => ({
  200: {
    description: 'El archivo, para descargar',
    content: Object.fromEntries(formatos.map((f) => [TIPOS[f], { schema: binario }])),
  },
  400: error('Filtros no válidos (validacion)'),
  401: error('Sin sesión'),
  403: error('Sin acceso a la explotación, o no es su administrador'),
  404: error('No existe la explotación'),
})

const ruta = <Q extends z.ZodObject>(
  listado: string,
  summary: string,
  query: Q,
  formatos: (keyof typeof TIPOS)[],
) =>
  createRoute({
    method: 'get',
    path: `/explotaciones/{explotacionId}/exportaciones/${listado}`,
    tags: ['Finanzas'],
    summary,
    security: [{ sesion: [] }],
    middleware: [permitir('finanzas')] as const,
    request: { params: Parametros, query },
    responses: respuestas(formatos),
  })

const ConsultaPeriodo = z.object({
  desde: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
  hasta: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
  periodo: z
    .enum(PERIODOS)
    .default('mes')
    .openapi({ description: 'Cómo se agrupa la hoja del resumen' }),
  formato: z.enum(['xlsx', 'zip']).default('xlsx'),
})

// "facturas_2026-07-01_2026-09-30.xlsx"; sin fechas, la de hoy
const nombre = (base: string, f: { desde?: string; hasta?: string }, ext: string) =>
  `${[base, f.desde, f.hasta].filter(Boolean).join('_') || base}${f.desde || f.hasta ? '' : `_${hoyEnMadrid()}`}.${ext}`

const descarga = (c: Context, cuerpo: Buffer | ReadableStream, tipo: string, archivo: string) =>
  c.body(cuerpo as ReadableStream, 200, {
    'content-type': tipo,
    'content-disposition': `attachment; filename="${archivo}"; filename*=UTF-8''${encodeURIComponent(archivo)}`,
    'cache-control': 'private, no-store',
  })

const enZip = (
  excelNombre: string,
  contenido: Buffer,
  archivos: { ruta: string; nombre: string }[],
) => Readable.toWeb(zip(excelNombre, contenido, archivos)) as ReadableStream

const facturasR = ruta(
  'facturas',
  'Exportar las facturas, con sus filtros',
  conFormato(ConsultaFacturas),
  ['xlsx', 'csv', 'zip'],
)
const ventasR = ruta(
  'ventas',
  'Exportar las ventas, con sus filtros',
  conFormato(ConsultaVentas).extend({ formato: z.enum(['xlsx', 'csv']).default('xlsx') }),
  ['xlsx', 'csv'],
)
const apuntesR = ruta(
  'apuntes',
  'Exportar los otros ingresos y gastos, con sus filtros',
  conFormato(ConsultaApuntes),
  ['xlsx', 'csv', 'zip'],
)
const periodoR = ruta(
  'periodo',
  'Exportar para el gestor todo un periodo: facturas, ventas, otros ingresos y gastos y el resumen',
  ConsultaPeriodo,
  ['xlsx', 'zip'],
)

export const rutasExportaciones = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(facturasR, async (c) => {
      const { formato, ...filtros } = c.req.valid('query')
      const archivo = (ext: string) => nombre('facturas', filtros, ext)
      return enLaExplotacion(c, async (tx) => {
        const filas = await listarFacturas(tx, filtros)
        if (formato === 'csv')
          return descarga(c, csv(columnasFacturas(), filas), TIPOS.csv, archivo('csv'))
        if (formato === 'xlsx') {
          const libro = await excel([{ nombre: 'Facturas', columnas: columnasFacturas(), filas }])
          return descarga(c, libro, TIPOS.xlsx, archivo('xlsx'))
        }
        const { enZip: archivos, nombres } = await archivosDe(tx, filas, [])
        const libro = await excel([
          { nombre: 'Facturas', columnas: columnasFacturas(nombres.facturas), filas },
        ])
        return descarga(c, enZip(archivo('xlsx'), libro, archivos), TIPOS.zip, archivo('zip'))
      })
    })
    .openapi(ventasR, async (c) => {
      const { formato, ...filtros } = c.req.valid('query')
      const archivo = (ext: string) => nombre('ventas', filtros, ext)
      return enLaExplotacion(c, async (tx) => {
        const filas = await listarVentas(tx, filtros)
        if (formato === 'csv')
          return descarga(c, csv(columnasVentas, filas), TIPOS.csv, archivo('csv'))
        const libro = await excel([{ nombre: 'Ventas', columnas: columnasVentas, filas }])
        return descarga(c, libro, TIPOS.xlsx, archivo('xlsx'))
      })
    })
    .openapi(apuntesR, async (c) => {
      const { formato, ...filtros } = c.req.valid('query')
      const archivo = (ext: string) => nombre('otros-ingresos-y-gastos', filtros, ext)
      return enLaExplotacion(c, async (tx) => {
        const filas = await listarApuntes(tx, filtros)
        if (formato === 'csv')
          return descarga(c, csv(columnasApuntes(), filas), TIPOS.csv, archivo('csv'))
        if (formato === 'xlsx') {
          const libro = await excel([
            { nombre: 'Otros ingresos y gastos', columnas: columnasApuntes(), filas },
          ])
          return descarga(c, libro, TIPOS.xlsx, archivo('xlsx'))
        }
        const { enZip: archivos, nombres } = await archivosDe(tx, [], filas)
        const libro = await excel([
          { nombre: 'Otros ingresos y gastos', columnas: columnasApuntes(nombres.apuntes), filas },
        ])
        return descarga(c, enZip(archivo('xlsx'), libro, archivos), TIPOS.zip, archivo('zip'))
      })
    })
    .openapi(periodoR, async (c) => {
      const { formato, periodo, desde, hasta } = c.req.valid('query')
      const archivo = (ext: string) => nombre('finanzas', { desde, hasta }, ext)
      return enLaExplotacion(c, async (tx) => {
        const deFacturas = await listarFacturas(tx, { desde, hasta })
        const deVentas = await listarVentas(tx, { desde, hasta })
        const deApuntes = await listarApuntes(tx, { desde, hasta })
        const delResumen = await resumen(tx, { periodo, desde, hasta })
        const { enZip: archivos, nombres } =
          formato === 'zip'
            ? await archivosDe(tx, deFacturas, deApuntes)
            : { enZip: [], nombres: undefined }
        const libro = await excel([
          {
            nombre: 'Resumen',
            columnas: columnasResumen,
            filas: delResumen.filas,
          },
          { nombre: 'Facturas', columnas: columnasFacturas(nombres?.facturas), filas: deFacturas },
          { nombre: 'Ventas', columnas: columnasVentas, filas: deVentas },
          {
            nombre: 'Otros ingresos y gastos',
            columnas: columnasApuntes(nombres?.apuntes),
            filas: deApuntes,
          },
        ])
        if (formato === 'xlsx') return descarga(c, libro, TIPOS.xlsx, archivo('xlsx'))
        return descarga(c, enZip(archivo('xlsx'), libro, archivos), TIPOS.zip, archivo('zip'))
      })
    })
