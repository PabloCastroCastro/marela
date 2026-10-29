import { z } from '@hono/zod-openapi'
import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import { fincas, HECTAREAS_MAXIMO, parcelas, REGIMENES_FINCA } from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'

// Fincas de una explotación y sus parcelas (GH-25). Como en animales.ts, todas las funciones reciben
// la transacción de enLaExplotacion.

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

// Una parte de la referencia SIGPAC: números, sin ceros a la izquierda que confundan ("012" → "12")
const parteSigpac = z
  .string()
  .trim()
  .transform((t) => t.replace(/^0+(?=\d)/, '') || null)
  .pipe(
    z
      .string()
      .regex(/^\d{1,5}$/, 'Solo números')
      .nullable(),
  )
  .nullish()

// "36:24:0:0:71:9000:224": provincia, municipio, agregado, zona, polígono, parcela y recinto, como la
// escribe el SIGPAC. Sin agregado ni zona, 0.
type PartesSigpac = Partial<
  Record<
    'provincia' | 'municipio' | 'agregado' | 'zona' | 'poligono' | 'parcela' | 'recinto',
    string | null
  >
>
export const referenciaSigpac = (p: PartesSigpac) =>
  [
    p.provincia,
    p.municipio,
    p.agregado ?? '0',
    p.zona ?? '0',
    p.poligono,
    p.parcela,
    p.recinto,
  ].join(':')

// Contorno de una parcela en GeoJSON, en longitud y latitud (GH-52). Los límites solo descartan
// datos absurdos: un recinto SIGPAC no pasa de unos miles de vértices.
const anillo = z.array(z.array(z.number()).min(2).max(3)).min(4).max(20_000)
export const Contorno = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('Polygon'), coordinates: z.array(anillo).min(1).max(100) }),
    z.object({
      type: z.literal('MultiPolygon'),
      coordinates: z.array(z.array(anillo).min(1).max(100)).min(1).max(100),
    }),
  ])
  .openapi('Contorno')

const DatosParcela = z
  .object({
    // Con id, una parcela que ya existe; sin él, una nueva
    id: z.uuid().optional(),
    provincia: parteSigpac,
    municipio: parteSigpac,
    // Casi siempre 0: si faltan con el resto de la referencia, se ponen a 0
    agregado: parteSigpac,
    zona: parteSigpac,
    poligono: parteSigpac,
    parcela: parteSigpac,
    recinto: parteSigpac,
    referenciaCatastral: z
      .string()
      .transform((t) => t.replace(/\s+/g, '').toUpperCase() || null)
      .nullish()
      .openapi({ example: '36038A012000450000XY' }),
    superficie: z
      .number('Indica la superficie en hectáreas')
      .positive('La superficie tiene que ser mayor que 0')
      .max(HECTAREAS_MAXIMO, `Como mucho ${HECTAREAS_MAXIMO} ha`)
      .transform((ha) => Math.round(ha * 10_000) / 10_000)
      .openapi({ example: 1.2345 }),
    // Uso SIGPAC ("PS", "TA"...) y contorno, del mapa o de la consulta por referencia (GH-52)
    uso: z.string().trim().max(4).nullish(),
    contorno: Contorno.nullish(),
  })
  .superRefine((p, ctx) => {
    const sigpac = [p.provincia, p.municipio, p.poligono, p.parcela, p.recinto]
    const puestas = sigpac.filter((s) => s != null).length
    if (puestas > 0 && puestas < 5)
      ctx.addIssue({
        code: 'custom',
        path: ['recinto'],
        message: 'La referencia SIGPAC lleva provincia, municipio, polígono, parcela y recinto',
      })
    if (puestas === 0 && !p.referenciaCatastral)
      ctx.addIssue({
        code: 'custom',
        path: ['referenciaCatastral'],
        message: 'Indica la referencia SIGPAC o la catastral',
      })
  })

export const DatosFinca = z
  .object({
    nombre: z
      .string('Indica el nombre')
      .trim()
      .min(1, 'Indica el nombre')
      .openapi({ example: 'Agra de abaixo' }),
    municipio: textoOpcional.openapi({ example: 'Lalín' }),
    provincia: textoOpcional.openapi({ example: 'Pontevedra' }),
    regimen: z.enum(REGIMENES_FINCA).default('propiedad'),
    observaciones: textoOpcional,
    parcelas: z.array(DatosParcela).min(1, 'Indica al menos una parcela').max(200),
  })
  .superRefine((f, ctx) => {
    // El mismo recinto SIGPAC, una sola vez
    const vistos = new Set<string>()
    f.parcelas.forEach((p, i) => {
      if (!p.recinto) return
      const clave = referenciaSigpac(p)
      if (vistos.has(clave))
        ctx.addIssue({
          code: 'custom',
          path: ['parcelas', i, 'recinto'],
          message: 'Este recinto ya está en otra parcela de la finca',
        })
      vistos.add(clave)
    })
  })
  .openapi('DatosFinca')

export type DatosFinca = z.output<typeof DatosFinca>

export const CambioEstadoFinca = z.object({ activa: z.boolean() }).openapi('CambioEstadoFinca')

