import { z } from '@hono/zod-openapi'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { verAnimal } from './animales.js'
import type { Transaccion } from './db/explotacion.js'
import {
  animales,
  EVENTOS_DE_HEMBRA,
  eventosReproductivos,
  KG_MAXIMO,
  METODOS_DIAGNOSTICO,
  pesos,
  RESULTADOS_DIAGNOSTICO,
  TIPOS_EVENTO_REPRODUCTIVO,
  user,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'

// Eventos reproductivos (GH-22): cubrición, inseminación, diagnóstico de gestación, aborto y
// destete. Como en animales.ts, todas las funciones reciben la transacción de enLaExplotacion. Un
// evento no se corrige ni se borra: se anula con un motivo.

// Animales a los que se puede registrar un evento a la vez
export const ANIMALES_POR_EVENTO = 500

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

const deHembra = (tipo: string) => (EVENTOS_DE_HEMBRA as readonly string[]).includes(tipo)
const conPadre = (tipo: string) => tipo === 'cubricion' || tipo === 'inseminacion'

export const DatosEvento = z
  .object({
    animalIds: z
      .array(z.uuid())
      .min(1, 'Elige al menos un animal')
      .max(ANIMALES_POR_EVENTO, `Como mucho ${ANIMALES_POR_EVENTO} animales a la vez`)
      .transform((ids) => [...new Set(ids)]),
    tipo: z.enum(TIPOS_EVENTO_REPRODUCTIVO, 'Indica el tipo'),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    // Cubrición e inseminación: el toro de la explotación o un texto (toro ajeno, dosis)
    padreId: z.uuid().nullish(),
    padreTexto: textoOpcional.openapi({ example: 'Dosis RG-1187' }),
    // Diagnóstico de gestación
    metodo: z.enum(METODOS_DIAGNOSTICO).nullish(),
    resultado: z.enum(RESULTADOS_DIAGNOSTICO).nullish(),
    // Destete de un ternero: su peso, que se guarda también como su pesada al destete
    pesoDestete: z
      .number('Indica el peso en kg')
      .positive('El peso tiene que ser mayor que 0')
      .max(KG_MAXIMO, `El peso no puede pasar de ${KG_MAXIMO} kg`)
      .transform((kg) => Math.round(kg * 10) / 10)
      .nullish(),
    observaciones: textoOpcional,
  })
  .superRefine((e, ctx) => {
    const fallo = (campo: string, mensaje: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message: mensaje })
    if (e.fecha > hoyEnMadrid()) fallo('fecha', 'La fecha no puede ser futura')
    if (conPadre(e.tipo)) {
      if (e.padreId && e.padreTexto)
        fallo('padreTexto', 'Indica un toro de la explotación o un texto, no los dos')
      else if (!e.padreId && !e.padreTexto)
        fallo('padreId', e.tipo === 'inseminacion' ? 'Indica la dosis o el toro' : 'Indica el toro')
    }
    if (e.tipo === 'diagnostico') {
      if (!e.metodo) fallo('metodo', 'Indica el método')
      if (!e.resultado) fallo('resultado', 'Indica el resultado')
    }
    if (e.pesoDestete != null) {
      if (e.tipo !== 'destete') fallo('pesoDestete', 'El peso solo se indica en el destete')
      else if (e.animalIds.length > 1)
        fallo('pesoDestete', 'El peso se indica destetando los terneros de uno en uno')
    }
  })
  .openapi('DatosEvento')

export type DatosEvento = z.output<typeof DatosEvento>

export const DatosAnulacionEvento = z
  .object({
    motivo: z
      .string('Indica por qué se anula')
      .trim()
      .min(1, 'Indica por qué se anula')
      .openapi({ example: 'Registrado en la vaca equivocada' }),
  })
  .openapi('DatosAnulacionEvento')

const animal = alias(animales, 'animal')
const padre = alias(animales, 'padre')
const anulador = alias(user, 'anulador')

