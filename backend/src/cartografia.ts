import { z } from '@hono/zod-openapi'
import type { Contorno } from './db/schema/index.js'
import { ErrorApi } from './errores.js'

// Consultas a los servicios públicos de cartografía para rellenar las parcelas de una finca (GH-52):
// - SIGPAC (FEGA): el recinto en un punto del mapa o por su referencia, con su superficie, su uso y
//   su contorno.
// - Catastro: la referencia catastral en un punto, y la superficie y el contorno de una referencia.
// - CartoCiudad (IGN): el nombre del municipio y la provincia en un punto, y dónde está un municipio.
// Pasan por el backend para no depender de que admitan llamadas desde el navegador y para dar un error
// claro si no responden.

const SIGPAC = 'https://sigpac-hubcloud.es/servicioconsultassigpac/query'
const CATASTRO = 'https://ovc.catastro.meh.es'
const CARTOCIUDAD = 'https://www.cartociudad.es/geocoder/api/geocoder'

// Lo que se espera a cada servicio antes de darlo por caído
const ESPERA_MS = 8000

const caido = (servicio: string) =>
  new ErrorApi(
    502,
    'servicio_no_disponible',
    `${servicio} no responde. Prueba más tarde o escribe los datos a mano.`,
  )

async function pedir(url: string, servicio: string) {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS) })
  } catch {
    throw caido(servicio)
  }
  if (!res.ok) throw caido(servicio)
  return res
}

async function pedirJson(url: string, servicio: string): Promise<unknown> {
  const res = await pedir(url, servicio)
  try {
    return await res.json()
  } catch {
    throw caido(servicio)
  }
}

// Coordenadas con siete decimales (un centímetro): más no aporta y ocupa
const redondear = (n: number) => Math.round(n * 1e7) / 1e7

// "POLYGON((x y, ...), (...))" o "MULTIPOLYGON(((...)), ((...)))" a GeoJSON
export function desdeWkt(wkt: string): Contorno | null {
  const tipo = wkt.match(/^\s*(MULTIPOLYGON|POLYGON)\s*\(/i)?.[1]?.toUpperCase()
  if (!tipo) return null
  const cuerpo = wkt.slice(wkt.indexOf('(') + 1, wkt.lastIndexOf(')'))
  const anillos = (s: string) =>
    s
      .replace(/^[\s(]+|[\s)]+$/g, '')
      .split(/\)\s*,\s*\(/)
      .map((a) =>
        a.split(',').map((par) => par.trim().split(/\s+/).slice(0, 2).map(Number).map(redondear)),
      )
  if (tipo === 'POLYGON') return { type: 'Polygon', coordinates: anillos(cuerpo) }
  return {
    type: 'MultiPolygon',
    coordinates: cuerpo.split(/\)\s*\)\s*,\s*\(\s*\(/).map(anillos),
  }
}

// El primer polígono del contorno: su anillo exterior
const exterior = (c: Contorno) => (c.type === 'Polygon' ? c.coordinates[0] : c.coordinates[0]?.[0])

// Un punto del interior del contorno para consultar qué hay en él: el centro de sus vértices si cae
// dentro (lo normal) o, si no, null
export function puntoInterior(c: Contorno): [number, number] | null {
  const anillo = exterior(c) ?? []
  if (anillo.length < 3) return null
  const lon = anillo.reduce((s, p) => s + (p[0] ?? 0), 0) / anillo.length
  const lat = anillo.reduce((s, p) => s + (p[1] ?? 0), 0) / anillo.length
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi = 0, yi = 0] = anillo[i] ?? []
    const [xj = 0, yj = 0] = anillo[j] ?? []
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro ? [lon, lat] : null
}

// "LALIN" → "Lalin"; solo cuando no hay otra fuente del nombre
const capitalizar = (t: string) =>
  t.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())

