import { randomInt } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { crearApp } from '../src/app.js'
import { desdeGml, desdeWkt, puntoInterior } from '../src/cartografia.js'
import { pool } from '../src/db/cliente.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()

const pedir = (metodo: string, ruta: string, cookie: string, cuerpo?: object) =>
  Promise.resolve(
    app.request(`/api${ruta}`, {
      method: metodo,
      headers: {
        cookie,
        origin: ORIGEN,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }),
  )

const codigo = async (res: Response) =>
  ((await res.json()) as { error: { codigo: string } }).error.codigo

// Un cuadrado de unos 100 m en Lalín
const WKT = 'POLYGON((-8.096 42.679,-8.095 42.679,-8.095 42.680,-8.096 42.680,-8.096 42.679))'
const GML = `<FeatureCollection><member><cp:CadastralParcel>
  <cp:areaValue uom="m2">7295</cp:areaValue>
  <gml:PolygonPatch><gml:exterior><gml:LinearRing>
    <gml:posList srsDimension="2" count="5">42.679 -8.096 42.679 -8.095 42.68 -8.095 42.68 -8.096 42.679 -8.096</gml:posList>
  </gml:LinearRing></gml:exterior></gml:PolygonPatch>
</cp:CadastralParcel></member></FeatureCollection>`

const recintoSigpac = {
  provincia: 36,
  municipio: 24,
  agregado: 0,
  zona: 0,
  poligono: 57,
  parcela: 37,
  recinto: 2,
  superficie: 1.23456,
  uso_sigpac: 'PS',
  wkt: WKT,
}

// Respuestas de los servicios según la dirección pedida; las que no estén, 404
function simularServicios(respuestas: Record<string, unknown>) {
  const llamadas: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    llamadas.push(url)
    const clave = Object.keys(respuestas).find((k) => url.includes(k))
    if (!clave) return new Response('', { status: 404 })
    const r = respuestas[clave]
    if (r instanceof Error) throw r
    return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 })
  })
  return llamadas
}

let a = ''
let ana = { id: '', cookie: '' }
const consultar = (q: string) => pedir('GET', `/explotaciones/${a}/cartografia/${q}`, ana.cookie)

beforeAll(async () => {
  a = (await nuevaExplotacion('A de cartografía')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'empleado')
  ana = { id: u.id, cookie: await iniciarSesion(app, u) }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await pool.end()
})

describe('formatos', () => {
  it('lee los contornos en WKT del SIGPAC y en GML del Catastro', () => {
    const cuadrado = [
      [-8.096, 42.679],
      [-8.095, 42.679],
      [-8.095, 42.68],
      [-8.096, 42.68],
      [-8.096, 42.679],
    ]
    expect(desdeWkt(WKT)).toEqual({ type: 'Polygon', coordinates: [cuadrado] })
    expect(desdeGml(GML)).toEqual({ type: 'Polygon', coordinates: [cuadrado] })
    const multi = desdeWkt(
      'MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((2 2,3 2,3 3,2 2),(2.1 2.1,2.2 2.1,2.2 2.2,2.1 2.1)))',
    )
    expect(multi?.type).toBe('MultiPolygon')
    expect(multi?.coordinates).toHaveLength(2)
    expect(multi?.coordinates[1]).toHaveLength(2)
    expect(desdeWkt('POINT(1 2)')).toBeNull()
  })

  it('busca un punto dentro del contorno', () => {
    const p = puntoInterior({
      type: 'Polygon',
      coordinates: desdeWkt(WKT)?.coordinates as number[][][],
    })
    expect(p?.[0]).toBeCloseTo(-8.0956, 3)
    expect(p?.[1]).toBeCloseTo(42.6794, 3)
  })
})

