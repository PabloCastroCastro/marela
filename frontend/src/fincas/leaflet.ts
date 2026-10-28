import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { type Contorno, situarMunicipio } from './cartografia'

// Lo común a los mapas de las fincas (GH-52, GH-91). Solo lo importan los componentes de mapa, que se
// cargan aparte: Leaflet pesa.

// Fondo: la ortofoto del PNOA, del IGN
const ORTOFOTO =
  'https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}&format=image/jpeg'
// Encima, los límites de los recintos del SIGPAC; con menos zoom serían una maraña
const RECINTOS = 'https://sigpac-hubcloud.es/wms'
export const ZOOM_RECINTOS = 15
// Sin otra referencia, la península entera
const ESPANA: L.LatLngTuple = [40.2, -3.7]

// Sobre la ortofoto, colores vivos y fijos, los mismos en el tema claro y en el oscuro
export const COLORES = {
  finca: '#ecfccb',
  elegida: '#facc15',
  pastoreo: '#60a5fa',
  plazo: '#fb923c',
}

export function crearMapa(
  contenedor: HTMLElement,
  { recintos = false, ...opciones }: { recintos?: boolean } & L.MapOptions = {},
) {
  const mapa = L.map(contenedor, { center: ESPANA, zoom: 6, maxZoom: 20, ...opciones })
  mapa.attributionControl.setPrefix('Leaflet')
  L.tileLayer(ORTOFOTO, { maxZoom: 20, maxNativeZoom: 19, attribution: 'PNOA © IGN' }).addTo(mapa)
  if (recintos)
    L.tileLayer
      .wms(RECINTOS, {
        layers: 'recinto',
        // Con la 1.1.1, la que usa Leaflet por defecto, el servicio devuelve las imágenes vacías
        version: '1.3.0',
        format: 'image/png',
        transparent: true,
        minZoom: ZOOM_RECINTOS,
        maxZoom: 20,
        attribution: 'SIGPAC © FEGA',
      })
      .addTo(mapa)
  // Las hojas y las tarjetas cambian de tamaño al abrirse: el mapa lo recalcula
  const tamano = new ResizeObserver(() => mapa.invalidateSize())
  tamano.observe(contenedor)
  return {
    mapa,
    desmontar: () => {
      tamano.disconnect()
      mapa.remove()
    },
  }
}

export const capaContorno = (contorno: Contorno, estilo: L.PathOptions) =>
  L.geoJSON(contorno as GeoJSON.GeoJsonObject, { style: estilo })

// Centra el mapa en unas capas, sin acercarse tanto que no se vea alrededor
export const encuadrar = (mapa: L.Map, capas: L.Layer[]) => {
  if (capas.length)
    mapa.fitBounds(L.featureGroup(capas).getBounds(), { maxZoom: 17, padding: [16, 16] })
}

export { L }

// Sin nada que encuadrar, el municipio de la explotación; si no se encuentra, se queda donde está
export const centrarEnMunicipio = (
  mapa: L.Map,
  explotacionId: string,
  municipio: string | null,
) => {
  if (!municipio) return
  situarMunicipio(explotacionId, municipio)
    .then(({ recuadro }) => {
      const [o, s, e, n] = recuadro ?? []
      if (o !== undefined && s !== undefined && e !== undefined && n !== undefined)
        mapa.fitBounds([
          [s, o],
          [n, e],
        ])
    })
    .catch(() => undefined)
}