// Municipio y provincia en un punto, con sus nombres oficiales ("Lalín", "Pontevedra")
async function lugar(lon: number, lat: number) {
  try {
    const r = (await pedirJson(
      `${CARTOCIUDAD}/reverseGeocode?lon=${lon}&lat=${lat}`,
      'CartoCiudad',
    )) as { muni?: string; province?: string } | null
    return { municipio: r?.muni || null, provincia: r?.province || null }
  } catch {
    return { municipio: null, provincia: null }
  }
}

// Referencia catastral de la parcela en un punto
async function catastralEn(lon: number, lat: number) {
  try {
    const r = (await pedirJson(
      `${CATASTRO}/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_RCCOOR?SRS=EPSG:4326&CoorX=${lon}&CoorY=${lat}`,
      'El Catastro',
    )) as {
      Consulta_RCCOORResult?: {
        coordenadas?: { coord?: { pc?: { pc1?: string; pc2?: string } }[] }
      }
    }
    const pc = r.Consulta_RCCOORResult?.coordenadas?.coord?.[0]?.pc
    return pc?.pc1 && pc.pc2 ? `${pc.pc1}${pc.pc2}` : null
  } catch {
    return null
  }
}

type RecintoSigpac = {
  provincia: number
  municipio: number
  agregado: number
  zona: number
  poligono: number
  parcela: number
  recinto: number
  superficie: number
  uso_sigpac: string | null
  wkt: string
}

export const ConsultaRecinto = z
  .object({
    lon: z.coerce.number().min(-19).max(5).optional().openapi({ example: -8.095 }),
    lat: z.coerce.number().min(27).max(44.5).optional().openapi({ example: 42.68 }),
    referencia: z
      .string()
      .regex(/^\d{1,5}(:\d{1,5}){6}$/, 'La referencia SIGPAC lleva siete números separados por ":"')
      .optional()
      .openapi({ example: '36:24:0:0:57:9037:1', description: 'Referencia SIGPAC completa' }),
  })
  .refine((c) => c.referencia || (c.lon !== undefined && c.lat !== undefined), {
    message: 'Indica un punto (lon y lat) o una referencia SIGPAC',
  })

// El recinto SIGPAC en un punto o con una referencia, con la referencia catastral de la parcela en la
// que está y el nombre de su municipio y su provincia
export async function consultarRecinto(c: z.output<typeof ConsultaRecinto>) {
  const url = c.referencia
    ? `${SIGPAC}/recinfo/${c.referencia.split(':').join('/')}.json`
    : `${SIGPAC}/recinfobypoint/4258/${c.lon}/${c.lat}.json`
  const lista = (await pedirJson(url, 'El SIGPAC')) as RecintoSigpac[] | null
  const r = Array.isArray(lista) ? lista[0] : undefined
  const contorno = r ? desdeWkt(r.wkt) : null
  if (!r || !contorno)
    throw new ErrorApi(
      404,
      'recinto_no_encontrado',
      c.referencia ? 'No existe ese recinto en el SIGPAC' : 'Aquí no hay ningún recinto SIGPAC',
    )
  const punto: [number, number] | null =
    c.lon !== undefined && c.lat !== undefined ? [c.lon, c.lat] : puntoInterior(contorno)
  const [donde, referenciaCatastral] = punto
    ? await Promise.all([lugar(...punto), catastralEn(...punto)])
    : [{ municipio: null, provincia: null }, null]
  return {
    provincia: String(r.provincia),
    municipio: String(r.municipio),
    agregado: String(r.agregado),
    zona: String(r.zona),
    poligono: String(r.poligono),
    parcela: String(r.parcela),
    recinto: String(r.recinto),
    superficie: Math.round(r.superficie * 10_000) / 10_000,
    uso: r.uso_sigpac || null,
    contorno,
    referenciaCatastral,
    nombreMunicipio: donde.municipio,
    nombreProvincia: donde.provincia,
  }
}

export const ConsultaCatastro = z.object({
  referencia: z
    .string()
    .transform((t) => t.replace(/\s+/g, '').toUpperCase())
    .pipe(
      z
        .string()
        .regex(/^[0-9A-Z]{14}([0-9A-Z]{6})?$/, 'La referencia catastral tiene 14 o 20 caracteres'),
    )
    .openapi({ example: '36024A05709037' }),
})

