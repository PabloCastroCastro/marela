import { z } from '@hono/zod-openapi'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Transaccion } from './db/explotacion.js'
import {
  aplicaciones,
  DIAS_SEGURIDAD_MAXIMO,
  fincas,
  HECTAREAS_MAXIMO,
  member,
  parcelas,
  TIPOS_ABONO,
  TIPOS_APLICACION,
  UNIDADES_DOSIS,
  user,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'
import { verFinca } from './fincas.js'
import { comprobarIds, IdsCliente, reenvio, sinChoqueDeId } from './idCliente.js'
import type { DatosAnulacion } from './tratamientos.js'

// Abonados y tratamientos fitosanitarios de las fincas (GH-27). Como en labores.ts, todas las
// funciones reciben la transacción de enLaExplotacion. Como los tratamientos de los animales, no se
// corrigen ni se borran: se anulan con un motivo.

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

// Registrar: el mismo abonado o tratamiento en una o varias fincas, uno por finca
export const DatosAplicacion = z
  .object({
    fincaIds: z
      .array(z.uuid())
      .min(1, 'Elige al menos una finca')
      .max(200)
      .transform((ids) => [...new Set(ids)]),
    // Sin conexión (GH-32): los del dispositivo
    ids: IdsCliente,
    tipo: z.enum(TIPOS_APLICACION, 'Indica si es abono o fitosanitario'),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    producto: z
      .string('Indica el producto')
      .trim()
      .min(1, 'Indica el producto')
      .openapi({ example: 'Purín de vacuno' }),
    tipoAbono: z.enum(TIPOS_ABONO).nullish(),
    dosis: z
      .number('Indica la dosis por hectárea')
      .positive('La dosis tiene que ser mayor que 0')
      .transform((n) => Math.round(n * 1000) / 1000),
    unidadDosis: z.enum(UNIDADES_DOSIS, 'Indica la unidad de la dosis'),
    // Sin ella, la de la finca entera
    superficie: z
      .number('Indica la superficie en hectáreas')
      .positive('La superficie tiene que ser mayor que 0')
      .max(HECTAREAS_MAXIMO, `Como mucho ${HECTAREAS_MAXIMO} ha`)
      .transform((ha) => Math.round(ha * 10_000) / 10_000)
      .nullish(),
    aplicadoPorId: z.uuid().nullish(),
    aplicadoPorTexto: textoOpcional.openapi({ example: 'Cooperativa do Deza' }),
    lote: textoOpcional,
    plaga: textoOpcional.openapi({ example: 'Romaza' }),
    diasSeguridad: z
      .number('Indica el plazo de seguridad en días (0 si no tiene)')
      .int('El plazo de seguridad es un número entero de días')
      .min(0, 'El plazo de seguridad no puede ser negativo')
      .max(DIAS_SEGURIDAD_MAXIMO, `Como mucho ${DIAS_SEGURIDAD_MAXIMO} días`)
      .nullish(),
    ropo: textoOpcional.openapi({ example: '3600012345678' }),
    equipo: textoOpcional.openapi({ example: 'Pulverizador suspendido 800 l' }),
    observaciones: textoOpcional,
  })
  .superRefine((a, ctx) => {
    const fallo = (campo: string, mensaje: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message: mensaje })
    if (a.fecha > hoyEnMadrid()) fallo('fecha', 'La fecha no puede ser futura')
    if (a.tipo === 'abono' && !a.tipoAbono) fallo('tipoAbono', 'Indica si es mineral u orgánico')
    if (a.tipo === 'fitosanitario') {
      if (!a.plaga) fallo('plaga', 'Indica la plaga o el motivo')
      if (a.diasSeguridad == null)
        fallo('diasSeguridad', 'Indica el plazo de seguridad en días (0 si no tiene)')
    }
    if (a.aplicadoPorId && a.aplicadoPorTexto)
      fallo('aplicadoPorTexto', 'Indica una persona del equipo o un nombre, no los dos')
    if (a.superficie != null && a.fincaIds.length > 1)
      fallo('superficie', 'En varias fincas a la vez, cada una con su superficie entera')
    comprobarIds(a.ids, a.fincaIds, ctx)
  })
  .openapi('DatosAplicacion')

