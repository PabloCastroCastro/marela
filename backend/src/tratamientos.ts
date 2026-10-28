import { z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { verAnimal } from './animales.js'
import type { Transaccion } from './db/explotacion.js'
import {
  animales,
  DIAS_SUPRESION_MAXIMO,
  MOTIVOS_TRATAMIENTO,
  member,
  tratamientos,
  user,
  VIAS_ADMINISTRACION,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'

// Tratamientos sanitarios (GH-20). Como en animales.ts, todas las funciones reciben la transacción
// de enLaExplotacion. Un tratamiento no se corrige ni se borra: se anula con un motivo.

// Animales que se pueden tratar a la vez
export const ANIMALES_POR_TRATAMIENTO = 500

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

export const DatosTratamiento = z
  .object({
    animalIds: z
      .array(z.uuid())
      .min(1, 'Elige al menos un animal')
      .max(ANIMALES_POR_TRATAMIENTO, `Como mucho ${ANIMALES_POR_TRATAMIENTO} animales a la vez`)
      .transform((ids) => [...new Set(ids)]),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    producto: z
      .string('Indica el producto o medicamento')
      .trim()
      .min(1, 'Indica el producto o medicamento')
      .openapi({ example: 'Ivermectina 1 %' }),
    dosis: textoOpcional.openapi({ example: '10 ml' }),
    via: z.enum(VIAS_ADMINISTRACION).nullish(),
    motivo: z.enum(MOTIVOS_TRATAMIENTO, 'Indica el motivo'),
    diagnostico: textoOpcional.openapi({ example: 'Parásitos internos' }),
    aplicadoPorId: z.uuid().nullish(),
    aplicadoPorTexto: textoOpcional.openapi({ example: 'Veterinaria de la ADS' }),
    lote: textoOpcional,
    diasSupresion: z
      .number('Indica los días de supresión (0 si no tiene)')
      .int('Los días de supresión son un número entero')
      .min(0, 'Los días de supresión no pueden ser negativos')
      .max(DIAS_SUPRESION_MAXIMO, `Como mucho ${DIAS_SUPRESION_MAXIMO} días`),
    observaciones: textoOpcional,
  })
  .superRefine((t, ctx) => {
    if (t.fecha > hoyEnMadrid())
      ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'La fecha no puede ser futura' })
    if (t.aplicadoPorId && t.aplicadoPorTexto)
      ctx.addIssue({
        code: 'custom',
        path: ['aplicadoPorTexto'],
        message: 'Indica una persona del equipo o un nombre, no los dos',
      })
  })
  .openapi('DatosTratamiento')

export type DatosTratamiento = z.output<typeof DatosTratamiento>

export const DatosAnulacion = z
  .object({
    motivo: z
      .string('Indica por qué se anula')
      .trim()
      .min(1, 'Indica por qué se anula')
      .openapi({ example: 'Registrado en el animal equivocado' }),
  })
  .openapi('DatosAnulacion')

const aplicador = alias(user, 'aplicador')
const anulador = alias(user, 'anulador')

const columnas = {
  id: tratamientos.id,
  animalId: tratamientos.animalId,
  fecha: tratamientos.fecha,
  producto: tratamientos.producto,
  dosis: tratamientos.dosis,
  via: tratamientos.via,
  motivo: tratamientos.motivo,
  diagnostico: tratamientos.diagnostico,
  aplicadoPorId: tratamientos.aplicadoPorId,
  aplicadoPorNombre: aplicador.name,
  aplicadoPorTexto: tratamientos.aplicadoPorTexto,
  lote: tratamientos.lote,
  diasSupresion: tratamientos.diasSupresion,
  finSupresion: tratamientos.finSupresion,
  observaciones: tratamientos.observaciones,
  anuladoEn: tratamientos.anuladoEn,
  anuladoPorNombre: anulador.name,
  motivoAnulacion: tratamientos.motivoAnulacion,
  creadoEn: tratamientos.creadoEn,
  modificadoEn: tratamientos.modificadoEn,
}