// Contorno de una parcela catastral, del servicio INSPIRE: GML con "lat lon" en cada vértice
export function desdeGml(gml: string): Contorno | null {
  const leer = (posList: string) => {
    const n = posList.trim().split(/\s+/).map(Number)
    const anillo: number[][] = []
    for (let i = 0; i + 1 < n.length; i += 2)
      anillo.push([redondear(n[i + 1] ?? 0), redondear(n[i] ?? 0)])
    return anillo
  }
  const poligonos = [...gml.matchAll(/<gml:PolygonPatch>([\s\S]*?)<\/gml:PolygonPatch>/g)].map(
    ([, parche = '']) =>
      [...parche.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)].map(([, l = '']) =>
        leer(l),
      ),
  )
  if (poligonos.length === 0) return null
  return poligonos.length === 1
    ? { type: 'Polygon', coordinates: poligonos[0] ?? [] }
    : { type: 'MultiPolygon', coordinates: poligonos }
}

// Superficie, municipio y contorno de una parcela catastral
export async function consultarCatastro({ referencia }: z.output<typeof ConsultaCatastro>) {
  const rc = referencia.slice(0, 14)
  const datosRc = (await pedirJson(
    `${CATASTRO}/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?RefCat=${rc}`,
    'El Catastro',
  )) as {
    consulta_dnprcResult?: {
      control?: { cuerr?: number }
      bico?: { bi?: { dt?: { nm?: string; np?: string } }; finca?: { dff?: { ss?: string } } }
    }
  }
  const bico = datosRc.consulta_dnprcResult?.bico
  if (!bico || datosRc.consulta_dnprcResult?.control?.cuerr)
    throw new ErrorApi(404, 'parcela_no_encontrada', 'No existe esa referencia en el Catastro')
  const gml = await (
    await pedir(
      `${CATASTRO}/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature&STOREDQUERIE_ID=GetParcel&refcat=${rc}&srsname=EPSG::4326`,
      'El Catastro',
    )
  ).text()
  const contorno = desdeGml(gml)
  const metros = Number(bico.finca?.dff?.ss ?? gml.match(/<cp:areaValue[^>]*>([\d.]+)</)?.[1])
  const punto = contorno ? puntoInterior(contorno) : null
  const donde = punto ? await lugar(...punto) : { municipio: null, provincia: null }
  return {
    referenciaCatastral: referencia,
    superficie: Number.isFinite(metros) && metros > 0 ? Math.round(metros) / 10_000 : null,
    contorno,
    nombreMunicipio: donde.municipio ?? (bico.bi?.dt?.nm ? capitalizar(bico.bi.dt.nm) : null),
    nombreProvincia: donde.provincia ?? (bico.bi?.dt?.np ? capitalizar(bico.bi.dt.np) : null),
  }
}

export const ConsultaMunicipio = z.object({
  nombre: z.string().trim().min(1).openapi({ example: 'Lalín' }),
})

// Dónde está un municipio, para centrar el mapa: su recuadro [oeste, sur, este, norte], o null. Solo
// con el nombre: con la provincia, CartoCiudad busca peor ("Lalín, Pontevedra" da otro sitio).
export async function situarMunicipio({ nombre }: z.output<typeof ConsultaMunicipio>) {
  const q = encodeURIComponent(nombre)
  const r = (await pedirJson(`${CARTOCIUDAD}/find?q=${q}&type=municipio`, 'CartoCiudad')) as {
    geom?: string
  } | null
  const numeros = [...(r?.geom ?? '').matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(
    ([, x, y]) => [Number(x), Number(y)] as const,
  )
  if (numeros.length === 0) return { recuadro: null }
  // Con reduce: un municipio tiene decenas de miles de vértices, demasiados para Math.min(...xs)
  const recuadro = numeros.reduce<[number, number, number, number]>(
    ([o, s, e, n], [x, y]) => [Math.min(o, x), Math.min(s, y), Math.max(e, x), Math.max(n, y)],
    [Infinity, Infinity, -Infinity, -Infinity],
  )
  return { recuadro }
}
