import { ChevronRight, LocateFixed } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useAvisos } from '../componentes/Avisos'
import { BotonIcono } from '../componentes/Boton'
import { EstadoError } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas } from '../formato'
import { type Finca, REGIMENES, useContornos } from './datos'
import estilos from './Fincas.module.css'
import { InsigniaPastoreo } from './InsigniaPastoreo'
import { InsigniaSeguridad } from './InsigniaSeguridad'
import {
  COLORES,
  capaContorno,
  centrarEnMunicipio,
  crearMapa,
  encuadrar,
  L,
  ubicar,
} from './leaflet'

// En plazo de seguridad o pastando, el color de su insignia; el plazo, que es un aviso, primero
const color = (f: Finca) =>
  f.finSeguridad ? COLORES.plazo : f.pastoreo ? COLORES.pastoreo : COLORES.finca

// Las fincas de la lista, con sus filtros, dibujadas sobre la ortofoto (GH-91). Al tocar una se ven su
// nombre, su superficie y el acceso a su ficha. Se carga aparte, solo al elegir la vista de mapa.
export default function MapaFincas({ fincas }: { fincas: Finca[] }) {
  const explotacion = useExplotacionActual()
  const contornos = useContornos(explotacion.id)
  const { avisar } = useAvisos()
  const contenedor = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map>(null)
  // Las fincas que se encuadraron la última vez: se vuelve a encuadrar al cambiar los filtros, no al
  // elegir una finca
  const encuadradas = useRef<string>(undefined)
  const [elegida, setElegida] = useState<string>()
  const ruta = `${rutaExplotacion(explotacion.id)}/fincas`

  // El mapa se crea una sola vez; las fincas se dibujan aparte
  useEffect(() => {
    if (!contenedor.current) return
    const { mapa: m, desmontar } = crearMapa(contenedor.current)
    mapa.current = m
    m.on('click', () => setElegida(undefined))
    return () => {
      desmontar()
      mapa.current = null
    }
  }, [])

  // Las parcelas de cada finca, de nuevo cada vez que cambian los filtros o la finca elegida
  // biome-ignore lint/correctness/useExhaustiveDependencies: explotacion no cambia sin desmontar
  useEffect(() => {
    const m = mapa.current
    if (!m || !contornos.data) return
    const capas = fincas.flatMap((f) => {
      const suyos = contornos.data.filter((c) => c.fincaId === f.id)
      if (suyos.length === 0) return []
      const elegidaAhora = f.id === elegida
      const grupo = L.featureGroup(
        suyos.map((c) =>
          capaContorno(c.contorno, {
            color: elegidaAhora ? COLORES.elegida : color(f),
            weight: elegidaAhora ? 4 : 2,
            fillOpacity: elegidaAhora ? 0.35 : 0.2,
          }),
        ),
      )
      grupo.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev)
        setElegida(f.id)
      })
      grupo.bindTooltip(f.nombre, { sticky: true })
      return [grupo.addTo(m)]
    })
    const clave = fincas.map((f) => f.id).join()
    if (encuadradas.current !== clave) {
      if (capas.length) encuadrar(m, capas)
      else if (encuadradas.current === undefined)
        centrarEnMunicipio(m, explotacion.id, explotacion.municipio)
      encuadradas.current = clave
    }
    return () => {
      for (const c of capas) c.remove()
    }
  }, [fincas, contornos.data, elegida])

  const finca = fincas.find((f) => f.id === elegida)
  const conContorno = new Set(contornos.data?.map((c) => c.fincaId))
  const sinContorno = contornos.data ? fincas.filter((f) => !conContorno.has(f.id)) : []

  return (
    <div className={estilos.mapaFincas}>
      {contornos.isError && (
        <EstadoError alReintentar={() => contornos.refetch()} reintentando={contornos.isFetching} />
      )}
      <div className={estilos.mapa}>
        <div ref={contenedor} className={estilos.lienzo} />
        {/* En el campo, para saber en qué finca estás: tu posición, con un punto */}
        <BotonIcono
          etiqueta="Ir a mi ubicación"
          icono={<LocateFixed aria-hidden size={20} />}
          className={estilos.ubicarme}
          onClick={() => {
            if (mapa.current)
              ubicar(mapa.current, () =>
                avisar({ tipo: 'error', mensaje: 'No se puede saber dónde estás' }),
              )
          }}
        />
      </div>
      <ul className={estilos.leyenda} aria-label="Leyenda del mapa">
        <li>
          <span style={{ background: COLORES.finca }} aria-hidden /> Finca
        </li>
        <li>
          <span style={{ background: COLORES.pastoreo }} aria-hidden /> En pastoreo
        </li>
        <li>
          <span style={{ background: COLORES.plazo }} aria-hidden /> En plazo de seguridad
        </li>
      </ul>

      {finca && (
        <Tarjeta aria-label={finca.nombre} className={estilos.elegidaMapa}>
          <div>
            <h2 className={estilos.tituloRegistro}>{finca.nombre}</h2>
            <p className={estilos.suave}>
              {[hectareas(finca.superficie), finca.municipio, REGIMENES[finca.regimen]]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className={estilos.insignias}>
              {finca.finSeguridad && <InsigniaSeguridad fin={finca.finSeguridad} />}
              {finca.pastoreo && <InsigniaPastoreo pastoreo={finca.pastoreo} />}
            </div>
          </div>
          <Link to={`${ruta}/${finca.id}`} className={estilos.enlaceFicha}>
            Abrir la ficha
            <ChevronRight aria-hidden size={18} />
          </Link>
        </Tarjeta>
      )}

      {sinContorno.length > 0 && (
        <div className={estilos.aviso} role="status">
          <div>
            <p>
              {sinContorno.length === 1
                ? '1 finca no sale en el mapa porque sus parcelas se escribieron a mano:'
                : `${sinContorno.length} fincas no salen en el mapa porque sus parcelas se escribieron a mano:`}
            </p>
            <ul className={estilos.sinContorno}>
              {sinContorno.map((f) => (
                <li key={f.id}>
                  <Link to={`${ruta}/${f.id}?completar=mapa`}>
                    {f.nombre}: completar en el mapa
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
