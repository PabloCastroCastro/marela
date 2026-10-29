import { z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Transaccion } from './db/explotacion.js'
import {
  fincas,
  HECTAREAS_MAXIMO,
  labores,
  member,
  parcelas,
  TIPOS_LABOR,
  UNIDADES_COSECHA,
  user,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'
import { verFinca } from './fincas.js'
import { comprobarIds, IdsCliente, reenvio, sinChoqueDeId } from './idCliente.js'

// Siembras, cosechas y otras labores de las fincas (GH-26). Como en fincas.ts, todas las funciones
// reciben la transacción de enLaExplotacion. Se corrigen o se borran; los cambios quedan en el
// historial.

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

const Campos = z.object({
  tipo: z.enum(TIPOS_LABOR, 'Indica el tipo'),
  fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
  cultivo: textoOpcional.openapi({ example: 'Maíz forrajero' }),
  labor: textoOpcional.openapi({ example: 'Siega' }),
  // Sin ella, la de la finca entera
  superficie: z
    .number('Indica la superficie en hectáreas')
    .positive('La superficie tiene que ser mayor que 0')
    .max(HECTAREAS_MAXIMO, `Como mucho ${HECTAREAS_MAXIMO} ha`)
    .transform((ha) => Math.round(ha * 10_000) / 10_000)
    .nullish(),
  cantidad: z
    .number('Indica la cantidad')
    .positive('La cantidad tiene que ser mayor que 0')
    .transform((n) => Math.round(n * 100) / 100)
    .nullish(),
  unidad: z.enum(UNIDADES_COSECHA).nullish(),
  realizadaPorId: z.uuid().nullish(),
  realizadaPorTexto: textoOpcional.openapi({ example: 'Contratista Hermanos Rey' }),
  observaciones: textoOpcional,
})

type Campos = z.output<typeof Campos>

function comprobarCampos(l: Campos, ctx: z.RefinementCtx) {
  const fallo = (campo: string, mensaje: string) =>
    ctx.addIssue({ code: 'custom', path: [campo], message: mensaje })
  if (l.fecha > hoyEnMadrid()) fallo('fecha', 'La fecha no puede ser futura')
  if (l.tipo === 'otra' && !l.labor) fallo('labor', 'Indica la labor')
  if (l.tipo !== 'otra' && !l.cultivo) fallo('cultivo', 'Indica el cultivo')
  if (l.cantidad != null && !l.unidad) fallo('unidad', 'Indica la unidad')
  if (l.realizadaPorId && l.realizadaPorTexto)
    fallo('realizadaPorTexto', 'Indica una persona del equipo o un nombre, no los dos')
}

// Registrar: la misma labor en una o varias fincas, una por finca
export const DatosLabor = Campos.extend({
  fincaIds: z
    .array(z.uuid())
    .min(1, 'Elige al menos una finca')
    .max(200)
    .transform((ids) => [...new Set(ids)]),
  // Sin conexión (GH-32): los del dispositivo
  ids: IdsCliente,
})
  .superRefine((l, ctx) => {
    comprobarCampos(l, ctx)
    comprobarIds(l.ids, l.fincaIds, ctx)
    if (l.superficie != null && l.fincaIds.length > 1)
      ctx.addIssue({
        code: 'custom',
        path: ['superficie'],
        message: 'En varias fincas a la vez, cada una con su superficie entera',
      })
  })
  .openapi('DatosLabor')

// Corregir una labor
export const CambioLabor = Campos.superRefine(comprobarCampos).openapi('CambioLabor')

export type DatosLabor = z.output<typeof DatosLabor>

const realizadaPor = alias(user, 'realizada_por')

const columnas = {
  id: labores.id,
  fincaId: labores.fincaId,
  tipo: labores.tipo,
  fecha: labores.fecha,
  cultivo: labores.cultivo,
  labor: labores.labor,
  superficie: labores.superficie,
  cantidad: labores.cantidad,
  unidad: labores.unidad,
  realizadaPorId: labores.realizadaPorId,
  realizadaPorNombre: realizadaPor.name,
  realizadaPorTexto: labores.realizadaPorTexto,
  observaciones: labores.observaciones,
  creadoEn: labores.creadoEn,
  modificadoEn: labores.modificadoEn,
}

function consulta(tx: Transaccion) {
  return tx
    .select(columnas)
    .from(labores)
    .leftJoin(realizadaPor, eq(realizadaPor.id, labores.realizadaPorId))
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// Quién la realizó, como objeto, en lugar de las columnas sueltas
const labor = ({ realizadaPorId, realizadaPorNombre, realizadaPorTexto, ...l }: Fila) => ({
  ...l,
  realizadaPor: realizadaPorId
    ? { id: realizadaPorId, nombre: realizadaPorNombre ?? '' }
    : realizadaPorTexto
      ? { id: null, nombre: realizadaPorTexto }
      : null,
  creadoEn: l.creadoEn.toISOString(),
  modificadoEn: l.modificadoEn.toISOString(),
})

// Las de una finca, de la más reciente a la más antigua
export async function listarLabores(tx: Transaccion, fincaId: string) {
  await verFinca(tx, fincaId)
  const filas = await consulta(tx)
    .where(eq(labores.fincaId, fincaId))
    .orderBy(desc(labores.fecha), desc(labores.creadoEn))
  return filas.map(labor)
}

async function verLabor(tx: Transaccion, laborId: string) {
  const [fila] = await consulta(tx).where(eq(labores.id, laborId))
  if (!fila) throw new ErrorApi(404, 'labor_no_encontrada', 'No existe la labor')
  return labor(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// Superficie de cada finca, la suma de sus parcelas
async function superficies(tx: Transaccion, fincaIds: string[]) {
  const filas = await tx
    .select({
      id: fincas.id,
      nombre: fincas.nombre,
      activa: fincas.activa,
      superficie: sql<number>`coalesce(sum(${parcelas.superficie}), 0)::float8`,
    })
    .from(fincas)
    .leftJoin(parcelas, eq(parcelas.fincaId, fincas.id))
    .where(inArray(fincas.id, fincaIds))
    .groupBy(fincas.id)
  return new Map(filas.map((f) => [f.id, f]))
}

// La persona que la realiza, del equipo de la explotación. La base de datos lo comprueba también;
// aquí se hace antes para dar el error en su campo.
async function comprobarPersona(tx: Transaccion, usuarioId: string | null | undefined) {
  if (!usuarioId) return
  const [miembro] = await tx
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.userId, usuarioId), eq(member.organizationId, sql`explotacion_actual()`)))
  if (!miembro) throw invalido('realizadaPorId', 'Esa persona no es del equipo de la explotación')
}

const valores = (l: Campos) => ({
  tipo: l.tipo,
  fecha: l.fecha,
  cultivo: l.tipo === 'otra' ? null : (l.cultivo ?? null),
  labor: l.tipo === 'otra' ? (l.labor ?? null) : null,
  cantidad: l.tipo === 'cosecha' ? (l.cantidad ?? null) : null,
  unidad: l.tipo === 'cosecha' && l.cantidad != null ? (l.unidad ?? null) : null,
  realizadaPorId: l.realizadaPorId ?? null,
  realizadaPorTexto: l.realizadaPorTexto ?? null,
  observaciones: l.observaciones ?? null,
})

// Registra la misma labor en una o varias fincas activas: una por finca, todas o ninguna
export async function crearLabores(tx: Transaccion, datos: DatosLabor) {
  // Reenviadas desde el dispositivo: las que ya se guardaron
  const ya = await reenvio(datos.ids, (ids) => consulta(tx).where(inArray(labores.id, ids)))
  if (ya) return ya.map(labor)
  const suyas = await superficies(tx, datos.fincaIds)
  if (suyas.size < datos.fincaIds.length)
    throw invalido('fincaIds', 'Alguna finca no está entre las de la explotación')
  const desactivadas = [...suyas.values()].filter((f) => !f.activa).map((f) => f.nombre)
  if (desactivadas.length)
    throw invalido('fincaIds', `Está desactivada: ${desactivadas.join(', ')}`)
  const [unica] = suyas.values()
  if (datos.superficie != null && unica && datos.superficie > unica.superficie)
    throw invalido(
      'superficie',
      `No puede pasar de la de la finca (${String(unica.superficie).replace('.', ',')} ha)`,
    )
  await comprobarPersona(tx, datos.realizadaPorId)
  const creadas = await sinChoqueDeId('labores', () =>
    tx
      .insert(labores)
      .values(
        datos.fincaIds.map((fincaId, i) => ({
          ...(datos.ids ? { id: datos.ids[i] } : {}),
          fincaId,
          superficie: datos.superficie ?? suyas.get(fincaId)?.superficie ?? 0,
          ...valores(datos),
        })),
      )
      .returning({ id: labores.id }),
  )
  const filas = await consulta(tx).where(
    inArray(
      labores.id,
      creadas.map((c) => c.id),
    ),
  )
  return filas.map(labor)
}

export async function corregirLabor(
  tx: Transaccion,
  laborId: string,
  cambio: z.output<typeof CambioLabor>,
) {
  const actual = await verLabor(tx, laborId)
  const finca = (await superficies(tx, [actual.fincaId])).get(actual.fincaId)
  const superficie = cambio.superficie ?? actual.superficie
  if (finca && superficie > finca.superficie)
    throw invalido(
      'superficie',
      `No puede pasar de la de la finca (${String(finca.superficie).replace('.', ',')} ha)`,
    )
  await comprobarPersona(tx, cambio.realizadaPorId)
  await tx
    .update(labores)
    .set({ superficie, ...valores(cambio) })
    .where(eq(labores.id, laborId))
  return verLabor(tx, laborId)
}

// Borra una labor registrada por error y la devuelve, para poder deshacerlo. Queda en el historial.
export async function borrarLabor(tx: Transaccion, laborId: string) {
  const borrada = await verLabor(tx, laborId)
  await tx.delete(labores).where(eq(labores.id, laborId))
  return borrada
}

// Para el formulario: las personas activas del equipo y los cultivos y labores ya usados
export async function opcionesLabor(tx: Transaccion) {
  const personas = await tx
    .select({ id: user.id, nombre: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(
      and(
        eq(member.organizationId, sql`explotacion_actual()`),
        eq(member.activo, true),
        eq(user.activo, true),
      ),
    )
    .orderBy(asc(user.name))
  const usados = await tx
    .selectDistinct({ cultivo: labores.cultivo, labor: labores.labor })
    .from(labores)
  const lista = (xs: (string | null)[]) =>
    [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'es'))
  return {
    personas,
    cultivos: lista(usados.map((u) => u.cultivo)),
    labores: lista(usados.map((u) => u.labor)),
  }
}
