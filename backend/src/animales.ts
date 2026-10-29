import { z } from '@hono/zod-openapi'
import { and, asc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Transaccion } from './db/explotacion.js'
import {
  animales,
  ESTADO_POR_BAJA,
  type ESTADOS_ANIMAL,
  FORMATO_CROTAL,
  ORIGENES,
  SEXOS,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'

// Fichas de los animales de una explotación (GH-14). Todas las funciones reciben la transacción de
// enLaExplotacion: la Row-Level Security limita los datos a la explotación de la petición.

// Razas de carne habituales en España, para sugerirlas; se admite cualquier otra
export const RAZAS_HABITUALES = [
  'Rubia Gallega',
  'Asturiana de los Valles',
  'Asturiana de la Montaña',
  'Limusina',
  'Charolesa',
  'Pirenaica',
  'Avileña-Negra Ibérica',
  'Retinta',
  'Morucha',
  'Parda de Montaña',
  'Blonda de Aquitania',
  'Fleckvieh',
  'Angus',
  'Cruzada',
]

const fecha = z.iso.date('Fecha no válida (aaaa-mm-dd)')
const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

const CamposAnimal = z.object({
  // Opcional: un ternero puede darse de alta antes de crotalarlo (GH-23)
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
    .openapi({ example: 'ES041503456789' }),
  nombre: textoOpcional.openapi({ example: 'Marela' }),
  raza: z.string().trim().min(1, 'La raza es obligatoria').openapi({ example: 'Rubia Gallega' }),
  sexo: z.enum(SEXOS),
  fechaNacimiento: fecha,
  madreId: z.uuid().nullish(),
  madreTexto: textoOpcional,
  padreId: z.uuid().nullish(),
  padreTexto: textoOpcional,
  origen: z.enum(ORIGENES).default('nacido'),
  fechaEntrada: fecha.nullish(),
  regaOrigen: z
    .string()
    .trim()
    .toUpperCase()
    .transform((t) => t || null)
    .nullish(),
  observaciones: textoOpcional,
})

export const DatosAnimal = CamposAnimal.superRefine((a, ctx) => {
  const fallo = (campo: string, mensaje: string) =>
    ctx.addIssue({ code: 'custom', path: [campo], message: mensaje })
  const hoy = hoyEnMadrid()
  if (a.fechaNacimiento > hoy)
    fallo('fechaNacimiento', 'La fecha de nacimiento no puede ser futura')
  if (a.madreId && a.madreTexto)
    fallo('madreTexto', 'Indica la madre de la explotación o un texto, no los dos')
  if (a.padreId && a.padreTexto)
    fallo('padreTexto', 'Indica el padre de la explotación o un texto, no los dos')
  if (a.origen === 'comprado') {
    if (!a.fechaEntrada) fallo('fechaEntrada', 'Indica la fecha de entrada en la explotación')
    else if (a.fechaEntrada > hoy) fallo('fechaEntrada', 'La fecha de entrada no puede ser futura')
    else if (a.fechaEntrada < a.fechaNacimiento)
      fallo('fechaEntrada', 'La fecha de entrada no puede ser anterior al nacimiento')
    if (!a.regaOrigen || !/^ES\d{12}$/.test(a.regaOrigen))
      fallo('regaOrigen', 'El REGA de origen son las letras ES y 12 dígitos')
  }
}).openapi('DatosAnimal')

export type DatosAnimal = z.output<typeof DatosAnimal>

// Lo que se puede cambiar al editar: los datos de la ficha. El estado y la baja tienen su propio
// flujo (GH-18).
export const CambioAnimal = CamposAnimal.partial().openapi('CambioAnimal')

const madre = alias(animales, 'madre')
const padre = alias(animales, 'padre')

const columnas = {
  id: animales.id,
  crotal: animales.crotal,
  nombre: animales.nombre,
  raza: animales.raza,
  sexo: animales.sexo,
  fechaNacimiento: animales.fechaNacimiento,
  madreId: animales.madreId,
  madreTexto: animales.madreTexto,
  madreCrotal: madre.crotal,
  madreNombre: madre.nombre,
  padreId: animales.padreId,
  padreTexto: animales.padreTexto,
  padreCrotal: padre.crotal,
  padreNombre: padre.nombre,
  origen: animales.origen,
  fechaEntrada: animales.fechaEntrada,
  regaOrigen: animales.regaOrigen,
  estado: animales.estado,
  fechaBaja: animales.fechaBaja,
  tipoBaja: animales.tipoBaja,
  causaBaja: animales.causaBaja,
  observaciones: animales.observaciones,
  partoId: animales.partoId,
  noAptaReposicionDesde: animales.noAptaReposicionDesde,
  motivoNoAptaReposicion: animales.motivoNoAptaReposicion,
  madreNoAptaDesde: madre.noAptaReposicionDesde,
  madreMotivoNoApta: madre.motivoNoAptaReposicion,
  creadoEn: animales.creadoEn,
  modificadoEn: animales.modificadoEn,
}

// Fin de la supresión en curso: el más lejano de sus tratamientos sin anular, si aún no ha llegado
// (GH-20)
const finSupresion = (hoy: string) =>
  sql<string | null>`(select max(t.fin_supresion)::text from tratamientos t
    where t.animal_id = ${animales.id} and t.anulado_en is null and t.fin_supresion > ${hoy})`

// Gestación en curso (GH-22): la de la función gestacion() de la migración 0013, o null
type Gestacion = { desde: string | null; fechaPrevistaParto: string | null; confirmada: boolean }
const gestacion = sql<Gestacion | null>`(select json_build_object('desde', g.desde,
    'fechaPrevistaParto', g.fecha_prevista_parto, 'confirmada', g.confirmada)
  from gestacion(${animales.id}) g)`

function consulta(tx: Transaccion) {
  return tx
    .select({ ...columnas, finSupresion: finSupresion(hoyEnMadrid()), gestacion })
    .from(animales)
    .leftJoin(madre, eq(madre.id, animales.madreId))
    .leftJoin(padre, eq(padre.id, animales.padreId))
}

type Fila = Awaited<ReturnType<typeof consulta>>[number]

// Madre y padre como resumen de su ficha, en lugar de los identificadores sueltos; y la reposición
// (GH-110): si el animal está marcado y si lo está su madre
function ficha({
  madreCrotal,
  madreNombre,
  padreCrotal,
  padreNombre,
  noAptaReposicionDesde,
  motivoNoAptaReposicion,
  madreNoAptaDesde,
  madreMotivoNoApta,
  ...a
}: Fila) {
  return {
    ...a,
    madre: a.madreId ? { id: a.madreId, crotal: madreCrotal, nombre: madreNombre } : null,
    padre: a.padreId ? { id: a.padreId, crotal: padreCrotal, nombre: padreNombre } : null,
    noAptaReposicion: noAptaReposicionDesde
      ? { desde: noAptaReposicionDesde, motivo: motivoNoAptaReposicion ?? '' }
      : null,
    // Solo en las hijas: son las que se dejarían como madres reproductoras
    madreNoAptaReposicion:
      madreNoAptaDesde && a.sexo === 'hembra'
        ? { desde: madreNoAptaDesde, motivo: madreMotivoNoApta ?? '' }
        : null,
    creadoEn: a.creadoEn.toISOString(),
    modificadoEn: a.modificadoEn.toISOString(),
  }
}

export type Ficha = ReturnType<typeof ficha>

export type FiltrosAnimales = {
  q?: string
  estado?: (typeof ESTADOS_ANIMAL)[number]
  sexo?: (typeof SEXOS)[number]
  supresion?: 'en_curso'
  gestacion?: 'en_curso'
  crotal?: 'sin'
  reposicion?: 'no_apta'
}

export async function listarAnimales(tx: Transaccion, filtros: FiltrosAnimales) {
  const condiciones: (SQL | undefined)[] = []
  const q = filtros.q?.trim()
  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    condiciones.push(
      or(
        ilike(animales.crotal, patron.replace(/\s+/g, '')),
        ilike(animales.nombre, patron),
        ilike(animales.raza, patron),
      ),
    )
  }
  if (filtros.estado) condiciones.push(eq(animales.estado, filtros.estado))
  if (filtros.sexo) condiciones.push(eq(animales.sexo, filtros.sexo))
  if (filtros.supresion === 'en_curso')
    condiciones.push(sql`${finSupresion(hoyEnMadrid())} is not null`)
  if (filtros.crotal === 'sin') condiciones.push(isNull(animales.crotal))
  // Las hijas de madres no aptas para reposición (GH-110)
  if (filtros.reposicion === 'no_apta')
    condiciones.push(isNotNull(madre.noAptaReposicionDesde), eq(animales.sexo, 'hembra'))
  if (filtros.gestacion === 'en_curso')
    condiciones.push(sql`exists (select from gestacion(${animales.id}))`)
  const filas = await consulta(tx)
    .where(and(...condiciones))
    // Las gestantes, por la fecha prevista de parto: primero las que antes van a parir
    .orderBy(
      ...(filtros.gestacion === 'en_curso'
        ? [sql`(select g.fecha_prevista_parto from gestacion(${animales.id}) g) nulls last`]
        : []),
      // Los que aún no tienen crotal, al final
      sql`${animales.crotal} nulls last`,
    )
  return filas.map(ficha)
}

