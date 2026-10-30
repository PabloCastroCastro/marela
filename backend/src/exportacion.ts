import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import { PassThrough } from 'node:stream'
import { type ArchiverError, ZipArchive } from 'archiver'
import { inArray } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import type { listarApuntes } from './apuntes.js'
import { rutaArchivo } from './archivos.js'
import type { Transaccion } from './db/explotacion.js'
import { apuntes, facturas } from './db/schema/index.js'
import type { listarFacturas } from './facturas.js'
import { nombrePeriodo, type resumen } from './informes.js'
import { logger } from './logger.js'
import type { listarVentas } from './ventas.js'

// Exportación para el gestor (GH-40): los listados de facturas, ventas y otros ingresos y gastos, con
// sus filtros, en Excel (.xlsx) o CSV, o en un .zip con el Excel y sus adjuntos. El periodo entero va en
// un Excel con una hoja por listado y el resumen. Fechas e importes en español: en el Excel, fechas y
// números de verdad con formato dd/mm/aaaa y euros; en el CSV, separado por punto y coma, con coma
// decimal y BOM, como lo abre Excel en España.

type Tipo = 'texto' | 'fecha' | 'euros' | 'numero'
type Columna<T> = {
  titulo: string
  valor: (fila: T) => string | number | null
  tipo?: Tipo
  ancho?: number
}
type Hoja<T> = { nombre: string; columnas: Columna<T>[]; filas: T[] }

const IMPUESTOS = { iva: 'IVA', compensacion: 'Compensación REAGP' } as const
const MODOS = { total: 'Total', por_animal: 'Por animal', por_kg: 'Por kg' } as const
const CATEGORIAS: Record<string, string> = {
  subvencion: 'Subvención (PAC u otra)',
  indemnizacion_seguro: 'Indemnización del seguro',
  otro_ingreso: 'Otro ingreso',
  seguro: 'Seguro',
  veterinario: 'Veterinario',
  combustible: 'Combustible',
  reparaciones: 'Reparaciones y mantenimiento',
  suministros: 'Suministros',
  impuestos: 'Impuestos y tasas',
  otro_gasto: 'Otro gasto',
}

// "21 %", "10,5 %"
const porcentaje = (n: number) => `${String(n).replace('.', ',')} %`
const fechaEs = (f: string) => f.split('-').reverse().join('/')

type Factura = Awaited<ReturnType<typeof listarFacturas>>[number]
type Venta = Awaited<ReturnType<typeof listarVentas>>[number]
type Apunte = Awaited<ReturnType<typeof listarApuntes>>[number]
type FilaResumen = Awaited<ReturnType<typeof resumen>>['filas'][number]

// Los archivos, con nombres legibles en el .zip: "2026-10-15 P-381 Piensos do Norte.pdf"
const nombreSeguro = (texto: string) =>
  texto
    // biome-ignore lint/suspicious/noControlCharactersInRegex: se quitan los de control
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)

export const columnasFacturas = (archivos?: Map<string, string>): Columna<Factura>[] => [
  { titulo: 'Fecha', valor: (f) => f.fecha, tipo: 'fecha' },
  { titulo: 'Tipo', valor: (f) => (f.tipo === 'emitida' ? 'Emitida' : 'Recibida'), ancho: 10 },
  { titulo: 'Número', valor: (f) => f.numero, ancho: 14 },
  { titulo: 'Proveedor o cliente', valor: (f) => f.tercero, ancho: 30 },
  { titulo: 'NIF', valor: (f) => f.nif, ancho: 12 },
  { titulo: 'Concepto', valor: (f) => f.concepto, ancho: 40 },
  { titulo: 'Base imponible', valor: (f) => f.baseImponible, tipo: 'euros' },
  { titulo: 'Impuesto', valor: (f) => IMPUESTOS[f.impuesto], ancho: 18 },
  {
    titulo: 'Tipos',
    valor: (f) => f.lineas.map((l) => porcentaje(l.porcentaje)).join(' · '),
    ancho: 14,
  },
  { titulo: 'Cuota', valor: (f) => f.cuota, tipo: 'euros' },
  { titulo: 'Total', valor: (f) => f.total, tipo: 'euros' },
  { titulo: 'Estado', valor: (f) => (f.pagadaEn ? 'Pagada' : 'Pendiente'), ancho: 10 },
  { titulo: 'Pagada el', valor: (f) => f.pagadaEn, tipo: 'fecha' },
  ...(archivos
    ? [{ titulo: 'Archivo', valor: (f: Factura) => archivos.get(f.id) ?? null, ancho: 40 }]
    : []),
]

