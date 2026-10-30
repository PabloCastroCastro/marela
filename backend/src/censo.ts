import { z } from '@hono/zod-openapi'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDocumentProxy } from 'unpdf'
import { DatosAnimal, insertarAnimal } from './animales.js'
import type { Transaccion } from './db/explotacion.js'
import { animales, FORMATO_CROTAL, SEXOS } from './db/schema/index.js'
import { ErrorApi } from './errores.js'

// Importación de los animales desde el censo a una fecha en PDF de la Xunta (Consellería do Medio
// Rural) (GH-130). Solo se añaden los animales nuevos: los que ya están en la aplicación no se
// tocan, y los que faltan en el censo solo se señalan.
//
// El PDF tiene texto, pero sacado en orden mezcla etiquetas y valores, y el REGA y los crotales
// tienen el mismo formato. Por eso se reconstruyen las líneas con la posición de cada texto en la
// página, y las celdas de la tabla de animales por la columna cuya cabecera tienen encima.

// Razas del censo (en gallego) con otro nombre en las que sugiere la aplicación. Las demás se
// guardan como vienen.
const RAZAS: Record<string, string> = {
  'Rubia Galega': 'Rubia Gallega',
  'Conxunto Mestizo': 'Cruzada',
}

const SEXO: Record<string, (typeof SEXOS)[number]> = { Femia: 'hembra', Macho: 'macho' }

// Cabeceras de la tabla de animales, en orden
const COLUMNAS = {
  crotal: 'Crotal/NPU',
  sexo: 'Sexo',
  raza: 'Raza',
  nacimiento: 'Nacemento',
  regaNacimiento: 'Expl. Nacem.',
  madre: 'Crotal da nai',
} as const
type Columna = keyof typeof COLUMNAS

export type AnimalCenso = {
  crotal: string
  sexo: (typeof SEXOS)[number]
  raza: string
  fechaNacimiento: string
  regaNacimiento: string | null
  crotalMadre: string | null
}

export type Censo = { rega: string; fecha: string; total: number; animales: AnimalCenso[] }

type Texto = { x: number; ancho: number; s: string }
type Linea = { y: number; textos: Texto[]; texto: string }

const noReconocido = (motivo: string) =>
  new ErrorApi(422, 'censo_no_reconocido', `No se reconoce el censo: ${motivo}`)

// Las líneas de cada página, de arriba abajo, con sus textos de izquierda a derecha
async function lineas(pdf: Uint8Array): Promise<Linea[][]> {
  const documento = await getDocumentProxy(pdf).catch(() => {
    throw noReconocido('el archivo no es un PDF válido')
  })
  const paginas: Linea[][] = []
  for (let n = 1; n <= documento.numPages; n++) {
    const { items } = await (await documento.getPage(n)).getTextContent()
    const porAltura: Linea[] = []
    for (const item of items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = item.transform[5] as number
      const texto = { x: item.transform[4] as number, ancho: item.width, s: item.str.trim() }
      // Los textos de una misma línea pueden estar a alturas que difieren en algún punto
      const linea = porAltura.find((l) => Math.abs(l.y - y) <= 2)
      if (linea) linea.textos.push(texto)
      else porAltura.push({ y, textos: [texto], texto: '' })
    }
    for (const linea of porAltura) {
      linea.textos.sort((a, b) => a.x - b.x)
      linea.texto = linea.textos.map((t) => t.s).join(' ')
    }
    paginas.push(porAltura.sort((a, b) => b.y - a.y))
  }
  await documento.loadingTask.destroy()
  return paginas
}

const centro = (t: Texto) => t.x + t.ancho / 2

// dd/mm/aaaa (o dd/mm/aa) a aaaa-mm-dd, o null si no es una fecha
function fechaIso(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(texto)
  if (!m) return null
  const [, dia, mes, ano] = m
  const iso = `${ano?.length === 2 ? `20${ano}` : ano}-${mes}-${dia}`
  const fecha = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(iso) ? iso : null
}

