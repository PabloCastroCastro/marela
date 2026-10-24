import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { manejarError } from '../src/errores.js'
import {
  type EnvExplotacion,
  enLaExplotacion,
  MODULOS,
  type Modulo,
  permitir,
  soloPropietario,
} from '../src/permisos.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()

// Rutas de prueba con los mismos middlewares que usarán las de datos: una por módulo, una de la
// plataforma y una que devuelve la explotación y el usuario fijados para Row-Level Security
const pruebas = new Hono<EnvExplotacion>().basePath('/api')
pruebas.onError(manejarError)
for (const modulo of MODULOS) {
  pruebas.get(`/explotaciones/:explotacionId/${modulo}`, permitir(modulo), (c) =>
    c.json({ rol: c.var.rol }),
  )
}
pruebas.get('/plataforma', soloPropietario(), (c) => c.json({ ok: true }))
pruebas.get('/explotaciones/:explotacionId/contexto', permitir(), (c) =>
  enLaExplotacion(c, async (tx) => {
    const [fila] = (
      await tx.execute<{ explotacion: string; usuario: string; rol: string }>(
        sql`select explotacion_actual() as explotacion, usuario_actual() as usuario, current_user as rol`,
      )
    ).rows
    return c.json(fila)
  }),
)

const pedir = (destino: Hono<EnvExplotacion> | typeof app, ruta: string, cookie?: string) =>
  destino.request(`/api${ruta}`, { headers: cookie ? { cookie } : {} })

const codigo = async (res: Response) =>
  ((await res.json()) as { error: { codigo: string } }).error.codigo

// Explotaciones A y B. Ana administra A y es empleada de B; Brais es empleado de A; Carla solo es de
// B; Pablo es el propietario de la plataforma y no es miembro de ninguna
let a: { id: string; name: string; rega: string }
let b: { id: string; name: string; rega: string }
const cookies: Record<'ana' | 'brais' | 'carla' | 'pablo' | 'temporal', string> = {
  ana: '',
  brais: '',
  carla: '',
  pablo: '',
  temporal: '',
}
let anaId = ''

beforeAll(async () => {
  a = await nuevaExplotacion('A Veiga de prueba')
  b = await nuevaExplotacion('B Souto de prueba')
  const ana = await nuevoUsuario()
  const brais = await nuevoUsuario()
  const carla = await nuevoUsuario()
  const pablo = await nuevoUsuario({ propietario: true })
  const temporal = await nuevoUsuario({ contrasenaTemporal: true })
  anaId = ana.id
  await hacerMiembro(a.id, ana.id, 'administrador')
  await hacerMiembro(b.id, ana.id, 'empleado')
  await hacerMiembro(a.id, brais.id, 'empleado')
  await hacerMiembro(b.id, carla.id, 'administrador')
  await hacerMiembro(a.id, temporal.id, 'administrador')
  for (const [nombre, u] of Object.entries({ ana, brais, carla, pablo, temporal })) {
    cookies[nombre as keyof typeof cookies] = await iniciarSesion(app, u)
  }
})

afterAll(async () => {
  await pool.end()
})

describe('GET /api/explotaciones', () => {
  it('lista las explotaciones del usuario con su rol, por nombre', async () => {
    const res = await pedir(app, '/explotaciones', cookies.ana)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: a.id, nombre: a.name, rega: a.rega, rol: 'administrador' },
      { id: b.id, nombre: b.name, rega: b.rega, rol: 'empleado' },
    ])
  })

  it('el propietario sin explotaciones no ve ninguna', async () => {
    expect(await (await pedir(app, '/explotaciones', cookies.pablo)).json()).toEqual([])
  })

  it('401 sin sesión', async () => {
    const res = await pedir(app, '/explotaciones')
    expect(res.status).toBe(401)
    expect(await codigo(res)).toBe('no_autenticado')
  })

  it('403 con la contraseña temporal sin cambiar', async () => {
    const res = await pedir(app, '/explotaciones', cookies.temporal)
    expect(res.status).toBe(403)
    expect(await codigo(res)).toBe('cambio_contrasena_obligatorio')
  })
})

