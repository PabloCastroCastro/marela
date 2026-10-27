import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()

const pedir = (metodo: string, ruta: string, cookie: string, cuerpo?: object) =>
  Promise.resolve(
    app.request(`/api${ruta}`, {
      method: metodo,
      headers: {
        cookie,
        origin: ORIGEN,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }),
  )

const codigo = async (res: Response) =>
  ((await res.json()) as { error: { codigo: string } }).error.codigo

type Persona = Awaited<ReturnType<typeof nuevoUsuario>> & { cookie: string }

async function persona(opciones?: Parameters<typeof nuevoUsuario>[0]): Promise<Persona> {
  const u = await nuevoUsuario(opciones)
  return { ...u, cookie: await iniciarSesion(app, u) }
}

const sesionActiva = async (cookie: string) =>
  (await (await app.request('/api/auth/get-session', { headers: { cookie } })).json()) !== null

// Explotación A: Ana la administra y Brais es empleado. Explotación B: Carla la administra y Dani es
// empleado. Pablo es el propietario de la plataforma.
let a = ''
let b = ''
let ana: Persona
let brais: Persona
let carla: Persona
let dani: Persona
let pablo: Persona

const miembroDe = async (explotacionId: string, usuarioId: string, cookie = ana.cookie) => {
  const lista = (await (
    await pedir('GET', `/explotaciones/${explotacionId}/miembros`, cookie)
  ).json()) as {
    id: string
    usuarioId: string
  }[]
  const m = lista.find((x) => x.usuarioId === usuarioId)
  if (!m) throw new Error('No es miembro')
  return m.id
}

beforeAll(async () => {
  a = (await nuevaExplotacion('A de prueba')).id
  b = (await nuevaExplotacion('B de prueba')).id
  ana = await persona()
  brais = await persona()
  carla = await persona()
  dani = await persona()
  pablo = await persona({ propietario: true })
  await hacerMiembro(a, ana.id, 'administrador')
  await hacerMiembro(a, brais.id, 'empleado')
  await hacerMiembro(b, carla.id, 'administrador')
  await hacerMiembro(b, dani.id, 'empleado')
})

afterAll(async () => {
  await pool.end()
})

describe('lista de miembros', () => {
  it('el administrador ve a su equipo; el empleado no', async () => {
    const res = await pedir('GET', `/explotaciones/${a}/miembros`, ana.cookie)
    expect(res.status).toBe(200)
    const lista = await res.json()
    expect(lista).toContainEqual(
      expect.objectContaining({
        usuarioId: brais.id,
        usuario: brais.username,
        rol: 'empleado',
        activo: true,
      }),
    )
    expect((await pedir('GET', `/explotaciones/${a}/miembros`, brais.cookie)).status).toBe(403)
  })
})

describe('añadir a una persona', () => {
  it('nueva, con contraseña temporal', async () => {
    const s = randomUUID().slice(0, 8)
    const res = await pedir('POST', `/explotaciones/${a}/miembros`, ana.cookie, {
      tipo: 'nuevo',
      usuario: `nueva_${s}`,
      nombre: 'Persona Nueva',
      email: `nueva-${s}@prueba.test`,
      rol: 'empleado',
    })
    expect(res.status).toBe(201)
    const { miembro, contrasenaTemporal } = await res.json()
    expect(miembro).toMatchObject({ usuario: `nueva_${s}`, rol: 'empleado', activo: true })
    expect(
      await iniciarSesion(app, { username: `nueva_${s}`, contrasena: contrasenaTemporal }),
    ).toBeTruthy()
  })

  it('que ya existe en otra explotación, por su nombre de usuario', async () => {
    const res = await pedir('POST', `/explotaciones/${a}/miembros`, ana.cookie, {
      tipo: 'existente',
      usuario: dani.username.toUpperCase(),
      rol: 'empleado',
    })
    expect(res.status).toBe(201)
    expect((await res.json()).contrasenaTemporal).toBeUndefined()

    const otraVez = await pedir('POST', `/explotaciones/${a}/miembros`, ana.cookie, {
      tipo: 'existente',
      usuario: dani.username,
      rol: 'administrador',
    })
    expect(otraVez.status).toBe(409)
    expect(await codigo(otraVez)).toBe('ya_es_miembro')
  })

  it('errores: usuario que no existe, usuario nuevo en uso, datos no válidos', async () => {
    const noExiste = await pedir('POST', `/explotaciones/${a}/miembros`, ana.cookie, {
      tipo: 'existente',
      usuario: `nadie_${randomUUID().slice(0, 8)}`,
      rol: 'empleado',
    })
    expect(noExiste.status).toBe(404)

    const enUso = await pedir('POST', `/explotaciones/${a}/miembros`, ana.cookie, {
      tipo: 'nuevo',
      usuario: carla.username,
      nombre: 'Otra',
      email: `otra-${randomUUID()}@prueba.test`,
      rol: 'empleado',
    })
    expect(enUso.status).toBe(409)
    expect(await codigo(enUso)).toBe('usuario_en_uso')

    const invalido = await pedir('POST', `/explotaciones/${a}/miembros`, ana.cookie, {
      tipo: 'nuevo',
      usuario: 'con espacios',
      nombre: 'X',
      email: 'no-es-email',
      rol: 'jefe',
    })
    expect(invalido.status).toBe(400)
  })
})

describe('cambiar el rol y desactivar', () => {
  it('cambia el rol', async () => {
    const id = await miembroDe(a, brais.id)
    const res = await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, {
      rol: 'administrador',
    })
    expect(res.status).toBe(200)
    expect((await res.json()).rol).toBe('administrador')
    await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, { rol: 'empleado' })
  })

  it('al desactivar pierde el acceso y, sin otras explotaciones, sus sesiones; al reactivar lo recupera', async () => {
    const e = await persona()
    await hacerMiembro(a, e.id, 'empleado')
    const id = await miembroDe(a, e.id)

    const res = await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, {
      activo: false,
    })
    expect(res.status).toBe(200)
    expect(await sesionActiva(e.cookie)).toBe(false)

    const cookie = await iniciarSesion(app, e)
    const detalle = await pedir('GET', `/explotaciones/${a}`, cookie)
    expect(detalle.status).toBe(403)
    expect(await codigo(detalle)).toBe('miembro_desactivado')
    expect(await (await pedir('GET', '/explotaciones', cookie)).json()).toEqual([])

    await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, { activo: true })
    expect((await pedir('GET', `/explotaciones/${a}`, cookie)).status).toBe(200)
  })

  it('si tiene otras explotaciones, conserva la sesión para ellas', async () => {
    const id = await miembroDe(a, dani.id)
    await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, { activo: false })
    expect(await sesionActiva(dani.cookie)).toBe(true)
    expect((await pedir('GET', `/explotaciones/${b}`, dani.cookie)).status).toBe(200)
    expect((await pedir('GET', `/explotaciones/${a}`, dani.cookie)).status).toBe(403)
  })

  it('la explotación nunca se queda sin un administrador activo', async () => {
    const id = await miembroDe(a, ana.id)
    const degradar = await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, {
      rol: 'empleado',
    })
    expect(degradar.status).toBe(409)
    expect(await codigo(degradar)).toBe('ultimo_administrador')
    const desactivar = await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, {
      activo: false,
    })
    expect(desactivar.status).toBe(409)

    // Con otro administrador, sí
    const otro = await miembroDe(a, brais.id)
    await pedir('PATCH', `/explotaciones/${a}/miembros/${otro}`, ana.cookie, {
      rol: 'administrador',
    })
    expect(
      (await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, ana.cookie, { rol: 'empleado' }))
        .status,
    ).toBe(200)
    await pedir('PATCH', `/explotaciones/${a}/miembros/${id}`, brais.cookie, {
      rol: 'administrador',
    })
    await pedir('PATCH', `/explotaciones/${a}/miembros/${otro}`, ana.cookie, { rol: 'empleado' })
  })

  it('404 con un miembro de otra explotación', async () => {
    const deB = await miembroDe(b, carla.id, carla.cookie)
    expect(
      (await pedir('PATCH', `/explotaciones/${a}/miembros/${deB}`, ana.cookie, { rol: 'empleado' }))
        .status,
    ).toBe(404)
  })
})