// Superficie y número de parcelas de cada finca
const totales = {
  superficie: sql<number>`coalesce((select sum(p.superficie) from parcelas p
    where p.finca_id = "fincas"."id"), 0)::float8`,
  numeroParcelas: sql<number>`(select count(*) from parcelas p
    where p.finca_id = "fincas"."id")::int`,
}

const columnas = {
  id: fincas.id,
  nombre: fincas.nombre,
  municipio: fincas.municipio,
  provincia: fincas.provincia,
  regimen: fincas.regimen,
  observaciones: fincas.observaciones,
  activa: fincas.activa,
  creadoEn: fincas.creadoEn,
  modificadoEn: fincas.modificadoEn,
  ...totales,
}

// Fin del plazo de seguridad en curso: el más lejano de sus tratamientos fitosanitarios sin anular,
// si aún no ha llegado (GH-27). Hasta ese día no se cosecha ni se pasta.
const finSeguridad = (hoy: string) =>
  sql<string | null>`(select max(a.fin_seguridad)::text from aplicaciones a
    where a.finca_id = "fincas"."id" and a.anulado_en is null and a.fin_seguridad > ${hoy})`

// Pastoreo en curso: desde cuándo y cuántos animales, o null (GH-28)
type PastoreoEnCurso = { id: string; desde: string; animales: number }
const pastoreo = sql<PastoreoEnCurso | null>`(select json_build_object('id', p.id,
    'desde', p.fecha_entrada, 'animales', p.animales)
  from pastoreos p where p.finca_id = "fincas"."id" and p.fecha_salida is null)`

const consulta = (tx: Transaccion) =>
  tx.select({ ...columnas, finSeguridad: finSeguridad(hoyEnMadrid()), pastoreo }).from(fincas)

const finca = <T extends { creadoEn: Date; modificadoEn: Date }>(f: T) => ({
  ...f,
  creadoEn: f.creadoEn.toISOString(),
  modificadoEn: f.modificadoEn.toISOString(),
})

export type FiltrosFincas = {
  q?: string
  activa?: boolean
  seguridad?: 'en_curso'
  pastoreo?: 'en_curso'
}

