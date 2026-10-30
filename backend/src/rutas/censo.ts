import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { importarCenso, leerCenso, planImportacion, VistaPreviaCenso } from '../censo.js'
import { ErrorApi, validacionFallida } from '../errores.js'
import { type EnvExplotacion, enLaExplotacion, permitir } from '../permisos.js'
import { error, json } from './animales.js'
import { cuerpoArchivo, limiteSubida } from './archivos.js'

// Importación de los animales desde el censo en PDF de la Xunta (GH-130): solo el administrador.
// La vista previa y la importación reciben el mismo PDF; la importación lo vuelve a leer, así que
// no se guarda nada entre las dos.

const Parametros = z.object({
  explotacionId: z.string().openapi({ param: { name: 'explotacionId', in: 'path' } }),
})

const ruta = '/explotaciones/{explotacionId}/censo'

const errores = {
  400: error('Falta el archivo (validacion)'),
  401: error('Sin sesión'),
  403: error('Sin acceso a la explotación, o no es su administrador'),
  404: error('No existe la explotación'),
  413: error('El archivo ocupa más de 10 MB (archivo_demasiado_grande)'),
  415: error('No es un PDF (tipo_de_archivo)'),
  422: error(
    'No se reconoce el censo, es de otra explotación o le faltan animales (censo_no_reconocido, censo_de_otra_explotacion, censo_incompleto)',
  ),
}

const vistaPrevia = createRoute({
  method: 'post',
  path: `${ruta}/vista-previa`,
  tags: ['Animales'],
  summary: 'Vista previa de la importación del censo en PDF',
  description:
    'Lee el censo a una fecha de la Xunta y dice qué animales se darían de alta, cuáles ya están (con los datos que no coinciden) y cuáles activos faltan en el censo. No cambia nada.',
  security: [{ sesion: [] }],
  middleware: [permitir('administracion'), limiteSubida] as const,
  request: { params: Parametros, body: cuerpoArchivo },
  responses: { 200: json(VistaPreviaCenso, 'Lo que se importaría'), ...errores },
})

const importar = createRoute({
  method: 'post',
  path: `${ruta}/importacion`,
  tags: ['Animales'],
  summary: 'Importar los animales del censo en PDF',
  description:
    'Da de alta los animales del censo que no están en la aplicación, todos o ninguno. Los que ya están no se tocan.',
  security: [{ sesion: [] }],
  middleware: [permitir('administracion'), limiteSubida] as const,
  request: { params: Parametros, body: cuerpoArchivo },
  responses: {
    200: json(
      z.object({ creados: z.number().int(), fecha: z.iso.date() }).openapi('ImportacionCenso'),
      'Cuántos se han dado de alta, y la fecha del censo',
    ),
    ...errores,
    409: error('Un crotal del censo está en otra explotación de la plataforma (crotal_en_uso)'),
  },
})

// El censo del PDF subido
async function censoSubido(c: Context<EnvExplotacion>, archivo: File) {
  const contenido = new Uint8Array(await archivo.arrayBuffer())
  if (new TextDecoder().decode(contenido.subarray(0, 5)) !== '%PDF-') {
    const mensaje = 'El censo tiene que ser el PDF que descarga la Xunta'
    throw new ErrorApi(415, 'tipo_de_archivo', mensaje, [{ campo: 'archivo', mensaje }])
  }
  return { censo: await leerCenso(contenido), rega: c.var.explotacion.rega }
}

export const rutasCenso = () =>
  new OpenAPIHono<EnvExplotacion>({ defaultHook: validacionFallida })
    .openapi(vistaPrevia, async (c) => {
      const { censo, rega } = await censoSubido(c, c.req.valid('form').archivo)
      return c.json(await enLaExplotacion(c, (tx) => planImportacion(tx, censo, rega)), 200)
    })
    .openapi(importar, async (c) => {
      const { censo, rega } = await censoSubido(c, c.req.valid('form').archivo)
      const { creados } = await enLaExplotacion(c, async (tx) =>
        importarCenso(tx, await planImportacion(tx, censo, rega)),
      )
      return c.json({ creados, fecha: censo.fecha }, 200)
    })