describe('GET /api/explotaciones/{id}', () => {
  it('el administrador accede a todo', async () => {
    const res = await pedir(app, `/explotaciones/${a.id}`, cookies.ana)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: a.id,
      nombre: a.name,
      rega: a.rega,
      rol: 'administrador',
      modulos: ['animales', 'comida', 'fincas', 'finanzas', 'administracion'],
    })
  })

  it('el empleado, a animales, comida y fincas', async () => {
    const res = await pedir(app, `/explotaciones/${a.id}`, cookies.brais)
    expect((await res.json()).modulos).toEqual(['animales', 'comida', 'fincas'])
  })

  it('404 si no se pertenece, si no existe o si el identificador no es válido', async () => {
    for (const [ruta, cookie] of [
      [`/explotaciones/${a.id}`, cookies.carla],
      [`/explotaciones/${a.id}`, cookies.pablo],
      ['/explotaciones/00000000-0000-7000-8000-000000000000', cookies.ana],
      ['/explotaciones/no-es-un-uuid', cookies.ana],
    ] as const) {
      const res = await pedir(app, ruta, cookie)
      expect(res.status).toBe(404)
      expect(await codigo(res)).toBe('explotacion_no_encontrada')
    }
  })

  it('401 sin sesión y 403 con la contraseña temporal', async () => {
    expect((await pedir(app, `/explotaciones/${a.id}`)).status).toBe(401)
    expect((await pedir(app, `/explotaciones/${a.id}`, cookies.temporal)).status).toBe(403)
  })

  it('rechaza las peticiones que modifican datos desde otro origen', async () => {
    const res = await app.request(`/api/explotaciones/${a.id}`, {
      method: 'POST',
      headers: { cookie: cookies.ana, origin: 'https://otro-sitio.example' },
    })
    expect(res.status).toBe(403)
    expect(await codigo(res)).toBe('origen_no_permitido')
    const mismo = await app.request(`/api/explotaciones/${a.id}`, {
      method: 'POST',
      headers: { cookie: cookies.ana, origin: ORIGEN },
    })
    expect(mismo.status).not.toBe(403)
  })
})

describe('matriz de permisos por módulo', () => {
  const esperado: Record<'administrador' | 'empleado', Record<Modulo, number>> = {
    administrador: { animales: 200, comida: 200, fincas: 200, finanzas: 200, administracion: 200 },
    empleado: { animales: 200, comida: 200, fincas: 200, finanzas: 403, administracion: 403 },
  }

  it.each(MODULOS)('%s', async (modulo) => {
    const ruta = (e: { id: string }) => `/explotaciones/${e.id}/${modulo}`
    // Ana: administradora en A y empleada en B; Brais, empleado en A
    expect((await pedir(pruebas, ruta(a), cookies.ana)).status).toBe(esperado.administrador[modulo])
    expect((await pedir(pruebas, ruta(b), cookies.ana)).status).toBe(esperado.empleado[modulo])
    expect((await pedir(pruebas, ruta(a), cookies.brais)).status).toBe(esperado.empleado[modulo])
    // Sin pertenecer, el propietario incluido: 404
    expect((await pedir(pruebas, ruta(a), cookies.carla)).status).toBe(404)
    expect((await pedir(pruebas, ruta(a), cookies.pablo)).status).toBe(404)
    expect((await pedir(pruebas, ruta(a))).status).toBe(401)
  })
})

describe('rutas de la plataforma', () => {
  it('solo para el propietario', async () => {
    expect((await pedir(pruebas, '/plataforma', cookies.pablo)).status).toBe(200)
    expect((await pedir(pruebas, '/plataforma', cookies.ana)).status).toBe(403)
    expect((await pedir(pruebas, '/plataforma')).status).toBe(401)
  })
})

describe('Row-Level Security', () => {
  it('las consultas usan la explotación y el usuario de la petición, con el rol de la aplicación', async () => {
    const res = await pedir(pruebas, `/explotaciones/${a.id}/contexto`, cookies.ana)
    expect(await res.json()).toEqual({ explotacion: a.id, usuario: anaId, rol: 'marela_app' })
  })
})
