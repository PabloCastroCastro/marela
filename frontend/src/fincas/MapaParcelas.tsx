import { LocateFixed, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas } from '../formato'
import { type Contorno, consultarRecinto, type RecintoSigpac, usoSigpac } from './cartografia'
import estilos from './Fincas.module.css'
import {
  COLORES,
  capaContorno,
  centrarEnMunicipio,
  crearMapa,
  encuadrar,
  type L,
  ubicar,
  ubicarSiHayPermiso,
  ZOOM_RECINTOS,
} from './leaflet'

const referencia = (r: RecintoSigpac) =>
  [r.provincia, r.municipio, r.agregado, r.zona, r.poligono, r.parcela, r.recinto].join(':')

const ESTILO_ELEGIDO: L.PathOptions = { color: COLORES.elegida, weight: 3, fillOpacity: 0.25 }
const ESTILO_FINCA: L.PathOptions = {
  color: COLORES.finca,
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
    const { mapa: m, desmontar } = crearMapa(contenedor.current, { recintos: true })
    mapa.current = m
    const deLaFinca = contornos.map((c) => capaContorno(c, { ...ESTILO_FINCA, interactive: false }))
    for (const capa of deLaFinca) capa.addTo(m)
    m.on('zoomend', () => setZoom(m.getZoom()))
    setZoom(m.getZoom())

    // Centrar: en las parcelas de la finca; si no hay, en el municipio de la explotación
    if (deLaFinca.length) encuadrar(m, deLaFinca)
    // Una finca nueva se suele dar de alta estando en ella o cerca: si el móvil ya dio permiso,
    // a tu posición; si no, sin pedirlo, al municipio
    else
      ubicarSiHayPermiso(m).then((ubicado) => {
        if (!ubicado) centrarEnMunicipio(m, explotacion.id, explotacion.municipio)
      })

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
        capas.current.set(ref, capaContorno(r.contorno, ESTILO_ELEGIDO).addTo(m))
        setElegidos((es) => [...es, r])
      } catch (error) {
        avisar({ tipo: 'error', mensaje: (error as Error).message })
      } finally {
        setConsultando(false)
      }
    })
    return () => {
      desmontar()
      mapa.current = null
    }
  }, [])

  const ubicarme = () => {
    if (mapa.current)
      ubicar(mapa.current, () =>
        avisar({ tipo: 'error', mensaje: 'No se puede saber dónde estás' }),
      )
  }

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
