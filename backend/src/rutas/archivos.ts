import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { leerArchivo, TAMANO_MAXIMO_ARCHIVO } from '../archivos.js'
import { ErrorApi, EsquemaError } from '../errores.js'

// Piezas comunes de las rutas de los archivos adjuntos (src/archivos.ts): de las facturas (GH-35) y
// de los otros ingresos y gastos (GH-37)

// Un poco más que el máximo del archivo, por el resto del formulario
export const limiteSubida = bodyLimit({
  maxSize: TAMANO_MAXIMO_ARCHIVO + 64 * 1024,
  onError: () => {
    const mensaje = 'El archivo ocupa más de 10 MB'
    throw new ErrorApi(413, 'archivo_demasiado_grande', mensaje, [{ campo: 'archivo', mensaje }])
  },
})

// El archivo se sube como formulario, en el campo "archivo"
export const cuerpoArchivo = {
  content: {
    'multipart/form-data': {
      schema: z.object({
        archivo: z
          .instanceof(File, { message: 'Elige un archivo' })
          .openapi({ type: 'string', format: 'binary' }),
      }),
    },
  },
  required: true,
}

const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: EsquemaError } },
})

export const erroresSubida = {
  400: error('Falta el archivo (validacion)'),
  413: error('El archivo ocupa más de 10 MB (archivo_demasiado_grande)'),
  415: error('No es un PDF ni una foto (tipo_de_archivo)'),
}

export const contenidoArchivo = {
  description: 'El PDF o la foto',
  content: {
    'application/pdf': { schema: z.string().openapi({ format: 'binary' }) },
    'image/*': { schema: z.string().openapi({ format: 'binary' }) },
  },
}

// El archivo, para verlo en el navegador con su nombre; sin guardar en caché
export async function enviarArchivo(
  c: Context,
  archivo: { ruta: string; nombre: string; tipo: string },
) {
  const contenido = await leerArchivo(archivo.ruta).catch(() => {
    throw new ErrorApi(404, 'archivo_no_encontrado', 'No se encuentra el archivo')
  })
  return c.body(new Uint8Array(contenido), 200, {
    'content-type': archivo.tipo,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  })
}
