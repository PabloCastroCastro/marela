import { vi } from 'vitest'

// API simulada para los tests de pantallas: sesión de Better Auth y explotaciones del usuario, con un
// estado que las pruebas preparan y que cambia como lo haría el backend.

type Rol = 'administrador' | 'empleado'

export type ExplotacionSimulada = { id: string; nombre: string; rega: string; rol: Rol }

export type EstadoSimulado = {
  usuario: {
    id: string
    name: string
    email: string
    username: string
    propietario: boolean
    debeCambiarContrasena: boolean
  }
  contrasena: string
  conSesion: boolean
  explotaciones: ExplotacionSimulada[]
}

const MODULOS: Record<Rol, string[]> = {
  administrador: ['animales', 'comida', 'fincas', 'finanzas', 'administracion'],
  empleado: ['animales', 'comida', 'fincas'],
}

export const A_VEIGA: ExplotacionSimulada = {
  id: '00000000-0000-7000-8003-000000000001',
  nombre: 'A Veiga',
  rega: 'ES150780000001',
  rol: 'administrador',
}

export const O_SOUTO: ExplotacionSimulada = {
  id: '00000000-0000-7000-8003-000000000002',
  nombre: 'O Souto',
  rega: 'ES270280000002',
  rol: 'empleado',
}

export function estadoInicial(cambios: Partial<EstadoSimulado> = {}): EstadoSimulado {
  return {
    usuario: {
      id: 'u1',
      name: 'Ana Varela',
      email: 'ana@marela.test',
      username: 'ana',
      propietario: false,
      debeCambiarContrasena: false,
    },
    contrasena: 'contraseña-correcta',
    conSesion: false,
    explotaciones: [A_VEIGA, O_SOUTO],
    ...cambios,
  }
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status })
const errorApi = (status: number, codigo: string) =>
  json({ error: { codigo, mensaje: codigo } }, status)

// Sustituye fetch por la API simulada. Devuelve el mock, para comprobar las llamadas.
export function simularApi(estado: EstadoSimulado) {
  const mock = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const peticion =
      entrada instanceof Request
        ? entrada
        : new Request(new URL(String(entrada), 'http://localhost'), opciones)
    const ruta = new URL(peticion.url).pathname
    const cuerpo = peticion.method === 'POST' ? await peticion.json().catch(() => ({})) : {}

    if (ruta === '/api/auth/get-session') {
      return json(estado.conSesion ? { user: estado.usuario, session: {} } : null)
    }
    if (ruta === '/api/auth/sign-in/username' || ruta === '/api/auth/sign-in/email') {
      const quien = cuerpo.username ?? cuerpo.email
      const coincide = quien === estado.usuario.username || quien === estado.usuario.email
      if (!coincide || cuerpo.password !== estado.contrasena) {
        return json({ code: 'INVALID_USERNAME_OR_PASSWORD', message: 'Invalid' }, 401)
      }
      estado.conSesion = true
      return json({ user: estado.usuario })
    }
    if (ruta === '/api/auth/sign-out') {
      estado.conSesion = false
      return json({ success: true })
    }
    if (ruta === '/api/auth/change-password') {
      if (cuerpo.currentPassword !== estado.contrasena) {
        return json({ code: 'INVALID_PASSWORD', message: 'Invalid' }, 400)
      }
      estado.contrasena = cuerpo.newPassword
      estado.usuario.debeCambiarContrasena = false
      return json({ token: null })
    }
    if (ruta === '/api/health') return json({ estado: 'ok', api: 'ok', baseDeDatos: 'ok' })

    if (!estado.conSesion) return errorApi(401, 'no_autenticado')
    if (ruta === '/api/explotaciones') return json(estado.explotaciones)
    const detalle = ruta.match(/^\/api\/explotaciones\/([^/]+)$/)
    if (detalle) {
      const e = estado.explotaciones.find((x) => x.id === detalle[1])
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      return json({ ...e, modulos: MODULOS[e.rol] })
    }
    return errorApi(404, 'no_encontrado')
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