const columnas = {
  id: eventosReproductivos.id,
  tipo: eventosReproductivos.tipo,
  fecha: eventosReproductivos.fecha,
  animalId: eventosReproductivos.animalId,
  animalCrotal: animal.crotal,
  animalNombre: animal.nombre,
  padreId: eventosReproductivos.padreId,
  padreCrotal: padre.crotal,
  padreNombre: padre.nombre,
  padreTexto: eventosReproductivos.padreTexto,
  fechaPrevistaParto: eventosReproductivos.fechaPrevistaParto,
  metodo: eventosReproductivos.metodo,
  resultado: eventosReproductivos.resultado,
  observaciones: eventosReproductivos.observaciones,
  anuladoEn: eventosReproductivos.anuladoEn,
  anuladoPorNombre: anulador.name,
  motivoAnulacion: eventosReproductivos.motivoAnulacion,
  creadoEn: eventosReproductivos.creadoEn,
  modificadoEn: eventosReproductivos.modificadoEn,
}

function consulta(tx: Transaccion) {
  return tx
    .select(columnas)
    .from(eventosReproductivos)
    .innerJoin(animal, eq(animal.id, eventosReproductivos.animalId))
    .leftJoin(padre, eq(padre.id, eventosReproductivos.padreId))
    .leftJoin(anulador, eq(anulador.id, eventosReproductivos.anuladoPor))
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// El animal, el padre y la anulación, como objetos, en lugar de las columnas sueltas
function evento({
  animalCrotal,
  animalNombre,
  padreId,
  padreCrotal,
  padreNombre,
  anuladoEn,
  anuladoPorNombre,
  motivoAnulacion,
  ...e
}: Fila) {
  return {
    ...e,
    padreId,
    animal: { id: e.animalId, crotal: animalCrotal, nombre: animalNombre },
    padre: padreId ? { id: padreId, crotal: padreCrotal ?? '', nombre: padreNombre } : null,
    anulacion: anuladoEn
      ? { en: anuladoEn.toISOString(), por: anuladoPorNombre ?? '', motivo: motivoAnulacion ?? '' }
      : null,
    creadoEn: e.creadoEn.toISOString(),
    modificadoEn: e.modificadoEn.toISOString(),
  }
}

// Historial reproductivo de un animal, del más reciente al más antiguo y con los anulados: sus
// eventos y los destetes de sus hijos
export async function listarEventos(tx: Transaccion, animalId: string) {
  await verAnimal(tx, animalId)
  const filas = await consulta(tx)
    .where(
      or(
        eq(eventosReproductivos.animalId, animalId),
        and(eq(eventosReproductivos.tipo, 'destete'), eq(animal.madreId, animalId)),
      ),
    )
    .orderBy(desc(eventosReproductivos.fecha), desc(eventosReproductivos.creadoEn))
  return filas.map(evento)
}

async function verEvento(tx: Transaccion, eventoId: string) {
  const [fila] = await consulta(tx).where(eq(eventosReproductivos.id, eventoId))
  if (!fila) throw new ErrorApi(404, 'evento_no_encontrado', 'No existe el evento')
  return evento(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// "de ES041503456789" o "de ES041503456789, ES041503456790"
const deCrotales = (crotales: string[]) => crotales.join(', ')

// Los animales son de la explotación (la Row-Level Security solo deja ver los suyos), hembras si el
// evento es suyo, y la fecha, de su vida en ella. El padre es un macho de la explotación. La base de
// datos lo comprueba también; aquí se hace antes para dar el error en su campo.
async function comprobar(tx: Transaccion, datos: DatosEvento) {
  const encontrados = await tx
    .select({
      id: animales.id,
      crotal: animales.crotal,
      sexo: animales.sexo,
      fechaNacimiento: animales.fechaNacimiento,
      fechaBaja: animales.fechaBaja,
    })
    .from(animales)
    .where(inArray(animales.id, datos.animalIds))
  if (encontrados.length < datos.animalIds.length)
    throw invalido('animalIds', 'Algún animal no está entre los de la explotación')
  const uno = datos.animalIds.length === 1
  if (deHembra(datos.tipo)) {
    const machos = encontrados.filter((a) => a.sexo !== 'hembra').map((a) => a.crotal)
    if (machos.length > 0)
      throw invalido(
        'animalIds',
        uno ? 'Solo las hembras' : `Solo las hembras; no lo son ${deCrotales(machos)}`,
      )
  }
  const antes = encontrados.filter((a) => datos.fecha < a.fechaNacimiento).map((a) => a.crotal)
  if (antes.length > 0)
    throw invalido(
      'fecha',
      uno
        ? 'La fecha no puede ser anterior al nacimiento del animal'
        : `La fecha es anterior al nacimiento de ${deCrotales(antes)}`,
    )
  const despues = encontrados
    .filter((a) => a.fechaBaja && datos.fecha > a.fechaBaja)
    .map((a) => a.crotal)
  if (despues.length > 0)
    throw invalido(
      'fecha',
      uno
        ? 'La fecha no puede ser posterior a la baja del animal'
        : `La fecha es posterior a la baja de ${deCrotales(despues)}`,
    )
  if (conPadre(datos.tipo) && datos.padreId) {
    const [p] = await tx
      .select({ sexo: animales.sexo })
      .from(animales)
      .where(eq(animales.id, datos.padreId))
    if (p?.sexo !== 'macho')
      throw invalido('padreId', 'El padre tiene que ser un macho de la explotación')
  }
  if (datos.tipo === 'destete') {
    const destetados = await tx
      .select({ crotal: animales.crotal })
      .from(eventosReproductivos)
      .innerJoin(animales, eq(animales.id, eventosReproductivos.animalId))
      .where(
        and(
          inArray(eventosReproductivos.animalId, datos.animalIds),
          eq(eventosReproductivos.tipo, 'destete'),
          isNull(eventosReproductivos.anuladoEn),
        ),
      )
    if (destetados.length > 0)
      throw invalido(
        'animalIds',
        uno
          ? 'El animal ya está destetado'
          : `Ya están destetados ${deCrotales(destetados.map((d) => d.crotal))}`,
      )
    if (datos.pesoDestete != null) {
      const [pesada] = await tx
        .select({ id: pesos.id })
        .from(pesos)
        .where(and(inArray(pesos.animalId, datos.animalIds), eq(pesos.momento, 'destete')))
      if (pesada) throw invalido('pesoDestete', 'El animal ya tiene una pesada al destete')
    }
  }
}

// Registra el mismo evento a uno o varios animales: uno por animal. Un destete con peso guarda
// también la pesada al destete.
export async function crearEventos(tx: Transaccion, datos: DatosEvento) {
  await comprobar(tx, datos)
  const { animalIds, tipo, fecha } = datos
  const creados = await tx
    .insert(eventosReproductivos)
    .values(
      animalIds.map((animalId) => ({
        animalId,
        tipo,
        fecha,
        padreId: conPadre(tipo) ? (datos.padreId ?? null) : null,
        padreTexto: conPadre(tipo) ? (datos.padreTexto ?? null) : null,
        metodo: tipo === 'diagnostico' ? (datos.metodo ?? null) : null,
        resultado: tipo === 'diagnostico' ? (datos.resultado ?? null) : null,
        observaciones: datos.observaciones ?? null,
      })),
    )
    .returning({ id: eventosReproductivos.id })
  const [ternero] = animalIds
  if (tipo === 'destete' && datos.pesoDestete != null && ternero)
    await tx
      .insert(pesos)
      .values({ animalId: ternero, fecha, kg: datos.pesoDestete, momento: 'destete' })
  const filas = await consulta(tx).where(
    inArray(
      eventosReproductivos.id,
      creados.map((c) => c.id),
    ),
  )
  return filas.map(evento)
}

export async function anularEvento(
  tx: Transaccion,
  eventoId: string,
  { motivo }: z.output<typeof DatosAnulacionEvento>,
) {
  const actual = await verEvento(tx, eventoId)
  if (actual.anulacion) throw new ErrorApi(409, 'ya_anulado', 'El evento ya está anulado')
  await tx
    .update(eventosReproductivos)
    .set({ anuladoEn: sql`now()`, anuladoPor: sql`usuario_actual()`, motivoAnulacion: motivo })
    .where(and(eq(eventosReproductivos.id, eventoId), isNull(eventosReproductivos.anuladoEn)))
  return verEvento(tx, eventoId)
}
