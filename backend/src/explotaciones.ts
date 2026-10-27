import { randomUUID } from 'node:crypto'
import { z } from '@hono/zod-openapi'
import { and, eq, ne } from 'drizzle-orm'
import { db } from './db/cliente.js'
import type { Transaccion } from './db/explotacion.js'
import { member, organization, user } from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { crearUsuario, ErrorUsuario } from './usuarios.js'

// Alta, edición y desactivación de explotaciones (GH-11)

export const PROVINCIAS = [
  'A Coruña',
  'Álava',
  'Albacete',
  'Alicante',
  'Almería',
  'Asturias',
  'Ávila',
  'Badajoz',
  'Barcelona',
  'Bizkaia',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Cantabria',
  'Castellón',
  'Ceuta',
  'Ciudad Real',
  'Córdoba',
  'Cuenca',
  'Gipuzkoa',
  'Girona',
  'Granada',
  'Guadalajara',
  'Huelva',
  'Huesca',
  'Illes Balears',
  'Jaén',
  'La Rioja',
  'Las Palmas',
  'León',
  'Lleida',
  'Lugo',
  'Madrid',
  'Málaga',
  'Melilla',
  'Murcia',
  'Navarra',
  'Ourense',
  'Palencia',
  'Pontevedra',
  'Salamanca',
  'Santa Cruz de Tenerife',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia',
  'Valladolid',
  'Zamora',
  'Zaragoza',
] as const

const texto = (mensaje: string) => z.string().trim().min(1, mensaje)

export const DatosExplotacion = z.object({
  nombre: texto('El nombre es obligatorio').openapi({ example: 'A Veiga' }),
  rega: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ES\d{12}$/, 'El código REGA son las letras ES y 12 dígitos')
    .openapi({ example: 'ES150780000001' }),
  municipio: texto('El municipio es obligatorio').openapi({ example: 'Lalín' }),
  provincia: z.enum(PROVINCIAS, { error: 'Elige una provincia' }).openapi('Provincia'),
})

export type DatosExplotacion = z.infer<typeof DatosExplotacion>

// Primer administrador: un usuario nuevo (con contraseña temporal) o uno que ya existe
export const PrimerAdministrador = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('nuevo'),
      usuario: z.string(),
      nombre: z.string(),
      email: z.string(),
    }),
    z.object({ tipo: z.literal('existente'), usuario: z.string().trim().toLowerCase() }),
  ])
  .openapi('PrimerAdministrador')

export type PrimerAdministrador = z.infer<typeof PrimerAdministrador>

// Punto de extensión: lo que hay que preparar en cada explotación nueva, dentro de la misma
// transacción (p. ej. los almacenes de comida por defecto del ciclo 5). Cada módulo registra el suyo:
//   alCrearExplotacion.push(async (tx, explotacionId, creadorId) => { ... })
export type AlCrearExplotacion = (
  tx: Transaccion,
  explotacionId: string,
  creadorId: string,
) => Promise<void>

export const alCrearExplotacion: AlCrearExplotacion[] = []

const regaEnUso = (rega: string) =>
  new ErrorApi(409, 'rega_en_uso', `Ya hay una explotación con el código REGA ${rega}`, [
    { campo: 'rega', mensaje: 'Ya hay una explotación con este código REGA' },
  ])

async function comprobarRegaLibre(ejecutor: Transaccion, rega: string, excepto?: string) {
  const [otra] = await ejecutor
    .select({ id: organization.id })
    .from(organization)
    .where(
      excepto
        ? and(eq(organization.rega, rega), ne(organization.id, excepto))
        : eq(organization.rega, rega),
    )
  if (otra) throw regaEnUso(rega)
}

// Crea la explotación y su primer administrador en una sola transacción. Devuelve la contraseña
// temporal si el administrador es un usuario nuevo: solo se muestra esta vez.
export async function crearExplotacion(
  datos: DatosExplotacion,
  administrador: PrimerAdministrador,
  creadorId: string,
) {
  return db.transaction(async (tx) => {
    await comprobarRegaLibre(tx, datos.rega)

    let admin: { id: string; username: string | null; name: string }
    let contrasenaTemporal: string | undefined
    if (administrador.tipo === 'nuevo') {
      try {
        const creado = await crearUsuario(administrador, tx)
        admin = creado.usuario
        contrasenaTemporal = creado.contrasenaTemporal
      } catch (error) {
        if (!(error instanceof ErrorUsuario)) throw error
        throw new ErrorApi(
          error.codigo === 'usuario_no_valido' ? 400 : 409,
          error.codigo === 'usuario_no_valido' ? 'validacion' : error.codigo,
          error.message,
          error.campo
            ? [{ campo: `administrador.${error.campo}`, mensaje: error.message }]
            : undefined,
        )
      }
    } else {
      const [existente] = await tx
        .select({ id: user.id, username: user.username, name: user.name, activo: user.activo })
        .from(user)
        .where(eq(user.username, administrador.usuario))
      if (!existente?.activo) {
        throw new ErrorApi(
          404,
          'usuario_no_encontrado',
          `No existe el usuario ${administrador.usuario}`,
          [
            {
              campo: 'administrador.usuario',
              mensaje: 'No hay ningún usuario activo con este nombre',
            },
          ],
        )
      }
      admin = existente
    }

    const [explotacion] = await tx
      .insert(organization)
      .values({
        name: datos.nombre,
        // Better Auth exige un identificador corto único; no se usa en la aplicación
        slug: randomUUID(),
        rega: datos.rega,
        municipio: datos.municipio,
        provincia: datos.provincia,
      })
      .returning()
    if (!explotacion) throw new Error('No se pudo crear la explotación')
    await tx
      .insert(member)
      .values({ organizationId: explotacion.id, userId: admin.id, role: 'administrador' })

    for (const preparar of alCrearExplotacion) await preparar(tx, explotacion.id, creadorId)

    return { explotacion, administrador: admin, contrasenaTemporal }
  })
}

export async function actualizarExplotacion(explotacionId: string, datos: DatosExplotacion) {
  return db.transaction(async (tx) => {
    await comprobarRegaLibre(tx, datos.rega, explotacionId)
    const [actualizada] = await tx
      .update(organization)
      .set({
        name: datos.nombre,
        rega: datos.rega,
        municipio: datos.municipio,
        provincia: datos.provincia,
      })
      .where(eq(organization.id, explotacionId))
      .returning()
    if (!actualizada)
      throw new ErrorApi(404, 'explotacion_no_encontrada', 'No existe la explotación')
    return actualizada
  })
}

export async function cambiarActiva(explotacionId: string, activa: boolean) {
  const [cambiada] = await db
    .update(organization)
    .set({ activa })
    .where(eq(organization.id, explotacionId))
    .returning()
  if (!cambiada) throw new ErrorApi(404, 'explotacion_no_encontrada', 'No existe la explotación')
  return cambiada
}