export type DatosAplicacion = z.output<typeof DatosAplicacion>

const aplicador = alias(user, 'aplicador')
const anulador = alias(user, 'anulador')

const columnas = {
  id: aplicaciones.id,
  fincaId: aplicaciones.fincaId,
  tipo: aplicaciones.tipo,
  fecha: aplicaciones.fecha,
  producto: aplicaciones.producto,
  tipoAbono: aplicaciones.tipoAbono,
  dosis: aplicaciones.dosis,
  unidadDosis: aplicaciones.unidadDosis,
  superficie: aplicaciones.superficie,
  aplicadoPorId: aplicaciones.aplicadoPorId,
  aplicadoPorNombre: aplicador.name,
  aplicadoPorTexto: aplicaciones.aplicadoPorTexto,
  lote: aplicaciones.lote,
  plaga: aplicaciones.plaga,
  diasSeguridad: aplicaciones.diasSeguridad,
  finSeguridad: aplicaciones.finSeguridad,
  ropo: aplicaciones.ropo,
  equipo: aplicaciones.equipo,
  observaciones: aplicaciones.observaciones,
  anuladoEn: aplicaciones.anuladoEn,
  anuladoPorNombre: anulador.name,
  motivoAnulacion: aplicaciones.motivoAnulacion,
  creadoEn: aplicaciones.creadoEn,
  modificadoEn: aplicaciones.modificadoEn,
}

