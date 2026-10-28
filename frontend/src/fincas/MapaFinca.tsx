import { useEffect, useRef } from 'react'
import type { Contorno } from './cartografia'
import estilos from './Fincas.module.css'
import { COLORES, capaContorno, crearMapa, encuadrar } from './leaflet'

// Las parcelas de una finca sobre la ortofoto, en su ficha (GH-91). Se carga aparte, como los otros
// mapas.
export default function MapaFinca({ contornos }: { contornos: Contorno[] }) {
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contenedor.current) return
    // Sin la rueda del ratón, para que al desplazar la ficha no se acerque el mapa sin querer
    const { mapa, desmontar } = crearMapa(contenedor.current, { scrollWheelZoom: false })
    const capas = contornos.map((c) =>
      capaContorno(c, { color: COLORES.finca, weight: 2, fillOpacity: 0.2 }).addTo(mapa),
    )
    encuadrar(mapa, capas)
    return desmontar
  }, [contornos])

  return (
    <div className={`${estilos.mapa} ${estilos.mapaFicha}`}>
      <div ref={contenedor} className={estilos.lienzo} />
    </div>
  )
}
