import { useQuery } from '@tanstack/react-query'

// Sesión con Better Auth (backend: /api/auth). Estas rutas no forman parte del contrato OpenAPI, así
// que se llaman con fetch y sus errores ({ code, message }) se traducen aquí.

export type Usuario = {
  id: string
  name: string
  email: string
  username: string | null
  propietario: boolean
  debeCambiarContrasena: boolean
}

export type Sesion = { usuario: Usuario }

export const CLAVE_SESION = ['sesion'] as const

export class ErrorAutenticacion extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorAutenticacion'
  }
}

const MENSAJES: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: 'El usuario o la contraseña no son correctos',
  INVALID_EMAIL_OR_PASSWORD: 'El usuario o la contraseña no son correctos',
  INVALID_USERNAME: 'El usuario o la contraseña no son correctos',
  INVALID_EMAIL: 'El usuario o la contraseña no son correctos',
  USUARIO_DESACTIVADO: 'Tu usuario está desactivado. Habla con el administrador de la explotación.',
  INVALID_PASSWORD: 'La contraseña actual no es correcta',
  PASSWORD_TOO_SHORT: 'La contraseña nueva debe tener al menos 10 caracteres',
}

async function llamar(ruta: string, cuerpo?: object) {
  let respuesta: Response
  try {
    respuesta = await globalThis.fetch(`/api/auth${ruta}`, {
      method: cuerpo ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: cuerpo ? { 'content-type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    })
  } catch {
    throw new ErrorAutenticacion(
      0,
      'sin_conexion',
      'No hay conexión con el servidor. Inténtalo de nuevo.',
    )
  }
  const datos = await respuesta.json().catch(() => null)
  if (respuesta.ok) return datos
  if (respuesta.status === 429) {
    throw new ErrorAutenticacion(
      429,
      'demasiados_intentos',
      'Demasiados intentos. Espera un minuto y vuelve a probar.',
    )
  }
  const codigo: string = datos?.code ?? 'error'
  throw new ErrorAutenticacion(
    respuesta.status,
    codigo,
    MENSAJES[codigo] ?? 'No se ha podido completar la operación. Inténtalo de nuevo.',
  )
}

export async function obtenerSesion(): Promise<Sesion | null> {
  const datos = await llamar('/get-session')
  return datos?.user ? { usuario: datos.user as Usuario } : null
}

// Con @ se entra por email; si no, por nombre de usuario
export async function iniciarSesion(identificador: string, contrasena: string) {
  const id = identificador.trim()
  await (id.includes('@')
    ? llamar('/sign-in/email', { email: id, password: contrasena })
    : llamar('/sign-in/username', { username: id, password: contrasena }))
}

export async function cerrarSesion() {
  await llamar('/sign-out', {})
}

export async function cambiarContrasena(actual: string, nueva: string) {
  await llamar('/change-password', {
    currentPassword: actual,
    newPassword: nueva,
    revokeOtherSessions: false,
  })
}

export const useSesion = () =>
  useQuery({ queryKey: CLAVE_SESION, queryFn: obtenerSesion, staleTime: 5 * 60_000 })