// Ficha completa: los datos del animal y sus hijos (de los que es madre o padre)
export async function verAnimal(tx: Transaccion, animalId: string) {
  const [fila] = await consulta(tx).where(eq(animales.id, animalId))
  if (!fila)
    throw new ErrorApi(404, 'animal_no_encontrado', 'No existe el animal en esta explotación')
  const hijos = await tx
    .select({
      id: animales.id,
      crotal: animales.crotal,
      nombre: animales.nombre,
      sexo: animales.sexo,
      fechaNacimiento: animales.fechaNacimiento,
      estado: animales.estado,
    })
    .from(animales)
    .where(or(eq(animales.madreId, animalId), eq(animales.padreId, animalId)))
    .orderBy(asc(animales.fechaNacimiento))
  return { ...ficha(fila), hijos }
}

// Madre y padre: de esta explotación (la Row-Level Security solo deja ver los suyos), del sexo que
// corresponde y distintos del propio animal. La base de datos lo comprueba también; aquí se hace
// antes para dar un error claro en su campo.
async function comprobarProgenitores(tx: Transaccion, datos: DatosAnimal, animalId?: string) {
  for (const [campo, progenitorId, sexo, nombre] of [
    ['madreId', datos.madreId, 'hembra', 'La madre'],
    ['padreId', datos.padreId, 'macho', 'El padre'],
  ] as const) {
    if (!progenitorId) continue
    const invalido = (mensaje: string) =>
      new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])
    if (progenitorId === animalId) throw invalido(`${nombre} no puede ser el propio animal`)
    const [p] = await tx
      .select({ sexo: animales.sexo })
      .from(animales)
      .where(eq(animales.id, progenitorId))
    if (!p) throw invalido(`${nombre} no está entre los animales de la explotación`)
    if (p.sexo !== sexo)
      throw invalido(`${nombre} tiene que ser ${sexo === 'hembra' ? 'una hembra' : 'un macho'}`)
  }
}