describe('consultas', () => {
  it('da el recinto SIGPAC en un punto, con su referencia catastral y su municipio', async () => {
    const llamadas = simularServicios({
      recinfobypoint: [recintoSigpac],
      Consulta_RCCOOR: {
        Consulta_RCCOORResult: {
          coordenadas: { coord: [{ pc: { pc1: '36024A0', pc2: '5700037' } }] },
        },
      },
      reverseGeocode: { muni: 'Lalín', province: 'Pontevedra' },
    })
    const res = await consultar('recinto?lon=-8.0955&lat=42.6795')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      provincia: '36',
      municipio: '24',
      agregado: '0',
      zona: '0',
      poligono: '57',
      parcela: '37',
      recinto: '2',
      superficie: 1.2346,
      uso: 'PS',
      contorno: { type: 'Polygon' },
      referenciaCatastral: '36024A05700037',
      nombreMunicipio: 'Lalín',
      nombreProvincia: 'Pontevedra',
    })
    expect(llamadas[0]).toContain('/recinfobypoint/4258/-8.0955/42.6795.json')
  })

  it('consulta por referencia SIGPAC aunque el Catastro y CartoCiudad no respondan', async () => {
    const llamadas = simularServicios({
      '/recinfo/36/24/0/0/57/37/2.json': [recintoSigpac],
      Consulta_RCCOOR: new Error('caído'),
      reverseGeocode: new Error('caído'),
    })
    const res = await consultar('recinto?referencia=36:24:0:0:57:37:2')
    expect(await res.json()).toMatchObject({
      recinto: '2',
      referenciaCatastral: null,
      nombreMunicipio: null,
    })
    expect(llamadas).toHaveLength(3)
  })

  it('avisa si no hay recinto, si el SIGPAC no responde o si falta el punto', async () => {
    simularServicios({ recinfobypoint: [] })
    expect(await codigo(await consultar('recinto?lon=-8&lat=42'))).toBe('recinto_no_encontrado')
    simularServicios({ recinfobypoint: new Error('caído') })
    const caido = await consultar('recinto?lon=-8&lat=42')
    expect(caido.status).toBe(502)
    expect(await codigo(caido)).toBe('servicio_no_disponible')
    expect((await consultar('recinto?lon=-8')).status).toBe(400)
    expect((await consultar('recinto?referencia=36:24:57')).status).toBe(400)
  })

  it('da la superficie, el contorno y el municipio de una parcela catastral', async () => {
    simularServicios({
      Consulta_DNPRC: {
        consulta_dnprcResult: {
          control: { cudnp: 1 },
          bico: { bi: { dt: { nm: 'LALIN', np: 'PONTEVEDRA' } }, finca: { dff: { ss: '7295' } } },
        },
      },
      wfsCP: GML,
      reverseGeocode: new Error('caído'),
    })
    const res = await consultar('catastro?referencia=36024a0 5709037')
    expect(await res.json()).toMatchObject({
      referenciaCatastral: '36024A05709037',
      superficie: 0.7295,
      contorno: { type: 'Polygon' },
      // Sin CartoCiudad, el nombre del Catastro
      nombreMunicipio: 'Lalin',
      nombreProvincia: 'Pontevedra',
    })
    simularServicios({
      Consulta_DNPRC: { consulta_dnprcResult: { control: { cuerr: 1 } } },
    })
    expect(await codigo(await consultar('catastro?referencia=36024A05709099'))).toBe(
      'parcela_no_encontrada',
    )
    expect((await consultar('catastro?referencia=123')).status).toBe(400)
  })

  it('sitúa un municipio para centrar el mapa', async () => {
    simularServicios({
      find: { geom: 'MULTIPOLYGON(((-8.2 42.6,-8.0 42.6,-8.0 42.7,-8.2 42.6)))' },
    })
    expect(await (await consultar('municipio?nombre=Lal%C3%ADn')).json()).toEqual({
      recuadro: [-8.2, 42.6, -8, 42.7],
    })
    simularServicios({ find: {} })
    expect(await (await consultar('municipio?nombre=Ninguno')).json()).toEqual({ recuadro: null })
  })

  it('solo con acceso a las fincas de la explotación', async () => {
    const otra = (await nuevaExplotacion(`Otra ${randomInt(1e9)}`)).id
    const res = await pedir(
      'GET',
      `/explotaciones/${otra}/cartografia/recinto?lon=-8&lat=42`,
      ana.cookie,
    )
    expect(res.status).toBe(404)
  })
})