export async function leerCenso(pdf: Uint8Array): Promise<Censo> {
  const paginas = await lineas(pdf)
  const todas = paginas.flat()

  const rega = todas.map((l) => /\bREGA\s+(ES\d{12})\b/.exec(l.texto)?.[1]).find(Boolean)
  if (!rega) throw noReconocido('no se encuentra el REGA de la explotación')
  // «Censo a 30/10/26», no el título «Censo a unha data»
  const textoFecha = todas
    .map((l) => /\bCenso a\s+(\d{2}\/\d{2}\/\d{2,4})\b/.exec(l.texto)?.[1])
    .find(Boolean)
  const fecha = textoFecha ? fechaIso(textoFecha) : null
  if (!fecha) throw noReconocido('no se encuentra la fecha del censo')
  // TOTAIS y, por cada grupo de edad, número de animales y UGM; los dos últimos, los del total
  const totales = todas.find((l) => /^TOTAIS\b/.test(l.texto))?.textos.map((t) => t.s)
  const total = totales ? Number(totales.at(-2)) : Number.NaN
  if (!Number.isInteger(total)) throw noReconocido('no se encuentra el total de animales')

  const leidos: AnimalCenso[] = []
  const erroneos: string[] = []
  for (const pagina of paginas) {
    // La tabla de animales empieza en su cabecera, en cada página
    const inicio = pagina.findIndex((l) => l.texto.startsWith(COLUMNAS.crotal))
    if (inicio === -1) continue
    const cabecera = pagina[inicio] as Linea
    const centros = Object.entries(COLUMNAS).map(([columna, titulo]) => {
      const texto = cabecera.textos.find((t) => t.s === titulo)
      if (!texto) throw noReconocido(`falta la columna «${titulo}»`)
      return [columna as Columna, centro(texto)] as const
    })
    for (const linea of pagina.slice(inicio + 1)) {
      // Cada texto, en la columna con la cabecera más cercana
      const celdas: Partial<Record<Columna, string>> = {}
      for (const texto of linea.textos) {
        const [columna] = centros.reduce((a, b) =>
          Math.abs(b[1] - centro(texto)) < Math.abs(a[1] - centro(texto)) ? b : a,
        )
        celdas[columna] = celdas[columna] ? `${celdas[columna]} ${texto.s}` : texto.s
      }
      // Las filas de la tabla empiezan por un crotal; lo demás (el resumen por razas) no es de ella
      if (!celdas.crotal || !/^[A-Z]{2}\d+$/.test(celdas.crotal)) continue
      const sexo = SEXO[celdas.sexo ?? '']
      const fechaNacimiento = fechaIso(celdas.nacimiento ?? '')
      const madre = celdas.madre ?? null
      if (
        !FORMATO_CROTAL.test(celdas.crotal) ||
        !sexo ||
        !celdas.raza ||
        !fechaNacimiento ||
        (madre && !FORMATO_CROTAL.test(madre))
      ) {
        erroneos.push(celdas.crotal)
        continue
      }
      leidos.push({
        crotal: celdas.crotal,
        sexo,
        raza: RAZAS[celdas.raza] ?? celdas.raza,
        fechaNacimiento,
        regaNacimiento: celdas.regaNacimiento ?? null,
        crotalMadre: madre,
      })
    }
  }
  if (erroneos.length > 0) {
    throw noReconocido(`no se entienden los datos de ${erroneos.join(', ')}`)
  }
  if (leidos.length === 0) throw noReconocido('no se encuentra la tabla de animales')
  return { rega, fecha, total, animales: leidos }
}

// Lo que se hará al importar: se calcula igual para la vista previa y para la importación

export const DIFERENCIAS = ['sexo', 'raza', 'fechaNacimiento', 'madre'] as const

export type Nuevo = Omit<AnimalCenso, 'regaNacimiento' | 'crotalMadre'> & {
  origen: 'nacido' | 'comprado'
  fechaEntrada: string | null
  regaOrigen: string | null
  madre: { crotal: string; enCenso: boolean; id: string | null } | null
  madreTexto: string | null
  observaciones: string | null
}

export type Diferencia = {
  campo: (typeof DIFERENCIAS)[number]
  censo: string | null
  aplicacion: string | null
}

