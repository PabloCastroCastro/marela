import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { config } from './config.js'
import { ErrorApi } from './errores.js'
import { logger } from './logger.js'

// Archivos adjuntos (docs/diseno.md, "Infraestructura"): en el directorio ARCHIVOS_DIR (el volumen
// uploads en el servidor), separados por explotación y con nombres generados, nunca el original. La
// base de datos guarda la ruta relativa. Los usan las facturas (GH-35) y, más adelante, las fotos.

export const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024

// Tipos admitidos, reconocidos por su contenido y no por lo que dice el navegador
const TIPOS = [
  {
    tipo: 'application/pdf',
    extension: 'pdf',
    firma: (b: Uint8Array) => empiezaPor(b, [0x25, 0x50, 0x44, 0x46]),
  },
  {
    tipo: 'image/jpeg',
    extension: 'jpg',
    firma: (b: Uint8Array) => empiezaPor(b, [0xff, 0xd8, 0xff]),
  },
  {
    tipo: 'image/png',
    extension: 'png',
    firma: (b: Uint8Array) => empiezaPor(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    tipo: 'image/webp',
    extension: 'webp',
    firma: (b: Uint8Array) =>
      empiezaPor(b, [0x52, 0x49, 0x46, 0x46]) &&
      empiezaPor(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
] as const

export type TipoArchivo = (typeof TIPOS)[number]['tipo']

function empiezaPor(bytes: Uint8Array, firma: number[]) {
  return bytes.length >= firma.length && firma.every((b, i) => bytes[i] === b)
}

const directorio = () => resolve(config.directorioArchivos)

// La ruta absoluta de una relativa, sin salir del directorio de archivos
export function rutaArchivo(ruta: string) {
  const absoluta = resolve(directorio(), ruta)
  const dentro = relative(directorio(), absoluta)
  if (!dentro || dentro.startsWith('..') || isAbsolute(dentro)) {
    throw new Error(`Ruta de archivo fuera del directorio: ${ruta}`)
  }
  return absoluta
}

// El nombre original, solo para mostrarlo y al descargar: sin rutas ni caracteres de control
export const nombreArchivo = (nombre: string) =>
  (nombre.split(/[\\/]/).pop() ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: se quitan precisamente los de control
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 120) || 'archivo'

// Comprueba el archivo y lo guarda en {explotación}/{carpeta}/{uuid}.{extensión}
export async function guardarArchivo(explotacionId: string, carpeta: string, archivo: File) {
  if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
    const mensaje = 'El archivo ocupa más de 10 MB'
    throw new ErrorApi(413, 'archivo_demasiado_grande', mensaje, [{ campo: 'archivo', mensaje }])
  }
  const contenido = new Uint8Array(await archivo.arrayBuffer())
  const tipo = TIPOS.find((t) => t.firma(contenido))
  if (!tipo) {
    const mensaje = 'Tiene que ser un PDF o una foto (JPEG, PNG o WebP)'
    throw new ErrorApi(415, 'tipo_de_archivo', mensaje, [{ campo: 'archivo', mensaje }])
  }
  const ruta = `${explotacionId}/${carpeta}/${randomUUID()}.${tipo.extension}`
  const absoluta = rutaArchivo(ruta)
  await mkdir(dirname(absoluta), { recursive: true })
  await writeFile(absoluta, contenido, { flag: 'wx' })
  return {
    ruta,
    nombre: nombreArchivo(archivo.name),
    tipo: tipo.tipo as TipoArchivo,
    tamano: contenido.length,
  }
}

export const leerArchivo = (ruta: string) => readFile(rutaArchivo(ruta))

// Si no se puede borrar, se registra y se sigue: un archivo que sobra no rompe nada
export async function borrarArchivo(ruta: string | null | undefined) {
  if (!ruta) return
  try {
    await rm(rutaArchivo(ruta), { force: true })
  } catch (err) {
    logger.warn({ err, ruta }, 'No se ha podido borrar el archivo')
  }
}
