import { z } from '@hono/zod-openapi'
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { db } from './db/cliente.js'
import type { Transaccion } from './db/explotacion.js'
import {
  member,
  organization,
  ROLES_EXPLOTACION,
  type RolExplotacion,
  session,
  user,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { crearUsuario, ErrorUsuario, restablecerContrasena } from './usuarios.js'

// Equipo de una explotación: alta de personas, cambio de rol, desactivación y contraseñas (GH-12).
// Una explotación nunca se queda sin un administrador activo.

const Rol = z.enum(ROLES_EXPLOTACION)

export const NuevoMiembro = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('nuevo'),
      usuario: z.string(),
      nombre: z.string(),
      email: z.string(),
      rol: Rol,
    }),
    z.object({ tipo: z.literal('existente'), usuario: z.string().trim().toLowerCase(), rol: Rol }),
  ])
  .openapi('NuevoMiembro')

export type NuevoMiembro = z.infer<typeof NuevoMiembro>

export const CambioMiembro = z
  .object({ rol: Rol.optional(), activo: z.boolean().optional() })
  .refine((c) => c.rol !== undefined || c.activo !== undefined, 'Indica el rol o si está activo')
  .openapi('CambioMiembro')

export async function listarMiembros(explotacionId: string) {
  return db
    .select({
      id: member.id,
      usuarioId: user.id,
      usuario: user.username,
      nombre: user.name,
      email: user.email,
      rol: member.role,
      activo: member.activo,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, explotacionId))
    .orderBy(asc(user.name))
}

async function unMiembro(ejecutor: Transaccion, explotacionId: string, miembroId: string) {
  const [m] = await ejecutor
    .select({
      id: member.id,
      usuarioId: user.id,
      usuario: user.username,
      nombre: user.name,
      email: user.email,
      rol: member.role,
      activo: member.activo,
      propietario: user.propietario,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, miembroId), eq(member.organizationId, explotacionId)))
  if (!m)
    throw new ErrorApi(404, 'miembro_no_encontrado', 'No existe ese miembro en la explotación')
  return m
}

const sinMiembro = ({ propietario: _p, ...m }: Awaited<ReturnType<typeof unMiembro>>) => m

// Añade a una persona nueva (con contraseña temporal) o a un usuario que ya existe, por su nombre
export async function anadirMiembro(explotacionId: string, datos: NuevoMiembro) {
  return db.transaction(async (tx) => {
    let usuarioId: string
    let contrasenaTemporal: string | undefined
    if (datos.tipo === 'nuevo') {
      try {
        const creado = await crearUsuario(datos, tx)
        usuarioId = creado.usuario.id
        contrasenaTemporal = creado.contrasenaTemporal
      } catch (error) {
        if (!(error instanceof ErrorUsuario)) throw error
        const validacion = error.codigo === 'usuario_no_valido'
        throw new ErrorApi(
          validacion ? 400 : 409,
          validacion ? 'validacion' : error.codigo,
          error.message,
          error.campo ? [{ campo: error.campo, mensaje: error.message }] : undefined,
        )
      }
    } else {
      const [existente] = await tx
        .select({ id: user.id, activo: user.activo })
        .from(user)
        .where(eq(user.username, datos.usuario))
      if (!existente?.activo) {
        throw new ErrorApi(404, 'usuario_no_encontrado', `No existe el usuario ${datos.usuario}`, [
          { campo: 'usuario', mensaje: 'No hay ningún usuario activo con este nombre' },
        ])
      }
      const [yaEs] = await tx
        .select({ activo: member.activo })
        .from(member)
        .where(and(eq(member.organizationId, explotacionId), eq(member.userId, existente.id)))
      if (yaEs) {
        const mensaje = yaEs.activo
          ? 'Ya es miembro de la explotación'
          : 'Ya es miembro de la explotación, pero está desactivado: reactívalo'
        throw new ErrorApi(409, 'ya_es_miembro', mensaje, [{ campo: 'usuario', mensaje }])
      }
      usuarioId = existente.id
    }

    const [nuevo] = await tx
      .insert(member)
      .values({ organizationId: explotacionId, userId: usuarioId, role: datos.rol })
      .returning({ id: member.id })
    if (!nuevo) throw new Error('No se pudo añadir el miembro')
    return { miembro: sinMiembro(await unMiembro(tx, explotacionId, nuevo.id)), contrasenaTemporal }
  })
}

// Cambia el rol o el estado de un miembro. Si deja a la explotación sin administradores activos, no
// se hace. Al desactivarlo pierde el acceso a la explotación de inmediato; si ya no tiene ninguna otra
// explotación, también se cierran sus sesiones.
export async function cambiarMiembro(
  explotacionId: string,
  miembroId: string,
  cambio: { rol?: RolExplotacion; activo?: boolean },
) {
  return db.transaction(async (tx) => {
    // Bloquea los miembros de la explotación: dos cambios a la vez no pueden dejarla sin administrador
    await tx.execute(
      sql`select 1 from ${member} where ${member.organizationId} = ${explotacionId} for update`,
    )
    const antes = await unMiembro(tx, explotacionId, miembroId)
    await tx
      .update(member)
      .set({
        ...(cambio.rol ? { role: cambio.rol } : {}),
        ...(cambio.activo !== undefined ? { activo: cambio.activo } : {}),
      })
      .where(eq(member.id, miembroId))

    const [administradores] = await tx
      .select({ n: count() })
      .from(member)
      .where(
        and(
          eq(member.organizationId, explotacionId),
          eq(member.role, 'administrador'),
          eq(member.activo, true),
        ),
      )
    if (!administradores?.n) {
      throw new ErrorApi(
        409,
        'ultimo_administrador',
        'La explotación tiene que tener al menos un administrador activo',
      )
    }

    if (antes.activo && cambio.activo === false && !antes.propietario) {
      const [otras] = await tx
        .select({ n: count() })
        .from(member)
        .innerJoin(organization, eq(organization.id, member.organizationId))
        .where(
          and(
            eq(member.userId, antes.usuarioId),
            ne(member.organizationId, explotacionId),
            eq(member.activo, true),
            eq(organization.activa, true),
          ),
        )
      if (!otras?.n) await tx.delete(session).where(eq(session.userId, antes.usuarioId))
    }
    return sinMiembro(await unMiembro(tx, explotacionId, miembroId))
  })
}

// El administrador solo puede restablecer la contraseña de quien pertenece únicamente a su
// explotación: si no, conocería la contraseña de alguien con acceso a explotaciones ajenas. Para
// esos casos está el propietario de la plataforma.
export async function restablecerContrasenaMiembro(
  explotacionId: string,
  miembroId: string,
  solicitanteId: string,
) {
  return db.transaction(async (tx) => {
    const m = await unMiembro(tx, explotacionId, miembroId)
    if (m.usuarioId === solicitanteId) {
      throw new ErrorApi(
        409,
        'es_usted',
        'Para cambiar tu propia contraseña usa «Cambiar la contraseña» en tu cuenta',
      )
    }
    const [otras] = await tx
      .select({ n: count() })
      .from(member)
      .where(and(eq(member.userId, m.usuarioId), ne(member.organizationId, explotacionId)))
    if (m.propietario || otras?.n) {
      throw new ErrorApi(
        409,
        'otras_explotaciones',
        `${m.nombre} también tiene acceso a otras explotaciones: pide al propietario de la plataforma que le restablezca la contraseña`,
      )
    }
    const contrasenaTemporal = await restablecerContrasena(m.usuarioId, tx)
    return { miembro: sinMiembro(m), contrasenaTemporal }
  })
}