const madreDeExistente = alias(animales, 'madre')

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

export async function planImportacion(tx: Transaccion, censo: Censo, regaExplotacion: string) {
  if (censo.rega !== regaExplotacion) {
    throw new ErrorApi(
      422,
      'censo_de_otra_explotacion',
      `El censo es de la explotación ${censo.rega}, no de esta (${regaExplotacion})`,
    )
  }
  if (censo.animales.length !== censo.total) {
    throw new ErrorApi(
      422,
      'censo_incompleto',
      `Se han leído ${censo.animales.length} animales y el censo dice que tiene ${censo.total}`,
    )
  }
  const repetidos = censo.animales
    .map((a) => a.crotal)
    .filter((c, i, todos) => todos.indexOf(c) !== i)
  if (repetidos.length > 0) {
    throw new ErrorApi(422, 'censo_no_reconocido', `Crotal repetido en el censo: ${repetidos[0]}`)
  }

  // Los animales de la explotación (la Row-Level Security solo deja ver los suyos)
  const actuales = await tx
    .select({
      id: animales.id,
      crotal: animales.crotal,
      nombre: animales.nombre,
      sexo: animales.sexo,
      raza: animales.raza,
      fechaNacimiento: animales.fechaNacimiento,
      estado: animales.estado,
      madreTexto: animales.madreTexto,
      madreCrotal: madreDeExistente.crotal,
    })
    .from(animales)
    .leftJoin(madreDeExistente, eq(madreDeExistente.id, animales.madreId))
  const porCrotal = new Map(actuales.filter((a) => a.crotal).map((a) => [a.crotal as string, a]))
  const enCenso = new Map(censo.animales.map((a) => [a.crotal, a]))

  const nuevos: Nuevo[] = []
  const existentes: { id: string; crotal: string; diferencias: Diferencia[] }[] = []
  for (const a of censo.animales) {
    const actual = porCrotal.get(a.crotal)
    if (actual) {
      const diferencias: Diferencia[] = []
      const comparar = (
        campo: Diferencia['campo'],
        deCenso: string | null,
        deApp: string | null,
      ) => {
        if ((deCenso ?? null) !== (deApp ?? null))
          diferencias.push({ campo, censo: deCenso, aplicacion: deApp })
      }
      comparar('sexo', a.sexo, actual.sexo)
      comparar('raza', a.raza, actual.raza)
      comparar('fechaNacimiento', a.fechaNacimiento, actual.fechaNacimiento)
      comparar('madre', a.crotalMadre, actual.madreCrotal ?? actual.madreTexto)
      existentes.push({ id: actual.id, crotal: a.crotal, diferencias })
      continue
    }

    // Madre: de la aplicación o del censo si es una hembra; si no, su crotal como texto
    const madreApp = a.crotalMadre ? porCrotal.get(a.crotalMadre) : undefined
    const madreCenso = a.crotalMadre ? enCenso.get(a.crotalMadre) : undefined
    const madre =
      a.crotalMadre && madreApp?.sexo === 'hembra'
        ? { crotal: a.crotalMadre, enCenso: false, id: madreApp.id }
        : a.crotalMadre && !madreApp && madreCenso?.sexo === 'hembra'
          ? { crotal: a.crotalMadre, enCenso: true, id: null }
          : null
    // Nacido en otra explotación: comprado, con la fecha del censo como entrada (no la trae)
    const comprado = a.regaNacimiento !== null && a.regaNacimiento !== censo.rega
    nuevos.push({
      crotal: a.crotal,
      sexo: a.sexo,
      raza: a.raza,
      fechaNacimiento: a.fechaNacimiento,
      origen: comprado ? 'comprado' : 'nacido',
      fechaEntrada: comprado ? censo.fecha : null,
      regaOrigen: comprado ? a.regaNacimiento : null,
      madre,
      madreTexto: madre ? null : a.crotalMadre,
      observaciones: comprado
        ? `Importado del censo del ${fechaEs(censo.fecha)}. La fecha de entrada es la del censo: corrígela si la sabes.`
        : null,
    })
  }

  const ausentes = actuales
    .filter((a) => a.estado === 'activo' && a.crotal && !enCenso.has(a.crotal))
    .map((a) => ({ id: a.id, crotal: a.crotal as string, nombre: a.nombre }))

  return { rega: censo.rega, fecha: censo.fecha, total: censo.total, nuevos, existentes, ausentes }
}

