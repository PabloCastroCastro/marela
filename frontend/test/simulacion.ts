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
  // El usuario es miembro, pero el administrador lo ha desactivado
  miembroDesactivado?: boolean
}

// Equipo de A Veiga, que gestiona Ana
export type MiembroSimulado = {
  id: string
  usuarioId: string
  usuario: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  // Tiene acceso a otras explotaciones: su administrador no puede restablecerle la contraseña
  otras?: boolean
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

// Animales de A Veiga
export type AnimalSimulado = {
  id: string
  crotal: string
  nombre: string | null
  raza: string
  sexo: 'hembra' | 'macho'
  fechaNacimiento: string
  madreId: string | null
  madreTexto: string | null
  padreId: string | null
  padreTexto: string | null
  origen: 'nacido' | 'comprado'
  fechaEntrada: string | null
  regaOrigen: string | null
  estado: 'activo' | 'vendido' | 'muerto' | 'baja'
  tipoBaja: 'venta' | 'muerte' | 'sacrificio' | 'robo_extravio' | 'otra' | null
  fechaBaja: string | null
  causaBaja: string | null
  observaciones: string | null
}

export const animalSimulado = (
  cambios: Partial<AnimalSimulado> & { id: string; crotal: string },
): AnimalSimulado => ({
  nombre: null,
  raza: 'Rubia Gallega',
  sexo: 'hembra',
  fechaNacimiento: '2020-01-01',
  madreId: null,
  madreTexto: null,
  padreId: null,
  padreTexto: null,
  origen: 'nacido',
  fechaEntrada: null,
  regaOrigen: null,
  estado: 'activo',
  tipoBaja: null,
  fechaBaja: null,
  causaBaja: null,
  observaciones: null,
  ...cambios,
})

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
  miembros: MiembroSimulado[]
  animales: AnimalSimulado[]
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
    miembros: [
      {
        id: 'm1',
        usuarioId: 'u1',
        usuario: 'ana',
        nombre: 'Ana Varela',
        email: 'ana@marela.test',
        rol: 'administrador',
        activo: true,
      },
      {
        id: 'm2',
        usuarioId: 'u2',
        usuario: 'maria',
        nombre: 'María Souto',
        email: 'maria@marela.test',
        rol: 'empleado',
        activo: true,
      },
      {
        id: 'm3',
        usuarioId: 'u3',
        usuario: 'xose',
        nombre: 'Xosé Lema',
        email: 'xose@marela.test',
        rol: 'empleado',
        activo: true,
        otras: true,
      },
    ],
    animales: [
      animalSimulado({
        id: 'a1',
        crotal: 'ES041503456789',
        nombre: 'Marela',
        fechaNacimiento: '2019-03-14',
      }),
      animalSimulado({
        id: 'a2',
        crotal: 'ES041503456812',
        nombre: 'Moreno',
        sexo: 'macho',
        fechaNacimiento: '2018-11-20',
      }),
      animalSimulado({
        id: 'a3',
        crotal: 'ES041503457001',
        fechaNacimiento: '2026-02-11',
        madreId: 'a1',
        padreId: 'a2',
      }),
      animalSimulado({
        id: 'a4',
        crotal: 'ES041503457099',
        nombre: 'Vendida',
        raza: 'Limusina',
        estado: 'vendido',
        tipoBaja: 'venta',
        fechaBaja: '2026-05-01',
        causaBaja: 'Venta',
      }),
    ],
    ...cambios,
  }
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status })
const errorApi = (status: number, codigo: string, detalles?: unknown) =>
  json({ error: { codigo, mensaje: codigo, detalles } }, status)