export async function listarFincas(tx: Transaccion, filtros: FiltrosFincas) {
  const condiciones: (SQL | undefined)[] = []
  const q = filtros.q?.trim()
  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`
    condiciones.push(or(ilike(fincas.nombre, patron), ilike(fincas.municipio, patron)))
  }
  if (filtros.activa !== undefined) condiciones.push(eq(fincas.activa, filtros.activa))
  if (filtros.seguridad === 'en_curso')
    condiciones.push(sql`${finSeguridad(hoyEnMadrid())} is not null`)
  if (filtros.pastoreo === 'en_curso') condiciones.push(sql`${pastoreo} is not null`)
  const filas = await consulta(tx)
    .where(and(...condiciones))
    .orderBy(asc(sql`lower(${fincas.nombre})`))
  return filas.map(finca)
}

// Ficha completa: la finca y sus parcelas
export async function verFinca(tx: Transaccion, fincaId: string) {
  const [fila] = await consulta(tx).where(eq(fincas.id, fincaId))
  if (!fila)
    throw new ErrorApi(404, 'finca_no_encontrada', 'No existe la finca en esta explotación')
  const suyas = await tx
    .select({
      id: parcelas.id,
      provincia: parcelas.provincia,
      municipio: parcelas.municipio,
      agregado: parcelas.agregado,
      zona: parcelas.zona,
      poligono: parcelas.poligono,
      parcela: parcelas.parcela,
      recinto: parcelas.recinto,
      referenciaCatastral: parcelas.referenciaCatastral,
      superficie: parcelas.superficie,
      uso: parcelas.uso,
      contorno: parcelas.contorno,
    })
    .from(parcelas)
    .where(eq(parcelas.fincaId, fincaId))
    .orderBy(asc(parcelas.creadoEn))
  return { ...finca(fila), parcelas: suyas }
}

// Traduce los errores de la base de datos que puede provocar el usuario
async function conErroresClaros<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
    if (causa?.code === '23505' && causa.constraint === 'fincas_nombre_unico') {
      const mensaje = 'Ya hay una finca con este nombre'
      throw new ErrorApi(409, 'nombre_en_uso', mensaje, [{ campo: 'nombre', mensaje }])
    }
    if (causa?.code === '23505' && causa.constraint === 'parcelas_sigpac_unico') {
      const mensaje = 'Este recinto SIGPAC ya está en otra finca de la explotación'
      throw new ErrorApi(409, 'recinto_en_uso', mensaje)
    }
    throw error
  }
}

// Un recinto SIGPAC, en una sola finca de la explotación. La base de datos lo comprueba también;
// aquí se hace antes para dar el error en la parcela que es.
async function comprobarRecintos(tx: Transaccion, datos: DatosFinca, fincaId?: string) {
  const clave = referenciaSigpac
  const enOtras = await tx
    .select({
      provincia: parcelas.provincia,
      municipio: parcelas.municipio,
      agregado: parcelas.agregado,
      zona: parcelas.zona,
      poligono: parcelas.poligono,
      parcela: parcelas.parcela,
      recinto: parcelas.recinto,
      finca: fincas.nombre,
    })
    .from(parcelas)
    .innerJoin(fincas, eq(fincas.id, parcelas.fincaId))
    .where(and(isNotNull(parcelas.recinto), fincaId ? ne(parcelas.fincaId, fincaId) : undefined))
  const ocupados = new Map(enOtras.map((o) => [clave(o), o.finca]))
  const i = datos.parcelas.findIndex((p) => p.recinto && ocupados.has(clave(p)))
  const repetida = datos.parcelas[i]
  if (repetida) {
    const mensaje = `Este recinto SIGPAC ya está en la finca ${ocupados.get(clave(repetida))}`
    throw new ErrorApi(409, 'recinto_en_uso', mensaje, [
      { campo: `parcelas.${i}.recinto`, mensaje },
    ])
  }
}

const valoresParcela = (p: DatosFinca['parcelas'][number]) => ({
  provincia: p.provincia ?? null,
  municipio: p.municipio ?? null,
  agregado: p.recinto ? (p.agregado ?? '0') : null,
  zona: p.recinto ? (p.zona ?? '0') : null,
  poligono: p.poligono ?? null,
  parcela: p.parcela ?? null,
  recinto: p.recinto ?? null,
  referenciaCatastral: p.referenciaCatastral ?? null,
  uso: p.uso || null,
  contorno: p.contorno ?? null,
  superficie: p.superficie,
})

const valoresFinca = (d: DatosFinca) => ({
  nombre: d.nombre,
  municipio: d.municipio ?? null,
  provincia: d.provincia ?? null,
  regimen: d.regimen,
  observaciones: d.observaciones ?? null,
})

export async function crearFinca(tx: Transaccion, datos: DatosFinca) {
  await comprobarRecintos(tx, datos)
  const [creada] = await conErroresClaros(() =>
    tx.insert(fincas).values(valoresFinca(datos)).returning({ id: fincas.id }),
  )
  if (!creada) throw new Error('No se pudo crear la finca')
  await conErroresClaros(() =>
    tx
      .insert(parcelas)
      .values(datos.parcelas.map((p) => ({ fincaId: creada.id, ...valoresParcela(p) }))),
  )
  return verFinca(tx, creada.id)
}

// Cambia los datos y las parcelas: las que llegan con id se corrigen, las nuevas se añaden y las que
// faltan se quitan. Todo queda en el historial de cambios.
export async function editarFinca(tx: Transaccion, fincaId: string, datos: DatosFinca) {
  const actual = await verFinca(tx, fincaId)
  const suyas = new Set(actual.parcelas.map((p) => p.id))
  const ajena = datos.parcelas.findIndex((p) => p.id && !suyas.has(p.id))
  if (ajena >= 0) {
    const mensaje = 'Esta parcela no es de la finca'
    throw new ErrorApi(400, 'validacion', mensaje, [{ campo: `parcelas.${ajena}.id`, mensaje }])
  }
  await comprobarRecintos(tx, datos, fincaId)
  await conErroresClaros(async () => {
    await tx.update(fincas).set(valoresFinca(datos)).where(eq(fincas.id, fincaId))
    const seguir = datos.parcelas.flatMap((p) => (p.id ? [p.id] : []))
    // Primero se quitan las que faltan, para que un recinto pueda pasar de una parcela a otra
    await tx
      .delete(parcelas)
      .where(
        seguir.length
          ? and(eq(parcelas.fincaId, fincaId), notInArray(parcelas.id, seguir))
          : eq(parcelas.fincaId, fincaId),
      )
    for (const p of datos.parcelas.filter((x) => x.id)) {
      await tx
        .update(parcelas)
        .set(valoresParcela(p))
        .where(and(eq(parcelas.id, p.id ?? ''), inArray(parcelas.id, seguir)))
    }
    const nuevas = datos.parcelas.filter((p) => !p.id)
    if (nuevas.length)
      await tx.insert(parcelas).values(nuevas.map((p) => ({ fincaId, ...valoresParcela(p) })))
  })
  return verFinca(tx, fincaId)
}

// Desactivar una finca la quita de las listas habituales; sus datos y su historial se conservan
export async function cambiarEstadoFinca(tx: Transaccion, fincaId: string, activa: boolean) {
  await verFinca(tx, fincaId)
  await tx.update(fincas).set({ activa }).where(eq(fincas.id, fincaId))
  return verFinca(tx, fincaId)
}

// Contornos de las parcelas de todas las fincas, para el mapa de la explotación (GH-91). Las que se
// registraron a mano no tienen.
export async function contornosFincas(tx: Transaccion) {
  const filas = await tx
    .select({ fincaId: parcelas.fincaId, parcelaId: parcelas.id, contorno: parcelas.contorno })
    .from(parcelas)
    .where(isNotNull(parcelas.contorno))
    .orderBy(asc(parcelas.creadoEn))
  return filas.flatMap((f) => (f.contorno ? [{ ...f, contorno: f.contorno }] : []))
}
