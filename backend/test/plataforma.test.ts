import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { db, pool } from '../src/db/cliente.js'
import { member, organization, user } from '../src/db/schema/index.js'
import { alCrearExplotacion } from '../src/explotaciones.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()
// Los que registran los módulos (los almacenes de comida): los de cada test se quitan después
const registrados = alCrearExplotacion.length

const pedir = (metodo: string, ruta: string, cookie: string, cuerpo?: object): Promise<Response> =>
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

const regaNuevo = () => `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`
const sufijo = () => randomUUID().slice(0, 8)

const datos = (cambios: object = {}) => ({
  nombre: 'Explotación nueva',
  rega: regaNuevo(),
  municipio: 'Lalín',
  provincia: 'Pontevedra',
  ...cambios,
})

let propietario = ''
let ana = { id: '', username: '', contrasena: '', cookie: '' }
let brais = ''

beforeAll(async () => {
  const p = await nuevoUsuario({ propietario: true })
  propietario = await iniciarSesion(app, p)
  const a = await nuevoUsuario()
  ana = { ...a, cookie: await iniciarSesion(app, a) }
  brais = await iniciarSesion(app, await nuevoUsuario())
})

afterEach(() => {
  alCrearExplotacion.length = registrados
})

afterAll(async () => {
  await pool.end()
})

describe('crear una explotación', () => {
  it('con un administrador nuevo, que entra con su contraseña temporal', async () => {
    const s = sufijo()
    const cuerpo = datos({
      rega: regaNuevo().toLowerCase(),
      administrador: {
        tipo: 'nuevo',
        usuario: `Admin_${s}`,
        nombre: 'Xosé Lema',
        email: `x-${s}@prueba.test`,
      },
    })
    const res = await pedir('POST', '/plataforma/explotaciones', propietario, cuerpo)
    expect(res.status).toBe(201)
    const creada = await res.json()
    expect(creada.explotacion).toMatchObject({
      nombre: 'Explotación nueva',
      rega: cuerpo.rega.toUpperCase(),
      municipio: 'Lalín',
      provincia: 'Pontevedra',
      activa: true,
      miembros: 1,
    })
    expect(creada.administrador.usuario).toBe(`admin_${s}`)
    expect(creada.contrasenaTemporal).toMatch(/^[a-zA-Z2-9]{12}$/)

    // Entra y, en cuanto cambie la contraseña, administra la explotación
    const cookie = await iniciarSesion(app, {
      username: `admin_${s}`,
      contrasena: creada.contrasenaTemporal,
    })
    expect((await pedir('GET', '/explotaciones', cookie)).status).toBe(403)
    await db
      .update(user)
      .set({ debeCambiarContrasena: false })
      .where(eq(user.id, creada.administrador.id))
    const detalle = await pedir('GET', `/explotaciones/${creada.explotacion.id}`, cookie)
    expect((await detalle.json()).rol).toBe('administrador')
  })

  it('con un administrador que ya existe, por su nombre de usuario', async () => {
    const res = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({ administrador: { tipo: 'existente', usuario: ana.username.toUpperCase() } }),
    )
    expect(res.status).toBe(201)
    const creada = await res.json()
    expect(creada.contrasenaTemporal).toBeUndefined()
    const lista = await (await pedir('GET', '/explotaciones', ana.cookie)).json()
    expect(lista).toContainEqual(
      expect.objectContaining({ id: creada.explotacion.id, rol: 'administrador' }),
    )
  })

  it('valida los datos', async () => {
    const res = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({
        rega: 'ES123',
        provincia: 'Narnia',
        municipio: ' ',
        administrador: { tipo: 'existente', usuario: 'x' },
      }),
    )
    expect(res.status).toBe(400)
    const campos = ((await res.json()).error.detalles as { campo: string }[]).map((d) => d.campo)
    expect(campos).toEqual(expect.arrayContaining(['rega', 'provincia', 'municipio']))
  })

  it('no repite el REGA ni crea nada si el administrador no es válido', async () => {
    const rega = regaNuevo()
    const primero = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({ rega, administrador: { tipo: 'existente', usuario: ana.username } }),
    )
    expect(primero.status).toBe(201)
    const repetido = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({ rega, administrador: { tipo: 'existente', usuario: ana.username } }),
    )
    expect(repetido.status).toBe(409)
    expect(await codigo(repetido)).toBe('rega_en_uso')

    const otroRega = regaNuevo()
    const sinUsuario = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({
        rega: otroRega,
        administrador: { tipo: 'existente', usuario: `no_existe_${sufijo()}` },
      }),
    )
    expect(sinUsuario.status).toBe(404)
    expect(await codigo(sinUsuario)).toBe('usuario_no_encontrado')

    const usuarioEnUso = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({
        rega: otroRega,
        administrador: {
          tipo: 'nuevo',
          usuario: ana.username,
          nombre: 'Otra',
          email: `o-${sufijo()}@prueba.test`,
        },
      }),
    )
    expect(usuarioEnUso.status).toBe(409)
    expect(await codigo(usuarioEnUso)).toBe('usuario_en_uso')
    expect(await db.select().from(organization).where(eq(organization.rega, otroRega))).toEqual([])
  })

  it('prepara la explotación con los módulos registrados, en la misma transacción', async () => {
    const llamadas: string[] = []
    alCrearExplotacion.push(async (_tx, explotacionId) => {
      llamadas.push(explotacionId)
    })
    const res = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({ administrador: { tipo: 'existente', usuario: ana.username } }),
    )
    expect(llamadas).toEqual([(await res.json()).explotacion.id])

    // Si la preparación falla, no queda nada creado
    alCrearExplotacion.push(async () => {
      throw new Error('fallo al preparar')
    })
    const rega = regaNuevo()
    const fallida = await pedir(
      'POST',
      '/plataforma/explotaciones',
      propietario,
      datos({ rega, administrador: { tipo: 'existente', usuario: ana.username } }),
    )
    expect(fallida.status).toBe(500)
    expect(await db.select().from(organization).where(eq(organization.rega, rega))).toEqual([])
  })

  it('solo el propietario', async () => {
    const res = await pedir(
      'POST',
      '/plataforma/explotaciones',
      ana.cookie,
      datos({ administrador: { tipo: 'existente', usuario: ana.username } }),
    )
    expect(res.status).toBe(403)
    expect((await pedir('GET', '/plataforma/explotaciones', ana.cookie)).status).toBe(403)
  })
})