const DETALLE = /^\/api\/explotaciones\/([^/]+)$/
const EQUIPO = /^\/api\/explotaciones\/([^/]+)\/miembros(?:\/([^/]+))?(?:\/([^/]+))?$/
const ANIMALES = /^\/api\/explotaciones\/([^/]+)\/animales(?:\/([^/]+))?$/
const BAJA = /^\/api\/explotaciones\/[^/]+\/animales\/([^/]+)\/baja$/
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
      if (e.miembroDesactivado) return errorApi(403, 'miembro_desactivado')
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

    const deBaja = ruta.match(BAJA)
    if (deBaja) {
      const a = estado.animales.find((x) => x.id === deBaja[1])
      if (!a) return errorApi(404, 'animal_no_encontrado')
      if (metodo === 'POST') {
        if (cuerpo.tipo === 'otra' && !cuerpo.causa) {
          return errorApi(400, 'validacion', [
            { campo: 'causa', mensaje: 'Explica la causa de la baja' },
          ])
        }
        const porTipo = {
          muerte: 'muerto',
          sacrificio: 'muerto',
          robo_extravio: 'baja',
          otra: 'baja',
        } as const
        Object.assign(a, {
          estado: porTipo[cuerpo.tipo as keyof typeof porTipo],
          tipoBaja: cuerpo.tipo,
          fechaBaja: cuerpo.fecha,
          causaBaja: cuerpo.causa ?? null,
        })
      } else {
        if (a.tipoBaja === 'venta') return errorApi(409, 'baja_por_venta')
        Object.assign(a, { estado: 'activo', tipoBaja: null, fechaBaja: null, causaBaja: null })
      }
      return json({
        ...a,
        madre: null,
        padre: null,
        hijos: [],
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-02T10:00:00.000Z',
      })
    }

    const deAnimales = ruta.match(ANIMALES)
    if (deAnimales) {
      const [, , animalId] = deAnimales
      const resumen = (id: string | null) => {
        const p = estado.animales.find((x) => x.id === id)
        return p ? { id: p.id, crotal: p.crotal, nombre: p.nombre } : null
      }
      const ficha = (a: AnimalSimulado) => ({
        ...a,
        madre: resumen(a.madreId),
        padre: resumen(a.padreId),
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-02T10:00:00.000Z',
      })
      const detalle = (a: AnimalSimulado) => ({
        ...ficha(a),
        hijos: estado.animales
          .filter((h) => h.madreId === a.id || h.padreId === a.id)
          .map((h) => ({
            id: h.id,
            crotal: h.crotal,
            nombre: h.nombre,
            sexo: h.sexo,
            fechaNacimiento: h.fechaNacimiento,
            estado: h.estado,
          })),
      })
      const validar = (datos: AnimalSimulado) => {
        if (!/^ES[0-9]{12}$/.test(datos.crotal)) {
          return errorApi(400, 'validacion', [
            { campo: 'crotal', mensaje: 'El crotal son las letras ES y 12 dígitos' },
          ])
        }
        if (estado.animales.some((x) => x.crotal === datos.crotal && x.id !== datos.id)) {
          return errorApi(409, 'crotal_en_uso', [
            { campo: 'crotal', mensaje: 'Ya hay un animal con este crotal' },
          ])
        }
        return null
      }
      if (animalId === 'razas') return json(['Limusina', 'Rubia Gallega'])
      if (!animalId && metodo === 'GET') {
        const q = new URL(peticion.url).searchParams
        const texto = (q.get('q') ?? '').toLowerCase()
        return json(
          estado.animales
            .filter((a) => !q.get('estado') || a.estado === q.get('estado'))
            .filter((a) => !q.get('sexo') || a.sexo === q.get('sexo'))
            .filter(
              (a) =>
                !texto ||
                [a.crotal, a.nombre ?? '', a.raza].join(' ').toLowerCase().includes(texto),
            )
            .map(ficha),
        )
      }
      if (!animalId && metodo === 'POST') {
        const nuevo = animalSimulado({ ...cuerpo, id: `a${estado.animales.length + 1}` })
        const fallo = validar(nuevo)
        if (fallo) return fallo
        estado.animales.push(nuevo)
        return json(detalle(nuevo), 201)
      }
      const a = estado.animales.find((x) => x.id === animalId)
      if (!a) return errorApi(404, 'animal_no_encontrado')
      if (metodo === 'PATCH') {
        const fallo = validar({ ...a, ...cuerpo })
        if (fallo) return fallo
        Object.assign(a, cuerpo)
      }
      return json(detalle(a))
    }

    const equipo = ruta.match(EQUIPO)
    if (equipo) {
      const [, , miembroId, accion] = equipo
      const sinMiembro = ({ otras: _o, ...m }: MiembroSimulado) => m
      if (!miembroId && metodo === 'GET') return json(estado.miembros.map(sinMiembro))
      if (!miembroId && metodo === 'POST') {
        if (cuerpo.tipo === 'existente' && cuerpo.usuario !== 'dani') {
          return errorApi(404, 'usuario_no_encontrado', [
            { campo: 'usuario', mensaje: 'No hay ningún usuario activo con este nombre' },
          ])
        }
        const nuevo: MiembroSimulado = {
          id: `m${estado.miembros.length + 1}`,
          usuarioId: `u${estado.miembros.length + 1}`,
          usuario: String(cuerpo.usuario).toLowerCase(),
          nombre: cuerpo.tipo === 'nuevo' ? cuerpo.nombre : 'Dani Rey',
          email: cuerpo.tipo === 'nuevo' ? cuerpo.email : 'dani@marela.test',
          rol: cuerpo.rol,
          activo: true,
        }
        estado.miembros.push(nuevo)
        return json(
          {
            miembro: sinMiembro(nuevo),
            ...(cuerpo.tipo === 'nuevo' ? { contrasenaTemporal: 'Temporal6789' } : {}),
          },
          201,
        )
      }
      const m = estado.miembros.find((x) => x.id === miembroId)
      if (!m) return errorApi(404, 'miembro_no_encontrado')
      if (accion === 'restablecer-contrasena') {
        if (m.otras) return errorApi(409, 'otras_explotaciones')
        return json({ miembro: sinMiembro(m), contrasenaTemporal: 'Nueva2345678' })
      }
      if (metodo === 'PATCH') {
        const despues = { ...m, ...cuerpo }
        const quedan = estado.miembros
          .map((x) => (x.id === m.id ? despues : x))
          .filter((x) => x.rol === 'administrador' && x.activo)
        if (quedan.length === 0) {
          return json(
            {
              error: {
                codigo: 'ultimo_administrador',
                mensaje: 'La explotación tiene que tener al menos un administrador activo',
              },
            },
            409,
          )
        }
        Object.assign(m, cuerpo)
        return json(sinMiembro(m))
      }
    }

    if (ruta.startsWith('/api/plataforma/')) {
      if (!estado.usuario.propietario) return errorApi(403, 'sin_permiso')
      if (ruta === '/api/plataforma/usuarios/restablecer-contrasena') {
        if (cuerpo.usuario !== 'xose') {
          return errorApi(404, 'usuario_no_encontrado', [
            { campo: 'usuario', mensaje: 'No hay ningún usuario con este nombre' },
          ])
        }
        return json({ usuario: 'xose', nombre: 'Xosé Lema', contrasenaTemporal: 'Propia234567' })
      }
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
