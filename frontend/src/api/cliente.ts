import createClient from 'openapi-fetch'
import { marcarSinConexion } from '../sinConexion/conexion'
import type { paths } from './esquema'

// Cliente tipado de la API. Los tipos se generan del contrato del backend (npm run api:generar), así
// que una ruta o un campo que no exista no compila. Las peticiones van al mismo origen (/api), con la
// cookie de sesión.
export const api = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? '',
  credentials: 'same-origin',
  // fetch se resuelve en cada petición (y no al crear el cliente), para poder simularlo en los tests.
  // Si no llega al servidor, se marca sin conexión (GH-31) y se lanza un ErrorApi con estado 0.
  fetch: async (peticion) => {
    try {
      return await globalThis.fetch(peticion)
    } catch {
      marcarSinConexion()
      throw errorSinConexion()
    }
  },
})

// Error de la API con el formato común { error: { codigo, mensaje, detalles? } }
export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalles?: unknown,
  ) {
    super(mensaje)
    this.name = 'ErrorApi'
  }
}

// Sin respuesta del servidor: sin cobertura o sin red
export const errorSinConexion = () =>
  new ErrorApi(0, 'sin_conexion', 'No hay conexión con el servidor. Inténtalo de nuevo.')

export const esSinConexion = (error: unknown) => error instanceof ErrorApi && error.estado === 0

type Respuesta<T> = { data?: T; error?: unknown; response: Response }

function errorDe(respuesta: Respuesta<unknown>): ErrorApi {
  const cuerpo = (
    respuesta.error as
      | { error?: { codigo?: string; mensaje?: string; detalles?: unknown } }
      | undefined
  )?.error
  return new ErrorApi(
    respuesta.response.status,
    cuerpo?.codigo ?? 'error',
    cuerpo?.mensaje ?? 'No se ha podido conectar con el servidor. Inténtalo de nuevo.',
    cuerpo?.detalles,
  )
}

// Devuelve los datos o lanza un ErrorApi, para usarlo en las consultas de TanStack Query:
//   useQuery({ queryKey: ['salud'], queryFn: () => datos(api.GET('/api/health')) })
export async function datos<T>(peticion: Promise<Respuesta<T>>): Promise<T> {
  const respuesta = await peticion
  if (respuesta.response.ok && respuesta.data !== undefined) return respuesta.data
  throw errorDe(respuesta)
}

// Para operaciones sin datos de respuesta (204: borrar, retirar…): solo comprueba que ha ido bien
export async function enviar(peticion: Promise<Respuesta<unknown>>): Promise<void> {
  const respuesta = await peticion
  if (!respuesta.response.ok) throw errorDe(respuesta)
}

// Errores de validación de la API por campo: { campo: mensaje }
export function erroresPorCampo(error: unknown): Record<string, string> {
  if (!(error instanceof ErrorApi) || !Array.isArray(error.detalles)) return {}
  return Object.fromEntries(
    (error.detalles as { campo: string; mensaje: string }[]).map((d) => [d.campo, d.mensaje]),
  )
}
