import { z } from '@hono/zod-openapi'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import { ANIMALES_PASTOREO_MAXIMO, fincas, pastoreos } from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'
import { verFinca } from './fincas.js'

// Pastoreos de las fincas (GH-28). Como en labores.ts, todas las funciones reciben la transacción de
// enLaExplotacion. Se corrigen o se borran; los cambios quedan en el historial.

const fechaSalida = z.iso.date('Fecha no válida (aaaa-mm-dd)').nullish()

const Campos = z.object({
  fechaEntrada: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
  // Sin ella, los animales siguen en la finca
  fechaSalida,
  animales: z
    .number('Indica el número de animales')
    .int('El número de animales es un número entero')
    .positive('Indica al menos un animal')
    .max(ANIMALES_PASTOREO_MAXIMO, `Como mucho ${ANIMALES_PASTOREO_MAXIMO} animales`)
    .openapi({ example: 12 }),
  observaciones: z
    .string()
    .trim()
    .transform((t) => t || null)
    .nullish()
    .openapi({ example: 'Vacas con sus crías' }),
})

function comprobarFechas(
  p: { fechaEntrada: string; fechaSalida?: string | null },
  ctx: z.RefinementCtx,
) {
  const hoy = hoyEnMadrid()
  if (p.fechaEntrada > hoy)
    ctx.addIssue({
      code: 'custom',
      path: ['fechaEntrada'],
      message: 'La fecha no puede ser futura',
    })
  if (p.fechaSalida && p.fechaSalida > hoy)
    ctx.addIssue({ code: 'custom', path: ['fechaSalida'], message: 'La fecha no puede ser futura' })
  if (p.fechaSalida && p.fechaSalida < p.fechaEntrada)
    ctx.addIssue({
      code: 'custom',
      path: ['fechaSalida'],
      message: 'La salida no puede ser antes de la entrada',
    })
}

// Registrar la entrada de los animales en una finca (y su salida, si ya salieron)
export const DatosPastoreo = Campos.extend({ fincaId: z.uuid() })
  .superRefine(comprobarFechas)
  .openapi('DatosPastoreo')

// Corregir un pastoreo
export const CambioPastoreo = Campos.superRefine(comprobarFechas).openapi('CambioPastoreo')

export const DatosSalida = z
  .object({ fechaSalida: z.iso.date('Indica la fecha de salida') })
  .openapi('DatosSalida')

const columnas = {
  id: pastoreos.id,
  fincaId: pastoreos.fincaId,
  fechaEntrada: pastoreos.fechaEntrada,
  fechaSalida: pastoreos.fechaSalida,
  animales: pastoreos.animales,
  observaciones: pastoreos.observaciones,
  creadoEn: pastoreos.creadoEn,
  modificadoEn: pastoreos.modificadoEn,
}

type Fila = { creadoEn: Date; modificadoEn: Date }

const pastoreo = <T extends Fila>(p: T) => ({
  ...p,
  creadoEn: p.creadoEn.toISOString(),
  modificadoEn: p.modificadoEn.toISOString(),
})

// Los de una finca, el que está en curso primero y luego del más reciente al más antiguo
export async function listarPastoreos(tx: Transaccion, fincaId: string) {
  await verFinca(tx, fincaId)
  const filas = await tx
    .select(columnas)
    .from(pastoreos)
    .where(eq(pastoreos.fincaId, fincaId))
    .orderBy(
      sql`${pastoreos.fechaSalida} is not null`,
      desc(pastoreos.fechaEntrada),
      desc(pastoreos.creadoEn),
    )
  return filas.map(pastoreo)
}

async function verPastoreo(tx: Transaccion, pastoreoId: string) {
  const [fila] = await tx.select(columnas).from(pastoreos).where(eq(pastoreos.id, pastoreoId))
  if (!fila) throw new ErrorApi(404, 'pastoreo_no_encontrado', 'No existe el pastoreo')
  return pastoreo(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// Un solo pastoreo en curso por finca. La base de datos lo comprueba también; aquí se hace antes para
// dar un error claro.
async function comprobarEnCurso(tx: Transaccion, fincaId: string, excepto?: string) {
  const [enCurso] = await tx
    .select({ fechaEntrada: pastoreos.fechaEntrada })
    .from(pastoreos)
    .where(
      and(
        eq(pastoreos.fincaId, fincaId),
        isNull(pastoreos.fechaSalida),
        excepto ? ne(pastoreos.id, excepto) : undefined,
      ),
    )
  if (enCurso) {
    const [a, m, d] = enCurso.fechaEntrada.split('-')
    throw new ErrorApi(
      409,
      'pastoreo_en_curso',
      `Ya hay animales pastando en esta finca desde el ${d}/${m}/${a}: registra antes su salida`,
    )
  }
}

export async function crearPastoreo(tx: Transaccion, datos: z.output<typeof DatosPastoreo>) {
  const [finca] = await tx
    .select({ activa: fincas.activa })
    .from(fincas)
    .where(eq(fincas.id, datos.fincaId))
  if (!finca) throw invalido('fincaId', 'La finca no está entre las de la explotación')
  if (!finca.activa) throw invalido('fincaId', 'La finca está desactivada')
  if (!datos.fechaSalida) await comprobarEnCurso(tx, datos.fincaId)
  const [creado] = await tx
    .insert(pastoreos)
    .values({
      fincaId: datos.fincaId,
      fechaEntrada: datos.fechaEntrada,
      fechaSalida: datos.fechaSalida ?? null,
      animales: datos.animales,
      observaciones: datos.observaciones ?? null,
    })
    .returning({ id: pastoreos.id })
  return verPastoreo(tx, creado?.id ?? '')
}

export async function corregirPastoreo(
  tx: Transaccion,
  pastoreoId: string,
  cambio: z.output<typeof CambioPastoreo>,
) {
  const actual = await verPastoreo(tx, pastoreoId)
  if (!cambio.fechaSalida) await comprobarEnCurso(tx, actual.fincaId, pastoreoId)
  await tx
    .update(pastoreos)
    .set({
      fechaEntrada: cambio.fechaEntrada,
      fechaSalida: cambio.fechaSalida ?? null,
      animales: cambio.animales,
      observaciones: cambio.observaciones ?? null,
    })
    .where(eq(pastoreos.id, pastoreoId))
  return verPastoreo(tx, pastoreoId)
}

// La salida de los animales de un pastoreo en curso
export async function registrarSalida(
  tx: Transaccion,
  pastoreoId: string,
  { fechaSalida }: z.output<typeof DatosSalida>,
) {
  const actual = await verPastoreo(tx, pastoreoId)
  if (actual.fechaSalida)
    throw new ErrorApi(409, 'ya_salieron', 'Los animales ya salieron de la finca')
  if (fechaSalida > hoyEnMadrid()) throw invalido('fechaSalida', 'La fecha no puede ser futura')
  if (fechaSalida < actual.fechaEntrada)
    throw invalido('fechaSalida', 'La salida no puede ser antes de la entrada')
  await tx.update(pastoreos).set({ fechaSalida }).where(eq(pastoreos.id, pastoreoId))
  return verPastoreo(tx, pastoreoId)
}

// Borra un pastoreo registrado por error y lo devuelve, para poder deshacerlo. Queda en el historial.
export async function borrarPastoreo(tx: Transaccion, pastoreoId: string) {
  const borrado = await verPastoreo(tx, pastoreoId)
  await tx.delete(pastoreos).where(eq(pastoreos.id, pastoreoId))
  return borrado
}