describe('restablecer la contraseña', () => {
  it('a quien solo es de esta explotación: nueva temporal y fuera las sesiones', async () => {
    const e = await persona()
    await hacerMiembro(a, e.id, 'empleado')
    const id = await miembroDe(a, e.id)

    const res = await pedir(
      'POST',
      `/explotaciones/${a}/miembros/${id}/restablecer-contrasena`,
      ana.cookie,
    )
    expect(res.status).toBe(200)
    const { contrasenaTemporal } = await res.json()
    expect(await sesionActiva(e.cookie)).toBe(false)
    await expect(iniciarSesion(app, e)).rejects.toThrow()

    const cookie = await iniciarSesion(app, {
      username: e.username,
      contrasena: contrasenaTemporal,
    })
    const sesion = await (
      await app.request('/api/auth/get-session', { headers: { cookie } })
    ).json()
    expect(sesion.user.debeCambiarContrasena).toBe(true)
  })

  it('no a quien tiene otras explotaciones, ni a uno mismo', async () => {
    const id = await miembroDe(a, dani.id)
    const res = await pedir(
      'POST',
      `/explotaciones/${a}/miembros/${id}/restablecer-contrasena`,
      ana.cookie,
    )
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('otras_explotaciones')

    const propio = await miembroDe(a, ana.id)
    const yo = await pedir(
      'POST',
      `/explotaciones/${a}/miembros/${propio}/restablecer-contrasena`,
      ana.cookie,
    )
    expect(await codigo(yo)).toBe('es_usted')
  })

  it('el propietario de la plataforma, a cualquiera', async () => {
    const res = await pedir('POST', '/plataforma/usuarios/restablecer-contrasena', pablo.cookie, {
      usuario: dani.username,
    })
    expect(res.status).toBe(200)
    expect((await res.json()).contrasenaTemporal).toMatch(/^[a-zA-Z2-9]{12}$/)
    expect(
      (
        await pedir('POST', '/plataforma/usuarios/restablecer-contrasena', ana.cookie, {
          usuario: dani.username,
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await pedir('POST', '/plataforma/usuarios/restablecer-contrasena', pablo.cookie, {
          usuario: 'nadie_x',
        })
      ).status,
    ).toBe(404)
  })
})