const valores = (d: DatosAnimal) => ({
  crotal: d.crotal ?? null,
  nombre: d.nombre ?? null,
  raza: d.raza,
  sexo: d.sexo,
  fechaNacimiento: d.fechaNacimiento,
  madreId: d.madreId ?? null,
  madreTexto: d.madreTexto ?? null,
  padreId: d.padreId ?? null,
  padreTexto: d.padreTexto ?? null,
  origen: d.origen,
  fechaEntrada: d.origen === 'comprado' ? (d.fechaEntrada ?? null) : null,
  regaOrigen: d.origen === 'comprado' ? (d.regaOrigen ?? null) : null,
  observaciones: d.observaciones ?? null,
})

// Traduce los errores de la base de datos que puede provocar el usuario
async function conErroresClaros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string; message?: string } })
      .cause
    if (causa?.code === '23505' && causa.constraint === 'animales_crotal_unique') {
      const mensaje = 'Ya hay un animal con este crotal'
      throw new ErrorApi(409, 'crotal_en_uso', mensaje, [{ campo: 'crotal', mensaje }])
    }
    if (causa?.code === '23514' && causa.constraint === 'animales_sexo_con_hijos') {
      const mensaje = 'No se puede cambiar el sexo de un animal con hijos'
      throw new ErrorApi(409, 'sexo_con_hijos', mensaje, [{ campo: 'sexo', mensaje }])
    }
    throw error
  }
}

export async function crearAnimal(tx: Transaccion, datos: DatosAnimal) {
  await comprobarProgenitores(tx, datos)
  const [creado] = await conErroresClaros(() =>
    tx.insert(animales).values(valores(datos)).returning({ id: animales.id }),
  )
  if (!creado) throw new Error('No se pudo crear el animal')
  return verAnimal(tx, creado.id)
}

export async function editarAnimal(tx: Transaccion, animalId: string, cambios: object) {
  const actual = await verAnimal(tx, animalId)
  // Se valida la ficha completa con los cambios aplicados
  const r = DatosAnimal.safeParse({ ...actual, ...cambios })
  if (!r.success) {
    throw new ErrorApi(
      400,
      'validacion',
      'Los datos enviados no son válidos',
      r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    )
  }
  if (actual.noAptaReposicion && r.data.sexo !== 'hembra') {
    const mensaje = 'Está marcada como no apta para dejar hijas de reposición: quita antes la marca'
    throw new ErrorApi(400, 'validacion', mensaje, [{ campo: 'sexo', mensaje }])
  }
  if (actual.crotal && !r.data.crotal) {
    const mensaje = 'El crotal no se puede quitar'
    throw new ErrorApi(400, 'validacion', mensaje, [{ campo: 'crotal', mensaje }])
  }
  await comprobarProgenitores(tx, r.data, animalId)
  await conErroresClaros(() =>
    tx.update(animales).set(valores(r.data)).where(eq(animales.id, animalId)),
  )
  return verAnimal(tx, animalId)
}