describe('desactivar una explotación', () => {
  it('desaparece para sus miembros sin borrar nada, y se puede reactivar', async () => {
    const e = await nuevaExplotacion('Para desactivar')
    await hacerMiembro(e.id, ana.id, 'administrador')

    const desactivada = await pedir('PATCH', `/plataforma/explotaciones/${e.id}`, propietario, {
      activa: false,
    })
    expect(desactivada.status).toBe(200)
    expect(await desactivada.json()).toMatchObject({ id: e.id, activa: false, miembros: 1 })

    const lista = await (await pedir('GET', '/explotaciones', ana.cookie)).json()
    expect(lista.map((x: { id: string }) => x.id)).not.toContain(e.id)
    const detalle = await pedir('GET', `/explotaciones/${e.id}`, ana.cookie)
    expect(detalle.status).toBe(403)
    expect(await codigo(detalle)).toBe('explotacion_desactivada')

    // El propietario la sigue viendo
    const todas = await (await pedir('GET', '/plataforma/explotaciones', propietario)).json()
    expect(todas).toContainEqual(expect.objectContaining({ id: e.id, activa: false }))
    expect(await db.select().from(member).where(eq(member.organizationId, e.id))).toHaveLength(1)

    await pedir('PATCH', `/plataforma/explotaciones/${e.id}`, propietario, { activa: true })
    expect((await pedir('GET', `/explotaciones/${e.id}`, ana.cookie)).status).toBe(200)
  })

  it('404 si no existe', async () => {
    const res = await pedir('PATCH', `/plataforma/explotaciones/${randomUUID()}`, propietario, {
      activa: false,
    })
    expect(res.status).toBe(404)
  })
})

describe('editar los datos de la explotación', () => {
  it('el administrador los edita; el empleado no', async () => {
    const e = await nuevaExplotacion('Antes')
    await hacerMiembro(e.id, ana.id, 'administrador')
    const empleado = await nuevoUsuario()
    await hacerMiembro(e.id, empleado.id, 'empleado')

    const nuevos = datos({ nombre: 'Después', municipio: 'Silleda' })
    const res = await pedir('PATCH', `/explotaciones/${e.id}`, ana.cookie, nuevos)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      nombre: 'Después',
      rega: nuevos.rega,
      municipio: 'Silleda',
      provincia: 'Pontevedra',
      rol: 'administrador',
    })

    const cookieEmpleado = await iniciarSesion(app, empleado)
    expect((await pedir('PATCH', `/explotaciones/${e.id}`, cookieEmpleado, nuevos)).status).toBe(
      403,
    )
    expect((await pedir('PATCH', `/explotaciones/${e.id}`, brais, nuevos)).status).toBe(404)
  })

  it('no admite el REGA de otra explotación', async () => {
    const e = await nuevaExplotacion()
    const otra = await nuevaExplotacion()
    await hacerMiembro(e.id, ana.id, 'administrador')
    const res = await pedir(
      'PATCH',
      `/explotaciones/${e.id}`,
      ana.cookie,
      datos({ rega: otra.rega }),
    )
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('rega_en_uso')
  })
})
