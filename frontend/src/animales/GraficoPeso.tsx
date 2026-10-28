import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { fecha, kilos, numero } from '../formato'
import estilos from './GraficoPeso.module.css'
import { diasEntre, ganancia, type Pesada } from './pesos'

type Punto = Pesada & { ganancia: number | null }

const ALTO = 180
const MARGEN = { arriba: 12, derecha: 12, abajo: 28, izquierda: 48 }

// Marcas "redondas" del eje de kilos: 3 o 4 entre el mínimo y el máximo
function marcas(min: number, max: number) {
  const bruto = Math.max((max - min) / 3, 1)
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? bruto
  const desde = Math.floor(min / paso) * paso
  const hasta = Math.ceil(max / paso) * paso
  const lista: number[] = []
  for (let v = desde; v <= hasta + paso / 2; v += paso) lista.push(v)
  return lista
}

const fechaCorta = (f: string) =>
  new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(
    new Date(`${f}T00:00:00`),
  )

// Evolución del peso de un animal: una línea en el tiempo, con la pesada más cercana al puntero
// (o al dedo) destacada. La lista de pesadas de la tarjeta hace de tabla de datos.
export function GraficoPeso({ pesadas }: { pesadas: Punto[] }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(320)
  const [activa, setActiva] = useState<number | null>(null)

  useEffect(() => {
    const el = contenedor.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(([e]) => e && setAncho(Math.round(e.contentRect.width)))
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const primera = pesadas[0]
  const ultima = pesadas.at(-1)
  if (!primera || !ultima || pesadas.length < 2) return null

  const kgs = pesadas.map((p) => p.kg)
  const ejeY = marcas(Math.min(...kgs), Math.max(...kgs))
  const yMin = ejeY[0] ?? 0
  const yMax = ejeY.at(-1) ?? 1
  const totalDias = Math.max(diasEntre(primera.fecha, ultima.fecha), 1)
  const anchoUtil = ancho - MARGEN.izquierda - MARGEN.derecha
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo
  const x = (p: Pesada) =>
    MARGEN.izquierda + (diasEntre(primera.fecha, p.fecha) / totalDias) * anchoUtil
  const y = (kg: number) => MARGEN.arriba + (1 - (kg - yMin) / (yMax - yMin || 1)) * altoUtil
  const linea = pesadas.map((p, i) => `${i ? 'L' : 'M'}${x(p)},${y(p.kg)}`).join(' ')

  const apuntar = (e: PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - caja.left
    let cercana = 0
    pesadas.forEach((p, i) => {
      if (Math.abs(x(p) - px) < Math.abs(x(pesadas[cercana] ?? p) - px)) cercana = i
    })
    setActiva(cercana)
  }

  const p = activa === null ? null : pesadas[activa]

  return (
    <div ref={contenedor} className={estilos.grafico}>
      <svg
        width={ancho}
        height={ALTO}
        role="img"
        aria-label={`Evolución del peso: de ${kilos(primera.kg)} el ${fecha(primera.fecha)} a ${kilos(ultima.kg)} el ${fecha(ultima.fecha)}`}
        onPointerMove={apuntar}
        onPointerDown={apuntar}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActiva(null)}
      >
        {ejeY.map((v) => (
          <g key={v}>
            <line
              className={estilos.rejilla}
              x1={MARGEN.izquierda}
              x2={ancho - MARGEN.derecha}
              y1={y(v)}
              y2={y(v)}
            />
            <text
              className={estilos.eje}
              x={MARGEN.izquierda - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
            >
              {numero(v)}
            </text>
          </g>
        ))}
        <text className={estilos.eje} x={MARGEN.izquierda} y={ALTO - 8}>
          {fechaCorta(primera.fecha)}
        </text>
        <text className={estilos.eje} x={ancho - MARGEN.derecha} y={ALTO - 8} textAnchor="end">
          {fechaCorta(ultima.fecha)}
        </text>
        {p && (
          <line
            className={estilos.guia}
            x1={x(p)}
            x2={x(p)}
            y1={MARGEN.arriba}
            y2={ALTO - MARGEN.abajo}
          />
        )}
        <path className={estilos.linea} d={linea} />
        {pesadas.map((q, i) => (
          <circle
            key={q.id}
            className={estilos.punto}
            cx={x(q)}
            cy={y(q.kg)}
            r={i === activa ? 6 : 4}
          />
        ))}
      </svg>
      {p && (
        <div
          className={estilos.detalle}
          role="status"
          style={{
            left: Math.min(Math.max(x(p), 80), ancho - 80),
          }}
        >
          <strong>{kilos(p.kg, p.kg % 1 ? 1 : 0)}</strong>
          <span>{fecha(p.fecha)}</span>
          {p.ganancia !== null && <span>{ganancia(p.ganancia)}</span>}
        </div>
      )}
    </div>
  )
}