// No dejar hijas para reposición (GH-110): una hembra con una enfermedad que se transmite a la
// descendencia. Sus hijas, las nacidas y las que nazcan, lo muestran. Queda en el historial.
export const DatosReposicion = z
  .object({
    apta: z.boolean(),
    motivo: z
      .string()
      .trim()
      .max(200, 'Como mucho 200 caracteres')
      .nullish()
      .openapi({ example: 'Paratuberculosis' }),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)').nullish(),
  })
  .superRefine((d, ctx) => {
    if (!d.apta && !d.motivo)
      ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'Indica el motivo' })
    if (d.fecha && d.fecha > hoyEnMadrid())
      ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'La fecha no puede ser futura' })
  })
  .openapi('DatosReposicion')

export async function cambiarReposicion(
  tx: Transaccion,
  animalId: string,
  datos: z.output<typeof DatosReposicion>,
) {
  const animal = await verAnimal(tx, animalId)
  if (!datos.apta && animal.sexo !== 'hembra') {
    const mensaje = 'Solo se marca en las hembras: es para no dejar sus hijas de reposición'
    throw new ErrorApi(400, 'validacion', mensaje, [{ campo: 'apta', mensaje }])
  }
  await tx
    .update(animales)
    .set(
      datos.apta
        ? { noAptaReposicionDesde: null, motivoNoAptaReposicion: null }
        : {
            noAptaReposicionDesde: datos.fecha ?? hoyEnMadrid(),
            motivoNoAptaReposicion: datos.motivo ?? null,
          },
    )
    .where(eq(animales.id, animalId))
  return verAnimal(tx, animalId)
}

// Bajas que se registran desde la ficha. La venta llega desde Finanzas (GH-38).
export const TIPOS_BAJA_FICHA = ['muerte', 'sacrificio', 'robo_extravio', 'otra'] as const

export const DatosBaja = z
  .object({
    tipo: z.enum(TIPOS_BAJA_FICHA),
    fecha,
    causa: textoOpcional.openapi({ description: 'Detalle; obligatorio si el tipo es "otra"' }),
  })
  .superRefine((b, ctx) => {
    if (b.fecha > hoyEnMadrid())
      ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'La fecha no puede ser futura' })
    if (b.tipo === 'otra' && !b.causa)
      ctx.addIssue({ code: 'custom', path: ['causa'], message: 'Explica la causa de la baja' })
  })
  .openapi('DatosBaja')

export type DatosBaja = z.output<typeof DatosBaja>

export async function darDeBaja(tx: Transaccion, animalId: string, baja: DatosBaja) {
  const actual = await verAnimal(tx, animalId)
  if (actual.estado !== 'activo') {
    throw new ErrorApi(409, 'ya_de_baja', 'El animal ya está dado de baja')
  }
  const desde = actual.fechaEntrada ?? actual.fechaNacimiento
  if (baja.fecha < desde) {
    const mensaje = `La fecha no puede ser anterior a la ${actual.fechaEntrada ? 'entrada' : 'fecha de nacimiento'}`
    throw new ErrorApi(400, 'validacion', mensaje, [{ campo: 'fecha', mensaje }])
  }
  await tx
    .update(animales)
    .set({
      estado: ESTADO_POR_BAJA[baja.tipo],
      tipoBaja: baja.tipo,
      fechaBaja: baja.fecha,
      causaBaja: baja.causa ?? null,
    })
    .where(eq(animales.id, animalId))
  return verAnimal(tx, animalId)
}

// Deshace una baja registrada por error: el animal vuelve a estar activo. La baja queda en el
// historial de cambios. Una venta se deshace desde Finanzas, junto con la venta.
export async function deshacerBaja(tx: Transaccion, animalId: string) {
  const actual = await verAnimal(tx, animalId)
  if (actual.estado === 'activo') {
    throw new ErrorApi(409, 'no_de_baja', 'El animal no está dado de baja')
  }
  if (actual.tipoBaja === 'venta') {
    throw new ErrorApi(409, 'baja_por_venta', 'Una venta se deshace desde Finanzas, con la venta')
  }
  await tx
    .update(animales)
    .set({ estado: 'activo', tipoBaja: null, fechaBaja: null, causaBaja: null })
    .where(eq(animales.id, animalId))
  return verAnimal(tx, animalId)
}

// Razas para sugerir: las habituales y las que ya se usan en la explotación
export async function razas(tx: Transaccion) {
  const usadas = await tx.selectDistinct({ raza: animales.raza }).from(animales)
  return [...new Set([...RAZAS_HABITUALES, ...usadas.map((r) => r.raza)])].sort((a, b) =>
    a.localeCompare(b, 'es'),
  )
}
