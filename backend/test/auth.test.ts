import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { db, pool } from '../src/db/cliente.js'
import { session, user } from '../src/db/schema/index.js'
import { crearUsuario, desactivarUsuario, ErrorUsuario, reactivarUsuario } from '../src/usuarios.js'

const ORIGEN = 'http://localhost:5173'
const DIA = 24 * 60 * 60 * 1000

const app = crearApp()

// Cada petición usa su propia IP para no compartir el contador del límite de intentos
let ip = 0
const ipUnica = () => {
  ip += 1
  return `10.100.${Math.floor(ip / 250)}.${ip % 250}`
}

function peticion(
  ruta: string,
  opciones: { cuerpo?: object; cookie?: string; origen?: string; ip?: string } = {},
) {
  const headers: Record<string, string> = {
    origin: opciones.origen ?? ORIGEN,
    'x-real-ip': opciones.ip ?? ipUnica(),
  }
  if (opciones.cookie) headers.cookie = opciones.cookie
  if (opciones.cuerpo) headers['content-type'] = 'application/json'
  return app.request(`/api/auth${ruta}`, {
    method: opciones.cuerpo ? 'POST' : 'GET',
    headers,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  })
}

// Usuario nuevo con nombre y email únicos: la base de test se reutiliza entre ejecuciones
async function nuevoUsuario() {
  const sufijo = randomUUID().slice(0, 8)
  const { usuario, contrasenaTemporal } = await crearUsuario({
    usuario: `ana_${sufijo}`,
    nombre: 'Ana Prueba',
    email: `ana-${sufijo}@prueba.test`,
  })
  return { ...usuario, username: usuario.username ?? '', contrasena: contrasenaTemporal }
}

const conUsuario = (username: string, password: string, ip?: string) =>
  peticion('/sign-in/username', { cuerpo: { username, password }, ip })

// Cookie de sesión de la respuesta, lista para enviarla en la cabecera Cookie
function cookieDeSesion(res: Response) {
  const cabecera = res.headers
    .getSetCookie()
    .find((c) => c.includes('__Secure-marela.session_token='))
  if (!cabecera) throw new Error('La respuesta no trae la cookie de sesión')
  return { cabecera, valor: cabecera.split(';')[0] ?? '' }
}

async function sesionActual(cookie: string) {
  const res = await peticion('/get-session', { cookie })
  expect(res.status).toBe(200)
  return res.json()
}

afterAll(async () => {
  await pool.end()
})

describe('inicio de sesión', () => {
  it('con nombre de usuario, sin distinguir mayúsculas', async () => {
    const u = await nuevoUsuario()
    const res = await conUsuario(u.username.toUpperCase(), u.contrasena)
    expect(res.status).toBe(200)

    const { valor } = cookieDeSesion(res)
    const sesion = await sesionActual(valor)
    expect(sesion.user).toMatchObject({
      id: u.id,
      username: u.username,
      propietario: false,
      activo: true,
      debeCambiarContrasena: true,
    })
  })

  it('con email', async () => {
    const u = await nuevoUsuario()
    const res = await peticion('/sign-in/email', {
      cuerpo: { email: u.email, password: u.contrasena },
    })
    expect(res.status).toBe(200)
    expect((await sesionActual(cookieDeSesion(res).valor)).user.id).toBe(u.id)
  })

  it('rechaza una contraseña incorrecta o un usuario inexistente', async () => {
    const u = await nuevoUsuario()
    expect((await conUsuario(u.username, 'contraseña-incorrecta')).status).toBe(401)
    expect((await conUsuario(`no_existe_${u.username}`, u.contrasena)).status).toBe(401)
  })

  it('da una cookie HttpOnly, Secure y SameSite=Lax de 30 días', async () => {
    const u = await nuevoUsuario()
    const { cabecera } = cookieDeSesion(await conUsuario(u.username, u.contrasena))
    expect(cabecera).toMatch(/HttpOnly/i)
    expect(cabecera).toMatch(/Secure/i)
    expect(cabecera).toMatch(/SameSite=Lax/i)
    expect(cabecera).toMatch(/Max-Age=2592000/)
  })

  it('limita los intentos: el sexto en un minuto desde la misma IP se rechaza', async () => {
    const u = await nuevoUsuario()
    const misma = ipUnica()
    for (let i = 0; i < 5; i++) {
      expect((await conUsuario(u.username, 'contraseña-incorrecta', misma)).status).toBe(401)
    }
    expect((await conUsuario(u.username, u.contrasena, misma)).status).toBe(429)
  })

  it('solo acepta peticiones desde la URL pública', async () => {
    const u = await nuevoUsuario()
    const res = await peticion('/sign-in/username', {
      cuerpo: { username: u.username, password: u.contrasena },
      origen: 'https://otro-sitio.example',
    })
    expect(res.status).toBe(403)
  })
})