export type PlanImportacion = Awaited<ReturnType<typeof planImportacion>>

// Da de alta los nuevos, todos o ninguno (va en la transacción de la petición). Una madre del censo
// se da de alta antes que sus crías, sea cual sea el orden en el PDF.
export async function importarCenso(tx: Transaccion, plan: PlanImportacion) {
  const ids = new Map<string, string>()
  let pendientes = plan.nuevos
  while (pendientes.length > 0) {
    const listos = pendientes.filter((n) => !n.madre?.enCenso || ids.has(n.madre.crotal))
    if (listos.length === 0) {
      throw new ErrorApi(422, 'censo_no_reconocido', 'Las madres del censo forman un ciclo')
    }
    for (const n of listos) {
      const datos = DatosAnimal.safeParse({
        crotal: n.crotal,
        raza: n.raza,
        sexo: n.sexo,
        fechaNacimiento: n.fechaNacimiento,
        madreId: n.madre ? (n.madre.id ?? ids.get(n.madre.crotal)) : null,
        madreTexto: n.madreTexto,
        origen: n.origen,
        fechaEntrada: n.fechaEntrada,
        regaOrigen: n.regaOrigen,
        observaciones: n.observaciones,
      })
      if (!datos.success) {
        const motivo = datos.error.issues[0]?.message ?? 'datos no válidos'
        throw new ErrorApi(422, 'censo_no_reconocido', `${n.crotal}: ${motivo}`)
      }
      try {
        ids.set(n.crotal, await insertarAnimal(tx, datos.data))
      } catch (error) {
        // El crotal es único en toda la plataforma: puede estar en otra explotación
        if (error instanceof ErrorApi && error.codigo === 'crotal_en_uso') {
          throw new ErrorApi(
            409,
            'crotal_en_uso',
            `El animal ${n.crotal} ya está dado de alta en otra explotación de la plataforma`,
          )
        }
        throw error
      }
    }
    pendientes = pendientes.filter((n) => !ids.has(n.crotal))
  }
  return { creados: ids.size }
}

// Esquemas de la API

const AnimalNuevo = z
  .object({
    crotal: z.string(),
    sexo: z.enum(SEXOS),
    raza: z.string(),
    fechaNacimiento: z.iso.date(),
    origen: z.enum(['nacido', 'comprado']),
    fechaEntrada: z.iso.date().nullable().openapi({ description: 'La del censo, si es comprado' }),
    regaOrigen: z.string().nullable(),
    madre: z
      .object({ crotal: z.string(), enCenso: z.boolean(), id: z.uuid().nullable() })
      .nullable()
      .openapi({ description: 'La madre que se enlaza: ya en la aplicación (id) o del censo' }),
    madreTexto: z.string().nullable().openapi({ description: 'Madre que no está: su crotal' }),
    observaciones: z.string().nullable(),
  })
  .openapi('AnimalNuevoCenso')

export const VistaPreviaCenso = z
  .object({
    rega: z.string(),
    fecha: z.iso.date().openapi({ description: 'Fecha del censo' }),
    total: z.number().int(),
    nuevos: z.array(AnimalNuevo).openapi({ description: 'Los que se darán de alta' }),
    existentes: z
      .array(
        z.object({
          id: z.uuid(),
          crotal: z.string(),
          diferencias: z.array(
            z.object({
              campo: z.enum(DIFERENCIAS),
              censo: z.string().nullable(),
              aplicacion: z.string().nullable(),
            }),
          ),
        }),
      )
      .openapi({ description: 'Ya en la aplicación: no se tocan; con lo que no coincide' }),
    ausentes: z
      .array(z.object({ id: z.uuid(), crotal: z.string(), nombre: z.string().nullable() }))
      .openapi({ description: 'Activos en la aplicación que no están en el censo' }),
  })
  .openapi('VistaPreviaCenso')
