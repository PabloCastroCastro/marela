import { vi } from 'vitest'

// API simulada para los tests de pantallas: sesión de Better Auth, explotaciones del usuario y gestión
// de la plataforma, con un estado que las pruebas preparan y que cambia como lo haría el backend.

type Rol = 'administrador' | 'empleado'

export type ExplotacionSimulada = {
  id: string
  nombre: string
  rega: string
  rol: Rol
  municipio?: string
  provincia?: string
  activa?: boolean
}

// Lo que ve el propietario en la gestión de la plataforma
export type ExplotacionDePlataforma = {
  id: string
  nombre: string
  rega: string
  municipio: string | null
  provincia: string | null
  activa: boolean
  miembros: number
  creadaEn: string
}

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
  plataforma: ExplotacionDePlataforma[]
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
  municipio: 'Lalín',
  provincia: 'Pontevedra',
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
    explotaciones: [{ ...A_VEIGA }, { ...O_SOUTO }],
    plataforma: [],
    ...cambios,
  }
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status })
const errorApi = (status: number, codigo: string, detalles?: unknown) =>
  json({ error: { codigo, mensaje: codigo, detalles } }, status)

const DETALLE = /^\/api\/explotaciones\/([^/]+)$/
const EN_PLATAFORMA = /^\/api\/plataforma\/explotaciones\/([^/]+)$/

// Sustituye fetch por la API simulada. Devuelve el mock, para comprobar las llamadas.
export function simularApi(estado: EstadoSimulado) {
  const mock = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const peticion =
      entrada instanceof Request
        ? entrada
        : new Request(new URL(String(entrada), 'http://localhost'), opciones)
    const ruta = new URL(peticion.url).pathname
    const metodo = peticion.method
    const cuerpo =
      metodo === 'POST' || metodo === 'PATCH' ? await peticion.json().catch(() => ({})) : {}

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

    if (ruta === '/api/explotaciones') {
      return json(
        estado.explotaciones
          .filter((e) => e.activa !== false)
          .map(({ id, nombre, rega, rol }) => ({ id, nombre, rega, rol })),
      )
    }
    const detalle = ruta.match(DETALLE)
    if (detalle) {
      const e = estado.explotaciones.find((x) => x.id === detalle[1])
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.activa === false) return errorApi(403, 'explotacion_desactivada')
      if (metodo === 'PATCH') {
        if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
        Object.assign(e, cuerpo)
      }
      return json({
        id: e.id,
        nombre: e.nombre,
        rega: e.rega,
        rol: e.rol,
        municipio: e.municipio ?? null,
        provincia: e.provincia ?? null,
        modulos: MODULOS[e.rol],
      })
    }

    if (ruta.startsWith('/api/plataforma/')) {
      if (!estado.usuario.propietario) return errorApi(403, 'sin_permiso')
      if (ruta === '/api/plataforma/explotaciones' && metodo === 'GET') {
        return json(estado.plataforma)
      }
      if (ruta === '/api/plataforma/explotaciones' && metodo === 'POST') {
        if (estado.plataforma.some((e) => e.rega === cuerpo.rega)) {
          return errorApi(409, 'rega_en_uso', [
            { campo: 'rega', mensaje: 'Ya hay una explotación con este código REGA' },
          ])
        }
        const nueva: ExplotacionDePlataforma = {
          id: `00000000-0000-7000-8009-${String(estado.plataforma.length + 1).padStart(12, '0')}`,
          nombre: cuerpo.nombre,
          rega: cuerpo.rega,
          municipio: cuerpo.municipio,
          provincia: cuerpo.provincia,
          activa: true,
          miembros: 1,
          creadaEn: '2026-10-24T10:00:00.000Z',
        }
        estado.plataforma.push(nueva)
        const nuevo = cuerpo.administrador.tipo === 'nuevo'
        return json(
          {
            explotacion: nueva,
            administrador: {
              id: 'admin-1',
              usuario: String(cuerpo.administrador.usuario).toLowerCase(),
              nombre: nuevo ? cuerpo.administrador.nombre : 'Usuario existente',
            },
            ...(nuevo ? { contrasenaTemporal: 'Temporal2345' } : {}),
          },
          201,
        )
      }
      const una = ruta.match(EN_PLATAFORMA)
      const e = estado.plataforma.find((x) => x.id === una?.[1])
      if (e && metodo === 'PATCH') {
        e.activa = cuerpo.activa
        return json(e)
      }
    }
    return errorApi(404, 'no_encontrado')
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
