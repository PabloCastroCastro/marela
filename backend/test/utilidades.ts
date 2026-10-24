import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { App } from '../src/app.js'
import { db } from '../src/db/cliente.js'
import { member, organization, type RolExplotacion, user } from '../src/db/schema/index.js'
import { crearUsuario } from '../src/usuarios.js'

// Datos y sesiones para los tests. Nombres, emails y REGA únicos: la base de test se reutiliza.

export const ORIGEN = 'http://localhost:5173'

// IP distinta en cada inicio de sesión, para no alcanzar el límite de 5 por minuto
let ip = 0
export const ipUnica = () => {
  ip += 1
  return `10.200.${Math.floor(ip / 250)}.${ip % 250}`
}

// Usuario con su contraseña definitiva (no temporal), salvo que se pida lo contrario
export async function nuevoUsuario(
  opciones: { propietario?: boolean; contrasenaTemporal?: boolean } = {},
) {
  const sufijo = randomUUID().slice(0, 8)
  const { usuario, contrasenaTemporal } = await crearUsuario({
    usuario: `u_${sufijo}`,
    nombre: `Usuario ${sufijo}`,
    email: `u-${sufijo}@prueba.test`,
    propietario: opciones.propietario ?? false,
  })
  if (!opciones.contrasenaTemporal) {
    await db.update(user).set({ debeCambiarContrasena: false }).where(eq(user.id, usuario.id))
  }
  return { id: usuario.id, username: usuario.username ?? '', contrasena: contrasenaTemporal }
}

export async function nuevaExplotacion(nombre = 'Explotación de prueba') {
  const rega = `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`
  const [e] = await db
    .insert(organization)
    .values({ name: nombre, slug: `${rega.toLowerCase()}-${randomUUID()}`, rega })
    .returning()
  if (!e) throw new Error('No se pudo crear la explotación')
  return e
}

export async function hacerMiembro(explotacionId: string, usuarioId: string, rol: RolExplotacion) {
  await db.insert(member).values({ organizationId: explotacionId, userId: usuarioId, role: rol })
}

// Inicia sesión y devuelve la cabecera Cookie con la sesión
export async function iniciarSesion(app: App, u: { username: string; contrasena: string }) {
  const res = await app.request('/api/auth/sign-in/username', {
    method: 'POST',
    headers: { origin: ORIGEN, 'content-type': 'application/json', 'x-real-ip': ipUnica() },
    body: JSON.stringify({ username: u.username, password: u.contrasena }),
  })
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión (${res.status})`)
  const cookie = res.headers.getSetCookie().find((c) => c.includes('marela.session_token='))
  if (!cookie) throw new Error('Sin cookie de sesión')
  return cookie.split(';')[0] ?? ''
}