function consulta(tx: Transaccion) {
  return tx
    .select(columnas)
    .from(tratamientos)
    .leftJoin(aplicador, eq(aplicador.id, tratamientos.aplicadoPorId))
    .leftJoin(anulador, eq(anulador.id, tratamientos.anuladoPor))
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// Quién lo administró y la anulación, como objetos, en lugar de las columnas sueltas
function tratamiento({
  aplicadoPorId,
  aplicadoPorNombre,
  aplicadoPorTexto,
  anuladoEn,
  anuladoPorNombre,
  motivoAnulacion,
  ...t
}: Fila) {
  return {
    ...t,
    aplicadoPor: aplicadoPorId
      ? { id: aplicadoPorId, nombre: aplicadoPorNombre ?? '' }
      : aplicadoPorTexto
        ? { id: null, nombre: aplicadoPorTexto }
        : null,
    anulacion: anuladoEn
      ? { en: anuladoEn.toISOString(), por: anuladoPorNombre ?? '', motivo: motivoAnulacion ?? '' }
      : null,
    creadoEn: t.creadoEn.toISOString(),
    modificadoEn: t.modificadoEn.toISOString(),
  }
}

// Del más reciente al más antiguo, anulados incluidos
export async function listarTratamientos(tx: Transaccion, animalId: string) {
  await verAnimal(tx, animalId)
  const filas = await consulta(tx)
    .where(eq(tratamientos.animalId, animalId))
    .orderBy(desc(tratamientos.fecha), desc(tratamientos.creadoEn))
  return filas.map(tratamiento)
}

async function verTratamiento(tx: Transaccion, tratamientoId: string) {
  const [fila] = await consulta(tx).where(eq(tratamientos.id, tratamientoId))
  if (!fila) throw new ErrorApi(404, 'tratamiento_no_encontrado', 'No existe el tratamiento')
  return tratamiento(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// Los animales son de la explotación (la Row-Level Security solo deja ver los suyos) y la fecha,
// de su vida en ella. Quien lo administra, si es del equipo, es miembro de la explotación. La base
// de datos lo comprueba también; aquí se hace antes para dar el error en su campo.
async function comprobar(tx: Transaccion, datos: DatosTratamiento) {
  const encontrados = await tx
    .select({
      id: animales.id,
      crotal: animales.crotal,
      fechaNacimiento: animales.fechaNacimiento,
      fechaBaja: animales.fechaBaja,
    })
    .from(animales)
    .where(inArray(animales.id, datos.animalIds))
  if (encontrados.length < datos.animalIds.length)
    throw invalido('animalIds', 'Algún animal no está entre los de la explotación')
  const antes = encontrados.filter((a) => datos.fecha < a.fechaNacimiento).map((a) => a.crotal)
  if (antes.length > 0)
    throw invalido(
      'fecha',
      antes.length === 1 && datos.animalIds.length === 1
        ? 'La fecha no puede ser anterior al nacimiento del animal'
        : `La fecha es anterior al nacimiento de ${antes.join(', ')}`,
    )
  const despues = encontrados
    .filter((a) => a.fechaBaja && datos.fecha > a.fechaBaja)
    .map((a) => a.crotal)
  if (despues.length > 0)
    throw invalido(
      'fecha',
      despues.length === 1 && datos.animalIds.length === 1
        ? 'La fecha no puede ser posterior a la baja del animal'
        : `La fecha es posterior a la baja de ${despues.join(', ')}`,
    )
  if (datos.aplicadoPorId) {
    const [miembro] = await tx
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, datos.aplicadoPorId),
          eq(member.organizationId, sql`explotacion_actual()`),
        ),
      )
    if (!miembro) throw invalido('aplicadoPorId', 'Esa persona no es del equipo de la explotación')
  }
}

// Registra el mismo tratamiento a uno o varios animales: un tratamiento por animal
export async function crearTratamientos(tx: Transaccion, datos: DatosTratamiento) {
  await comprobar(tx, datos)
  const { animalIds, ...comunes } = datos
  const creados = await tx
    .insert(tratamientos)
    .values(
      animalIds.map((animalId) => ({
        animalId,
        fecha: comunes.fecha,
        producto: comunes.producto,
        dosis: comunes.dosis ?? null,
        via: comunes.via ?? null,
        motivo: comunes.motivo,
        diagnostico: comunes.diagnostico ?? null,
        aplicadoPorId: comunes.aplicadoPorId ?? null,
        aplicadoPorTexto: comunes.aplicadoPorTexto ?? null,
        lote: comunes.lote ?? null,
        diasSupresion: comunes.diasSupresion,
        observaciones: comunes.observaciones ?? null,
      })),
    )
    .returning({ id: tratamientos.id })
  const filas = await consulta(tx)
    .where(
      inArray(
        tratamientos.id,
        creados.map((c) => c.id),
      ),
    )
    .orderBy(asc(tratamientos.creadoEn))
  return filas.map(tratamiento)
}

export async function anularTratamiento(
  tx: Transaccion,
  tratamientoId: string,
  { motivo }: z.output<typeof DatosAnulacion>,
) {
  const actual = await verTratamiento(tx, tratamientoId)
  if (actual.anulacion) throw new ErrorApi(409, 'ya_anulado', 'El tratamiento ya está anulado')
  await tx
    .update(tratamientos)
    .set({
      anuladoEn: sql`now()`,
      anuladoPor: sql`usuario_actual()`,
      motivoAnulacion: motivo,
    })
    .where(and(eq(tratamientos.id, tratamientoId), isNull(tratamientos.anuladoEn)))
  return verTratamiento(tx, tratamientoId)
}

// Para el formulario: las personas activas del equipo, para elegir quién lo administra, y los
// productos ya usados en la explotación, para sugerirlos
export async function opcionesTratamiento(tx: Transaccion) {
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
  const productos = await tx
    .selectDistinct({ producto: tratamientos.producto })
    .from(tratamientos)
    .where(isNull(tratamientos.anuladoEn))
    .orderBy(asc(tratamientos.producto))
  return { personas, productos: productos.map((p) => p.producto) }
}
