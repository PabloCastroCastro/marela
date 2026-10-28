import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { LocateFixed, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas } from '../formato'
import {
  type Contorno,
  consultarRecinto,
  type RecintoSigpac,
  situarMunicipio,
  usoSigpac,
} from './cartografia'
import estilos from './Fincas.module.css'

// Fondo: la ortofoto del PNOA, del IGN
const ORTOFOTO =
  'https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}&format=image/jpeg'
// Encima, los límites de los recintos del SIGPAC; con menos zoom serían una maraña
const RECINTOS = 'https://sigpac-hubcloud.es/wms'
const ZOOM_RECINTOS = 15
// Sin otra referencia, la península entera
const ESPANA: L.LatLngTuple = [40.2, -3.7]

const referencia = (r: RecintoSigpac) =>
  [r.provincia, r.municipio, r.agregado, r.zona, r.poligono, r.parcela, r.recinto].join(':')

const ESTILO_ELEGIDO: L.PathOptions = { color: '#facc15', weight: 3, fillOpacity: 0.25 }
const ESTILO_FINCA: L.PathOptions = {
  color: '#ffffff',
  weight: 2,
  fillOpacity: 0.1,
  dashArray: '4',
}

// Elegir en el mapa los recintos SIGPAC de una finca (GH-52): al tocar uno se consulta y se marca; al
// tocarlo de nuevo, se desmarca. Se carga aparte, solo cuando se abre, porque Leaflet pesa.
export default function MapaParcelas({
  contornos,
  alCerrar,
  alAnadir,
}: {
  // Los de las parcelas que ya tiene la finca, para verlas y centrar el mapa en ellas
  contornos: Contorno[]
  alCerrar: () => void
  alAnadir: (recintos: RecintoSigpac[]) => void
}) {
  const explotacion = useExplotacionActual()
  const { avisar } = useAvisos()
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map>(null)
  const capas = useRef(new Map<string, L.GeoJSON>())
  const [elegidos, setElegidos] = useState<RecintoSigpac[]>([])
  const [consultando, setConsultando] = useState(false)
  const [zoom, setZoom] = useState(0)
  // Para leer la lista actual desde los eventos del mapa, que se enlazan una sola vez
  const elegidosRef = useRef(elegidos)
  elegidosRef.current = elegidos

  const quitar = (ref: string) => {
    capas.current.get(ref)?.remove()
    capas.current.delete(ref)
    setElegidos((es) => es.filter((e) => referencia(e) !== ref))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: el mapa se crea una sola vez
  useEffect(() => {
    if (!contenedor.current) return
    const m = L.map(contenedor.current, { center: ESPANA, zoom: 6, maxZoom: 20 })
    mapa.current = m
    m.attributionControl.setPrefix('Leaflet')
    L.tileLayer(ORTOFOTO, { maxZoom: 20, maxNativeZoom: 19, attribution: 'PNOA © IGN' }).addTo(m)
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
      .addTo(m)
    const deLaFinca = contornos.map((c) =>
      L.geoJSON(c, { style: ESTILO_FINCA, interactive: false }),
    )
    for (const capa of deLaFinca) capa.addTo(m)
    // La hoja se abre con una animación: el mapa recalcula su tamaño cuando cambia el del contenedor
    const tamano = new ResizeObserver(() => m.invalidateSize())
    tamano.observe(contenedor.current)
    m.on('zoomend', () => setZoom(m.getZoom()))
    setZoom(m.getZoom())

    // Centrar: en las parcelas de la finca; si no hay, en el municipio de la explotación
    if (deLaFinca.length) {
      m.fitBounds(L.featureGroup(deLaFinca).getBounds(), { maxZoom: 17 })
    } else if (explotacion.municipio) {
      situarMunicipio(explotacion.id, explotacion.municipio)
        .then(({ recuadro }) => {
          const [o, s, e, n] = recuadro ?? []
          if (o !== undefined && s !== undefined && e !== undefined && n !== undefined)
            m.fitBounds([
              [s, o],
              [n, e],
            ])
        })
        .catch(() => undefined)
    }

    m.on('click', async (ev: L.LeafletMouseEvent) => {
      if (m.getZoom() < ZOOM_RECINTOS) {
        m.setView(ev.latlng, ZOOM_RECINTOS + 2)
        return
      }
      setConsultando(true)
      try {
        const r = await consultarRecinto(explotacion.id, {
          lon: Number(ev.latlng.lng.toFixed(7)),
          lat: Number(ev.latlng.lat.toFixed(7)),
        })
        const ref = referencia(r)
        if (elegidosRef.current.some((e) => referencia(e) === ref)) {
          quitar(ref)
          return
        }
        capas.current.set(ref, L.geoJSON(r.contorno, { style: ESTILO_ELEGIDO }).addTo(m))
        setElegidos((es) => [...es, r])
      } catch (error) {
        avisar({ tipo: 'error', mensaje: (error as Error).message })
      } finally {
        setConsultando(false)
      }
    })
    return () => {
      tamano.disconnect()
      m.remove()
      mapa.current = null
    }
  }, [])

  const ubicarme = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => mapa.current?.setView([p.coords.latitude, p.coords.longitude], ZOOM_RECINTOS + 2),
      () => avisar({ tipo: 'error', mensaje: 'No se puede saber dónde estás' }),
      { enableHighAccuracy: true, timeout: 10_000 },
    )

  const total = elegidos.reduce((s, r) => s + r.superficie, 0)

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo="Elegir en el mapa"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton
            disabled={elegidos.length === 0}
            onClick={() => {
              alAnadir(elegidos)
              alCerrar()
            }}
          >
            {elegidos.length > 1 ? `Añadir ${elegidos.length} parcelas` : 'Añadir parcela'}
          </Boton>
        </>
      }
    >
      <div className={estilos.mapaElegir}>
        <p className={estilos.suave} role="status">
          {consultando
            ? 'Consultando el SIGPAC…'
            : zoom < ZOOM_RECINTOS
              ? 'Acerca el mapa hasta ver los recintos y toca los de la finca.'
              : 'Toca los recintos de la finca; tocando otra vez uno, se quita.'}
        </p>
        <div className={estilos.mapa}>
          <div ref={contenedor} className={estilos.lienzo} />
          <BotonIcono
            etiqueta="Ir a mi ubicación"
            icono={<LocateFixed aria-hidden size={20} />}
            className={estilos.ubicarme}
            onClick={ubicarme}
          />
        </div>
        {elegidos.length > 0 && (
          <ul className={estilos.registros} aria-label="Recintos elegidos">
            {elegidos.map((r) => (
              <li key={referencia(r)}>
                <div>
                  <span className={estilos.tituloRegistro}>SIGPAC {referencia(r)}</span>
                  <span className={estilos.suave}>
                    {[usoSigpac(r.uso), hectareas(r.superficie), r.nombreMunicipio]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <BotonIcono
                  etiqueta={`Quitar el recinto ${referencia(r)}`}
                  icono={<X aria-hidden size={18} />}
                  onClick={() => quitar(referencia(r))}
                />
              </li>
            ))}
          </ul>
        )}
        {elegidos.length > 1 && <p className={estilos.suave}>Total: {hectareas(total)}</p>}
      </div>
    </HojaInferior>
  )
}
