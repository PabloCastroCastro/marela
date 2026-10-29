import { z } from '@hono/zod-openapi'
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { verAnimal } from './animales.js'
import type { Transaccion } from './db/explotacion.js'
import {
  animales,
  eventosReproductivos,
  FORMATO_CROTAL,
  KG_MAXIMO,
  partos,
  pesos,
  SEXOS,
  TERNEROS_MAXIMO,
  TIPOS_PARTO,
  tratamientos,
  user,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'
import { IdCliente, idEnUso, sinChoqueDeId } from './idCliente.js'

// Partos (GH-23). Un parto crea en la misma transacción la ficha de cada ternero, enlazada a la madre
// y al padre de la gestación en curso, y su pesada al nacer. No se corrige ni se borra: se anula, y
// con él se borran las fichas de sus terneros si no tienen nada más registrado.

export const ESTADOS_AL_NACER = ['vivo', 'muerto'] as const

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

const Ternero = z.object({
  crotal: z
    .string()
    .transform((c) => c.replace(/\s+/g, '').toUpperCase() || null)
    .pipe(
      z
        .string()
        .regex(
          FORMATO_CROTAL,
          'El crotal son las letras ES y 12 dígitos (o el código de otro país y hasta 12 dígitos)',
        )
        .nullable(),
    )
    .nullish()
    .openapi({ description: 'Opcional: se le puede poner en los 20 días siguientes' }),
  sexo: z.enum(SEXOS, 'Indica el sexo'),
  // Sin conexión (GH-33): el de su ficha, generado en el dispositivo
  id: IdCliente,
  estado: z.enum(ESTADOS_AL_NACER).default('vivo'),
  raza: z.string('Indica la raza').trim().min(1, 'Indica la raza'),
  peso: z
    .number('Indica el peso en kg')
    .positive('El peso tiene que ser mayor que 0')
    .max(KG_MAXIMO, `El peso no puede pasar de ${KG_MAXIMO} kg`)
    .transform((kg) => Math.round(kg * 10) / 10)
    .nullish()
    .openapi({ description: 'Peso al nacer, en kg' }),
})

export const DatosParto = z
  .object({
    // Sin conexión (GH-33): el del dispositivo; con él, los terneros llevan también el suyo
    id: IdCliente,
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    tipo: z.enum(TIPOS_PARTO).default('normal'),
    // Solo si la madre no tiene una gestación en curso: si la tiene, el padre es el de su cubrición
    // o inseminación
    padreId: z.uuid().nullish(),
    padreTexto: textoOpcional,
    observaciones: textoOpcional,
    terneros: z
      .array(Ternero)
      .min(1, 'Indica al menos un ternero')
      .max(TERNEROS_MAXIMO, `Como mucho ${TERNEROS_MAXIMO} terneros`),
  })
  .superRefine((p, ctx) => {
    if (p.fecha > hoyEnMadrid())
      ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'La fecha no puede ser futura' })
    if (p.padreId && p.padreTexto)
      ctx.addIssue({
        code: 'custom',
        path: ['padreTexto'],
        message: 'Indica un toro de la explotación o un texto, no los dos',
      })
    const vistos = new Set<string>()
    p.terneros.forEach((t, i) => {
      if (!t.crotal) return
      if (vistos.has(t.crotal))
        ctx.addIssue({
          code: 'custom',
          path: ['terneros', i, 'crotal'],
          message: 'Este crotal ya está en otro ternero del parto',
        })
      vistos.add(t.crotal)
    })
  })
  .openapi('DatosParto')

export type DatosParto = z.output<typeof DatosParto>

export const DatosAnulacionParto = z
  .object({
    motivo: z
      .string('Indica por qué se anula')
      .trim()
      .min(1, 'Indica por qué se anula')
      .openapi({ example: 'Registrado en la vaca equivocada' }),
  })
  .openapi('DatosAnulacionParto')

const padre = alias(animales, 'padre')
const anulador = alias(user, 'anulador')

const columnas = {
  id: partos.id,
  madreId: partos.madreId,
  fecha: partos.fecha,
  tipo: partos.tipo,
  padreId: partos.padreId,
  padreCrotal: padre.crotal,
  padreNombre: padre.nombre,
  padreTexto: partos.padreTexto,
  observaciones: partos.observaciones,
  anuladoEn: partos.anuladoEn,
  anuladoPorNombre: anulador.name,
  motivoAnulacion: partos.motivoAnulacion,
  creadoEn: partos.creadoEn,
  modificadoEn: partos.modificadoEn,
}