describe('sesión', () => {
  it('se cierra al cerrar sesión', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))
    expect((await peticion('/sign-out', { cuerpo: {}, cookie: valor })).status).toBe(200)
    expect(await sesionActual(valor)).toBeNull()
  })

  it('caduca a los 30 días', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.userId, u.id))
    expect(await sesionActual(valor)).toBeNull()
  })

  it('se renueva con el uso', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))
    // Una sesión de hace dos días: le quedan 28
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() + 28 * DIA) })
      .where(eq(session.userId, u.id))

    await sesionActual(valor)
    const [renovada] = await db
      .select({ expiresAt: session.expiresAt })
      .from(session)
      .where(eq(session.userId, u.id))
    expect(renovada?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DIA)
  })
})

describe('usuario desactivado', () => {
  it('pierde sus sesiones y no puede volver a entrar hasta que se reactive', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))

    await desactivarUsuario(u.id)
    expect(await sesionActual(valor)).toBeNull()
    const res = await conUsuario(u.username, u.contrasena)
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'USUARIO_DESACTIVADO' })

    await reactivarUsuario(u.id)
    expect((await conUsuario(u.username, u.contrasena)).status).toBe(200)
  })
})

describe('cambio de contraseña', () => {
  it('deja de ser temporal y la nueva sirve para entrar', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))

    const nueva = 'una-contraseña-nueva'
    const res = await peticion('/change-password', {
      cuerpo: { currentPassword: u.contrasena, newPassword: nueva },
      cookie: valor,
    })
    expect(res.status).toBe(200)
    expect((await sesionActual(valor)).user.debeCambiarContrasena).toBe(false)

    expect((await conUsuario(u.username, u.contrasena)).status).toBe(401)
    expect((await conUsuario(u.username, nueva)).status).toBe(200)
  })

  it('sigue siendo temporal si la contraseña actual no es correcta', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))
    const res = await peticion('/change-password', {
      cuerpo: { currentPassword: 'no-es-la-actual', newPassword: 'una-contraseña-nueva' },
      cookie: valor,
    })
    expect(res.status).toBe(400)
    expect((await sesionActual(valor)).user.debeCambiarContrasena).toBe(true)
  })

  it('exige al menos 10 caracteres', async () => {
    const u = await nuevoUsuario()
    const { valor } = cookieDeSesion(await conUsuario(u.username, u.contrasena))
    const res = await peticion('/change-password', {
      cuerpo: { currentPassword: u.contrasena, newPassword: 'corta' },
      cookie: valor,
    })
    expect(res.status).toBe(400)
  })
})

describe('rutas no publicadas', () => {
  it('no hay registro público ni gestión de organizaciones de Better Auth', async () => {
    const sufijo = randomUUID().slice(0, 8)
    const registro = await peticion('/sign-up/email', {
      cuerpo: { name: 'Intruso', email: `intruso-${sufijo}@prueba.test`, password: 'x'.repeat(12) },
    })
    expect(registro.status).toBe(404)
    expect((await peticion('/organization/create', { cuerpo: { name: 'X' } })).status).toBe(404)
    expect((await peticion('/list-sessions')).status).toBe(404)

    const [creado] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.email, `intruso-${sufijo}@prueba.test`))
    expect(creado?.n).toBe(0)
  })
})

describe('alta de usuarios', () => {
  it('genera una contraseña temporal y no repite usuario ni email', async () => {
    const u = await nuevoUsuario()
    expect(u.contrasena).toMatch(/^[a-zA-Z2-9]{12}$/)
    expect(u.debeCambiarContrasena).toBe(true)

    await expect(
      crearUsuario({ usuario: u.username, nombre: 'Otra', email: `otra-${u.email}` }),
    ).rejects.toThrow(ErrorUsuario)
    await expect(
      crearUsuario({ usuario: `otra_${u.username.slice(4)}`, nombre: 'Otra', email: u.email }),
    ).rejects.toThrow(ErrorUsuario)
  })

  it('valida el nombre de usuario y el email', async () => {
    await expect(
      crearUsuario({ usuario: 'con espacios', nombre: 'X', email: 'x@prueba.test' }),
    ).rejects.toThrow('solo admite letras')
    await expect(
      crearUsuario({ usuario: 'valido', nombre: 'X', email: 'no-es-email' }),
    ).rejects.toThrow('Email no válido')
  })
})
