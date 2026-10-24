import { randomInt } from 'node:crypto'
import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { auth, LONGITUD_MINIMA_CONTRASENA } from './auth.js'
import { type Db, db } from './db/cliente.js'
import type { Transaccion } from './db/explotacion.js'
import { account, session, user } from './db/schema/index.js'

// Alta, desactivación y reactivación de usuarios. Las usan el comando crear-propietario y la gestión
// de usuarios de la explotación (GH-12).

export const DatosUsuario = z.object({
  // Mismas reglas que el plugin de usuario de Better Auth, que lo guarda en minúsculas
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
    .max(30, 'El nombre de usuario no puede tener más de 30 caracteres')
    .regex(/^[a-z0-9_.]+$/, 'El nombre de usuario solo admite letras, números, punto y guion bajo'),
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  email: z.string().trim().toLowerCase().pipe(z.email('Email no válido')),
  propietario: z.boolean().default(false),
})

export type DatosUsuario = z.input<typeof DatosUsuario>

// Error de los datos de un usuario: el campo que falla, para mostrarlo junto a él
export class ErrorUsuario extends Error {
  constructor(
    mensaje: string,
    public readonly codigo = 'usuario_no_valido',
    public readonly campo?: 'usuario' | 'nombre' | 'email',
  ) {
    super(mensaje)
    this.name = 'ErrorUsuario'
  }
}

// Sin caracteres que se confunden al leerlos o dictarlos (0/O, 1/l/I)
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Contraseña temporal aleatoria, que el usuario debe cambiar en su primer inicio de sesión
export function generarContrasenaTemporal(longitud = 12) {
  return Array.from({ length: Math.max(longitud, LONGITUD_MINIMA_CONTRASENA) }, () =>
    ALFABETO.charAt(randomInt(ALFABETO.length)),
  ).join('')
}

// Crea un usuario con una contraseña temporal y la devuelve: solo se muestra esta vez. Con una
// transacción, el usuario se crea dentro de ella (p. ej. junto con su explotación).
export async function crearUsuario(entrada: DatosUsuario, ejecutor: Db | Transaccion = db) {
  const r = DatosUsuario.safeParse(entrada)
  if (!r.success) {
    const [primero] = r.error.issues
    throw new ErrorUsuario(
      r.error.issues.map((i) => i.message).join('. '),
      'usuario_no_valido',
      primero?.path[0] as ErrorUsuario['campo'],
    )
  }
  const datos = r.data

  const contrasenaTemporal = generarContrasenaTemporal()
  // El mismo algoritmo y parámetros con los que Better Auth comprobará la contraseña al iniciar sesión
  const hash = await (await auth.$context).password.hash(contrasenaTemporal)

  const usuario = await ejecutor.transaction(async (tx) => {
    const existentes = await tx
      .select({ username: user.username, email: user.email })
      .from(user)
      .where(or(eq(user.username, datos.usuario), eq(user.email, datos.email)))
    if (existentes.some((e) => e.username === datos.usuario))
      throw new ErrorUsuario(`Ya existe el usuario ${datos.usuario}`, 'usuario_en_uso', 'usuario')
    if (existentes.length > 0)
      throw new ErrorUsuario(
        `Ya hay un usuario con el email ${datos.email}`,
        'email_en_uso',
        'email',
      )

    const [creado] = await tx
      .insert(user)
      .values({
        name: datos.nombre,
        email: datos.email,
        username: datos.usuario,
        displayUsername: datos.usuario,
        propietario: datos.propietario,
        debeCambiarContrasena: true,
      })
      .returning()
    if (!creado) throw new Error('No se pudo crear el usuario')

    await tx.insert(account).values({
      accountId: creado.id,
      providerId: 'credential',
      userId: creado.id,
      password: hash,
    })
    return creado
  })

  return { usuario, contrasenaTemporal }
}

// Desactiva al usuario y cierra todas sus sesiones: deja de tener acceso de inmediato
export async function desactivarUsuario(usuarioId: string) {
  await db.transaction(async (tx) => {
    await tx.update(user).set({ activo: false }).where(eq(user.id, usuarioId))
    await tx.delete(session).where(eq(session.userId, usuarioId))
  })
}

export async function reactivarUsuario(usuarioId: string) {
  await db.update(user).set({ activo: true }).where(eq(user.id, usuarioId))
}

// Nueva contraseña temporal para un usuario: la anterior deja de servir, se cierran sus sesiones y
// tendrá que cambiarla al entrar. Devuelve la contraseña: solo se muestra esta vez.
export async function restablecerContrasena(usuarioId: string, ejecutor: Db | Transaccion = db) {
  const contrasenaTemporal = generarContrasenaTemporal()
  const hash = await (await auth.$context).password.hash(contrasenaTemporal)
  await ejecutor.transaction(async (tx) => {
    const cuentas = await tx
      .update(account)
      .set({ password: hash })
      .where(and(eq(account.userId, usuarioId), eq(account.providerId, 'credential')))
      .returning({ id: account.id })
    if (cuentas.length === 0) {
      await tx.insert(account).values({
        accountId: usuarioId,
        providerId: 'credential',
        userId: usuarioId,
        password: hash,
      })
    }
    await tx.update(user).set({ debeCambiarContrasena: true }).where(eq(user.id, usuarioId))
    await tx.delete(session).where(eq(session.userId, usuarioId))
  })
  return contrasenaTemporal
}