function consulta(tx: Transaccion) {
  return tx
    .select(columnas)
    .from(partos)
    .leftJoin(padre, eq(padre.id, partos.padreId))
    .leftJoin(anulador, eq(anulador.id, partos.anuladoPor))
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// Con sus terneros (los que siguen: los de un parto anulado se borraron)
async function conTerneros(tx: Transaccion, filas: Fila[]) {
  const ids = filas.map((f) => f.id)
  const terneros = ids.length
    ? await tx
        .select({
          id: animales.id,
          partoId: animales.partoId,
          crotal: animales.crotal,
          nombre: animales.nombre,
          sexo: animales.sexo,
          estado: animales.estado,
        })
        .from(animales)
        .where(inArray(animales.partoId, ids))
        .orderBy(asc(animales.creadoEn))
    : []
  return filas.map(
    ({ padreCrotal, padreNombre, anuladoEn, anuladoPorNombre, motivoAnulacion, ...p }) => ({
      ...p,
      padre: p.padreId ? { id: p.padreId, crotal: padreCrotal, nombre: padreNombre } : null,
      terneros: terneros.filter((t) => t.partoId === p.id).map(({ partoId: _p, ...t }) => t),
      anulacion: anuladoEn
        ? {
            en: anuladoEn.toISOString(),
            por: anuladoPorNombre ?? '',
            motivo: motivoAnulacion ?? '',
          }
        : null,
      creadoEn: p.creadoEn.toISOString(),
      modificadoEn: p.modificadoEn.toISOString(),
    }),
  )
}

// Partos de una vaca, del más reciente al más antiguo, anulados incluidos
export async function listarPartos(tx: Transaccion, madreId: string) {
  await verAnimal(tx, madreId)
  const filas = await consulta(tx)
    .where(eq(partos.madreId, madreId))
    .orderBy(desc(partos.fecha), desc(partos.creadoEn))
  return conTerneros(tx, filas)
}

async function verParto(tx: Transaccion, partoId: string) {
  const filas = await consulta(tx).where(eq(partos.id, partoId))
  const [parto] = await conTerneros(tx, filas)
  if (!parto) throw new ErrorApi(404, 'parto_no_encontrado', 'No existe el parto')
  return parto
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// Registra el parto y crea las fichas de sus terneros, todo o nada
export async function crearParto(tx: Transaccion, madreId: string, datos: DatosParto) {
  // Reenviado desde el dispositivo: el que ya se guardó, con sus terneros
  if (datos.id) {
    const [ya] = await tx
      .select({ madreId: partos.madreId })
      .from(partos)
      .where(eq(partos.id, datos.id))
    if (ya && ya.madreId !== madreId) throw idEnUso()
    if (ya) return verParto(tx, datos.id)
  }
  const madre = await verAnimal(tx, madreId)
  if (madre.sexo !== 'hembra') throw invalido('madreId', 'Solo las hembras tienen partos')
  if (datos.fecha < madre.fechaNacimiento)
    throw invalido('fecha', 'La fecha no puede ser anterior al nacimiento de la madre')
  if (madre.fechaBaja && datos.fecha > madre.fechaBaja)
    throw invalido('fecha', 'La fecha no puede ser posterior a la baja de la madre')

  // El padre: el de la cubrición o inseminación de la gestación en curso, o el indicado
  const [gestacion] = await tx
    .execute<{ padre_id: string | null; padre_texto: string | null }>(
      sql`select padre_id, padre_texto from gestacion(${madreId})`,
    )
    .then((r) => r.rows)
  const conGestacion = Boolean(gestacion?.padre_id || gestacion?.padre_texto)
  const padreId = conGestacion ? (gestacion?.padre_id ?? null) : (datos.padreId ?? null)
  const padreTexto = conGestacion ? (gestacion?.padre_texto ?? null) : (datos.padreTexto ?? null)
  if (!conGestacion && padreId) {
    const [p] = await tx
      .select({ sexo: animales.sexo })
      .from(animales)
      .where(eq(animales.id, padreId))
    if (p?.sexo !== 'macho')
      throw invalido('padreId', 'El padre tiene que ser un macho de la explotación')
  }

  const [parto] = await sinChoqueDeId('partos', () =>
    tx
      .insert(partos)
      .values({
        ...(datos.id ? { id: datos.id } : {}),
        madreId,
        fecha: datos.fecha,
        tipo: datos.tipo,
        padreId,
        padreTexto,
        observaciones: datos.observaciones ?? null,
      })
      .returning({ id: partos.id }),
  )
  if (!parto) throw new Error('No se pudo registrar el parto')

  for (const [i, t] of datos.terneros.entries()) {
    const muerto = t.estado === 'muerto'
    let ternero: { id: string } | undefined
    try {
      ;[ternero] = await tx
        .insert(animales)
        .values({
          ...(t.id ? { id: t.id } : {}),
          crotal: t.crotal ?? null,
          raza: t.raza,
          sexo: t.sexo,
          fechaNacimiento: datos.fecha,
          madreId,
          padreId,
          padreTexto,
          origen: 'nacido',
          partoId: parto.id,
          // Los nacidos muertos también tienen ficha, por trazabilidad
          ...(muerto
            ? {
                estado: 'muerto' as const,
                tipoBaja: 'muerte' as const,
                fechaBaja: datos.fecha,
                causaBaja: 'Nacido muerto',
              }
            : {}),
        })
        .returning({ id: animales.id })
    } catch (error) {
      const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
      if (causa?.code === '23505' && causa.constraint === 'animales_pkey') throw idEnUso()
      if (causa?.code === '23505' && causa.constraint === 'animales_crotal_unique') {
        const mensaje = 'Ya hay un animal con este crotal'
        throw new ErrorApi(409, 'crotal_en_uso', mensaje, [
          { campo: `terneros.${i}.crotal`, mensaje },
        ])
      }
      throw error
    }
    if (ternero && t.peso != null)
      await tx
        .insert(pesos)
        .values({ animalId: ternero.id, fecha: datos.fecha, kg: t.peso, momento: 'nacimiento' })
  }
  return verParto(tx, parto.id)
}

// Lo que impide borrar la ficha de un ternero al anular su parto: cualquier dato registrado después,
// salvo su pesada al nacer
async function datosDelTernero(tx: Transaccion, id: string) {
  const contar = async (consulta: Promise<{ n: number }[]>) => (await consulta)[0]?.n ?? 0
  const datos = [
    [
      'pesadas',
      await contar(
        tx
          .select({ n: count() })
          .from(pesos)
          .where(and(eq(pesos.animalId, id), ne(pesos.momento, 'nacimiento'))),
      ),
    ],
    [
      'tratamientos',
      await contar(
        tx.select({ n: count() }).from(tratamientos).where(eq(tratamientos.animalId, id)),
      ),
    ],
    [
      'eventos reproductivos',
      await contar(
        tx
          .select({ n: count() })
          .from(eventosReproductivos)
          .where(or(eq(eventosReproductivos.animalId, id), eq(eventosReproductivos.padreId, id))),
      ),
    ],
    [
      'hijos',
      await contar(
        tx
          .select({ n: count() })
          .from(animales)
          .where(or(eq(animales.madreId, id), eq(animales.padreId, id))),
      ),
    ],
  ] as const
  return datos.filter(([, n]) => n > 0).map(([que]) => que)
}

// Anula el parto y borra las fichas de sus terneros, que quedan en el historial de cambios
export async function anularParto(
  tx: Transaccion,
  partoId: string,
  { motivo }: z.output<typeof DatosAnulacionParto>,
) {
  const parto = await verParto(tx, partoId)
  if (parto.anulacion) throw new ErrorApi(409, 'ya_anulado', 'El parto ya está anulado')
  for (const t of parto.terneros) {
    const datos = await datosDelTernero(tx, t.id)
    if (datos.length > 0)
      throw new ErrorApi(
        409,
        'terneros_con_datos',
        `${t.crotal ?? 'Un ternero sin crotal'} ya tiene ${datos.join(', ')}: no se puede anular el parto`,
      )
  }
  const ids = parto.terneros.map((t) => t.id)
  if (ids.length > 0) {
    await tx.delete(pesos).where(inArray(pesos.animalId, ids))
    await tx.delete(animales).where(inArray(animales.id, ids))
  }
  await tx
    .update(partos)
    .set({ anuladoEn: sql`now()`, anuladoPor: sql`usuario_actual()`, motivoAnulacion: motivo })
    .where(and(eq(partos.id, partoId), isNull(partos.anuladoEn)))
  return verParto(tx, partoId)
}