function consulta(tx: Transaccion) {
  return tx
    .select(columnas)
    .from(aplicaciones)
    .leftJoin(aplicador, eq(aplicador.id, aplicaciones.aplicadoPorId))
    .leftJoin(anulador, eq(anulador.id, aplicaciones.anuladoPor))
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// Quién lo aplicó y la anulación, como objetos, en lugar de las columnas sueltas
function aplicacion({
  aplicadoPorId,
  aplicadoPorNombre,
  aplicadoPorTexto,
  anuladoEn,
  anuladoPorNombre,
  motivoAnulacion,
  ...a
}: Fila) {
  return {
    ...a,
    aplicadoPor: aplicadoPorId
      ? { id: aplicadoPorId, nombre: aplicadoPorNombre ?? '' }
      : aplicadoPorTexto
        ? { id: null, nombre: aplicadoPorTexto }
        : null,
    anulacion: anuladoEn
      ? { en: anuladoEn.toISOString(), por: anuladoPorNombre ?? '', motivo: motivoAnulacion ?? '' }
      : null,
    creadoEn: a.creadoEn.toISOString(),
    modificadoEn: a.modificadoEn.toISOString(),
  }
}

// Los de una finca, del más reciente al más antiguo, también los anulados
export async function listarAplicaciones(tx: Transaccion, fincaId: string) {
  await verFinca(tx, fincaId)
  const filas = await consulta(tx)
    .where(eq(aplicaciones.fincaId, fincaId))
    .orderBy(desc(aplicaciones.fecha), desc(aplicaciones.creadoEn))
  return filas.map(aplicacion)
}

async function verAplicacion(tx: Transaccion, aplicacionId: string) {
  const [fila] = await consulta(tx).where(eq(aplicaciones.id, aplicacionId))
  if (!fila)
    throw new ErrorApi(404, 'aplicacion_no_encontrada', 'No existe el abonado o tratamiento')
  return aplicacion(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// Registra el mismo abonado o tratamiento en una o varias fincas activas: uno por finca, todos o
// ninguno
export async function crearAplicaciones(tx: Transaccion, datos: DatosAplicacion) {
  // Reenviadas desde el dispositivo: las que ya se guardaron
  const ya = await reenvio(datos.ids, (ids) => consulta(tx).where(inArray(aplicaciones.id, ids)))
  if (ya) return ya.map(aplicacion)
  const suyas = new Map(
    (
      await tx
        .select({
          id: fincas.id,
          nombre: fincas.nombre,
          activa: fincas.activa,
          superficie: sql<number>`coalesce(sum(${parcelas.superficie}), 0)::float8`,
        })
        .from(fincas)
        .leftJoin(parcelas, eq(parcelas.fincaId, fincas.id))
        .where(inArray(fincas.id, datos.fincaIds))
        .groupBy(fincas.id)
    ).map((f) => [f.id, f]),
  )
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
  // Quien lo aplica, del equipo. La base de datos lo comprueba también; aquí se hace antes para dar
  // el error en su campo.
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
  const fito = datos.tipo === 'fitosanitario'
  const creadas = await sinChoqueDeId('aplicaciones', () =>
    tx
      .insert(aplicaciones)
      .values(
        datos.fincaIds.map((fincaId, i) => ({
          ...(datos.ids ? { id: datos.ids[i] } : {}),
          fincaId,
          tipo: datos.tipo,
          fecha: datos.fecha,
          producto: datos.producto,
          tipoAbono: fito ? null : (datos.tipoAbono ?? null),
          dosis: datos.dosis,
          unidadDosis: datos.unidadDosis,
          superficie: datos.superficie ?? suyas.get(fincaId)?.superficie ?? 0,
          aplicadoPorId: datos.aplicadoPorId ?? null,
          aplicadoPorTexto: datos.aplicadoPorTexto ?? null,
          lote: datos.lote ?? null,
          plaga: fito ? (datos.plaga ?? null) : null,
          diasSeguridad: fito ? (datos.diasSeguridad ?? 0) : 0,
          ropo: fito ? (datos.ropo ?? null) : null,
          equipo: fito ? (datos.equipo ?? null) : null,
          observaciones: datos.observaciones ?? null,
        })),
      )
      .returning({ id: aplicaciones.id }),
  )
  const filas = await consulta(tx).where(
    inArray(
      aplicaciones.id,
      creadas.map((c) => c.id),
    ),
  )
  return filas.map(aplicacion)
}

export async function anularAplicacion(
  tx: Transaccion,
  aplicacionId: string,
  { motivo }: z.output<typeof DatosAnulacion>,
) {
  const actual = await verAplicacion(tx, aplicacionId)
  if (actual.anulacion) throw new ErrorApi(409, 'ya_anulado', 'Ya está anulado')
  await tx
    .update(aplicaciones)
    .set({
      anuladoEn: sql`now()`,
      anuladoPor: sql`usuario_actual()`,
      motivoAnulacion: motivo,
    })
    .where(and(eq(aplicaciones.id, aplicacionId), isNull(aplicaciones.anuladoEn)))
  return verAplicacion(tx, aplicacionId)
}

// Para el formulario: las personas activas del equipo y los productos, plagas y equipos ya usados
// en la explotación, para sugerirlos
export async function opcionesAplicacion(tx: Transaccion) {
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
    .selectDistinct({
      tipo: aplicaciones.tipo,
      producto: aplicaciones.producto,
      plaga: aplicaciones.plaga,
      equipo: aplicaciones.equipo,
    })
    .from(aplicaciones)
    .where(isNull(aplicaciones.anuladoEn))
  const lista = (xs: (string | null)[]) =>
    [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'es'))
  return {
    personas,
    abonos: lista(usados.filter((u) => u.tipo === 'abono').map((u) => u.producto)),
    fitosanitarios: lista(usados.filter((u) => u.tipo === 'fitosanitario').map((u) => u.producto)),
    plagas: lista(usados.map((u) => u.plaga)),
    equipos: lista(usados.map((u) => u.equipo)),
  }
}