export const columnasVentas: Columna<Venta>[] = [
  { titulo: 'Fecha', valor: (v) => v.fecha, tipo: 'fecha' },
  { titulo: 'Comprador', valor: (v) => v.comprador, ancho: 30 },
  { titulo: 'Animales', valor: (v) => v.animales.length, tipo: 'numero', ancho: 10 },
  {
    titulo: 'Crotales',
    valor: (v) => v.animales.map((a) => a.crotal ?? a.nombre ?? '').join(', '),
    ancho: 40,
  },
  { titulo: 'Kg', valor: (v) => v.kg, tipo: 'numero', ancho: 10 },
  { titulo: 'Precio', valor: (v) => MODOS[v.modoPrecio], ancho: 12 },
  { titulo: 'Precio introducido', valor: (v) => v.precio, tipo: 'numero', ancho: 14 },
  { titulo: 'Total sin impuestos', valor: (v) => v.total, tipo: 'euros' },
  { titulo: 'Factura', valor: (v) => v.factura?.numero ?? null, ancho: 14 },
  { titulo: 'Observaciones', valor: (v) => v.observaciones, ancho: 40 },
]

export const columnasApuntes = (archivos?: Map<string, string>): Columna<Apunte>[] => [
  { titulo: 'Fecha', valor: (a) => a.fecha, tipo: 'fecha' },
  { titulo: 'Tipo', valor: (a) => (a.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'), ancho: 10 },
  { titulo: 'Categoría', valor: (a) => CATEGORIAS[a.categoria] ?? a.categoria, ancho: 26 },
  { titulo: 'Concepto', valor: (a) => a.concepto, ancho: 40 },
  { titulo: 'Importe', valor: (a) => a.importe, tipo: 'euros' },
  { titulo: 'Estado', valor: (a) => (a.anulacion ? 'Anulado' : 'Vigente'), ancho: 10 },
  { titulo: 'Motivo de la anulación', valor: (a) => a.anulacion?.motivo ?? null, ancho: 30 },
  { titulo: 'Observaciones', valor: (a) => a.observaciones, ancho: 40 },
  ...(archivos
    ? [{ titulo: 'Archivo', valor: (a: Apunte) => archivos.get(a.id) ?? null, ancho: 40 }]
    : []),
]

export const columnasResumen: Columna<FilaResumen>[] = [
  { titulo: 'Periodo', valor: (f) => nombrePeriodo(f.clave), ancho: 16 },
  { titulo: 'Facturas emitidas', valor: (f) => f.ingresos.facturas, tipo: 'euros' },
  { titulo: 'Ventas sin factura', valor: (f) => f.ingresos.ventas, tipo: 'euros' },
  { titulo: 'Otros ingresos', valor: (f) => f.ingresos.otros, tipo: 'euros' },
  { titulo: 'Ingresos', valor: (f) => f.ingresos.total, tipo: 'euros' },
  { titulo: 'Facturas recibidas', valor: (f) => f.gastos.facturas, tipo: 'euros' },
  { titulo: 'Otros gastos', valor: (f) => f.gastos.otros, tipo: 'euros' },
  { titulo: 'Gastos', valor: (f) => f.gastos.total, tipo: 'euros' },
  { titulo: 'Resultado', valor: (f) => f.resultado, tipo: 'euros' },
]

const FORMATOS: Record<Tipo, string | undefined> = {
  fecha: 'dd/mm/yyyy',
  euros: '#,##0.00 "€"',
  numero: '#,##0.###',
  texto: undefined,
}

// Un Excel con una hoja por listado: cabecera en negrita y fija, fechas e importes con su formato
// biome-ignore lint/suspicious/noExplicitAny: cada hoja tiene su tipo de fila
export async function excel(hojas: Hoja<any>[]) {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Marela'
  for (const h of hojas) {
    const hoja = libro.addWorksheet(h.nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
    hoja.columns = h.columnas.map((c) => ({
      header: c.titulo,
      width: c.ancho ?? (c.tipo === 'fecha' ? 12 : c.tipo === 'euros' ? 15 : 20),
      style: FORMATOS[c.tipo ?? 'texto'] ? { numFmt: FORMATOS[c.tipo ?? 'texto'] } : {},
    }))
    hoja.getRow(1).font = { bold: true }
    for (const fila of h.filas) {
      hoja.addRow(
        h.columnas.map((c) => {
          const v = c.valor(fila)
          // Las fechas, como fechas de Excel (a medianoche en UTC, que es como las lee)
          if (c.tipo === 'fecha' && typeof v === 'string') return new Date(`${v}T00:00:00Z`)
          return v
        }),
      )
    }
  }
  return Buffer.from(await libro.xlsx.writeBuffer())
}

const celdaCsv = (v: string | number | null, tipo: Tipo = 'texto') => {
  if (v === null || v === '') return ''
  if (typeof v === 'number') return String(tipo === 'euros' ? v.toFixed(2) : v).replace('.', ',')
  const texto = tipo === 'fecha' ? fechaEs(v) : v
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

// Un CSV como lo abre Excel en España: punto y coma, coma decimal, fechas dd/mm/aaaa y BOM
export function csv<T>(columnas: Columna<T>[], filas: T[]) {
  const lineas = [
    columnas.map((c) => celdaCsv(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => celdaCsv(c.valor(f), c.tipo)).join(';')),
  ]
  return Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8')
}

// Los archivos de las facturas y de los otros ingresos y gastos, con su nombre en el .zip
export async function archivosDe(tx: Transaccion, deFacturas: Factura[], deApuntes: Apunte[]) {
  const usados = new Set<string>()
  const unico = (carpeta: string, base: string, ext: string) => {
    let nombre = `${carpeta}/${base}${ext}`
    for (let n = 2; usados.has(nombre.toLowerCase()); n++)
      nombre = `${carpeta}/${base} (${n})${ext}`
    usados.add(nombre.toLowerCase())
    return nombre
  }
  const enZip: { ruta: string; nombre: string }[] = []
  const nombres = { facturas: new Map<string, string>(), apuntes: new Map<string, string>() }

  const conArchivoF = deFacturas.filter((f) => f.archivo)
  if (conArchivoF.length > 0) {
    const rutas = await tx
      .select({ id: facturas.id, ruta: facturas.archivoRuta })
      .from(facturas)
      .where(
        inArray(
          facturas.id,
          conArchivoF.map((f) => f.id),
        ),
      )
    const porId = new Map(rutas.map((r) => [r.id, r.ruta]))
    for (const f of conArchivoF) {
      const ruta = porId.get(f.id)
      if (!ruta) continue
      const nombre = unico(
        'facturas',
        nombreSeguro(`${f.fecha} ${f.numero} ${f.tercero}`),
        extname(ruta),
      )
      enZip.push({ ruta, nombre })
      nombres.facturas.set(f.id, nombre)
    }
  }

  const conArchivoA = deApuntes.filter((a) => a.archivo)
  if (conArchivoA.length > 0) {
    const rutas = await tx
      .select({ id: apuntes.id, ruta: apuntes.archivoRuta })
      .from(apuntes)
      .where(
        inArray(
          apuntes.id,
          conArchivoA.map((a) => a.id),
        ),
      )
    const porId = new Map(rutas.map((r) => [r.id, r.ruta]))
    for (const a of conArchivoA) {
      const ruta = porId.get(a.id)
      if (!ruta) continue
      const nombre = unico(
        'otros-ingresos-y-gastos',
        nombreSeguro(`${a.fecha} ${a.concepto}`),
        extname(ruta),
      )
      enZip.push({ ruta, nombre })
      nombres.apuntes.set(a.id, nombre)
    }
  }
  return { enZip, nombres }
}

// El .zip, en streaming: el Excel y los archivos. Uno que falte en el disco se salta y se registra.
export function zip(
  nombreExcel: string,
  contenidoExcel: Buffer,
  enZip: { ruta: string; nombre: string }[],
) {
  const salida = new PassThrough()
  const archivo = new ZipArchive({ zlib: { level: 6 } })
  archivo.on('warning', (err: ArchiverError) => logger.warn({ err }, 'Aviso al crear el .zip'))
  archivo.on('error', (err: ArchiverError) => salida.destroy(err))
  archivo.pipe(salida)
  archivo.append(contenidoExcel, { name: nombreExcel })
  for (const a of enZip) {
    const ruta = rutaArchivo(a.ruta)
    if (existsSync(ruta)) archivo.file(ruta, { name: a.nombre })
    else logger.warn({ ruta: a.ruta }, 'Falta un archivo adjunto al exportar')
  }
  void archivo.finalize()
  return salida
}
