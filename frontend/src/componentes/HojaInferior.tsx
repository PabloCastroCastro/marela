import { X } from 'lucide-react'
import { type PointerEvent, type ReactNode, useId, useRef, useState } from 'react'
import { BotonIcono } from './Boton'
import { useDialogoModal } from './dialogo'
import estilos from './HojaInferior.module.css'

type Props = {
  abierta: boolean
  alCerrar: () => void
  titulo: string
  children: ReactNode
  // Botones fijos al pie, p. ej. Cancelar y Guardar
  pie?: ReactNode
}

// Distancia que hay que arrastrar el asa hacia abajo para cerrar la hoja
const UMBRAL_CIERRE = 80

// Formularios y detalles: en el móvil, hoja que sube desde abajo y se cierra arrastrando el asa; desde
// 40rem, diálogo centrado. Se cierra también con su botón, con Escape o tocando fuera.
export function HojaInferior({ abierta, alCerrar, titulo, children, pie }: Props) {
  const ref = useDialogoModal(abierta)
  const idTitulo = useId()
  const inicio = useRef<number | null>(null)
  const [desplazamiento, setDesplazamiento] = useState(0)

  const empezarArrastre = (e: PointerEvent<HTMLDivElement>) => {
    inicio.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const arrastrar = (e: PointerEvent<HTMLDivElement>) => {
    if (inicio.current !== null) setDesplazamiento(Math.max(0, e.clientY - inicio.current))
  }
  const soltar = () => {
    if (inicio.current === null) return
    inicio.current = null
    if (desplazamiento > UMBRAL_CIERRE) alCerrar()
    setDesplazamiento(0)
  }

  return (
    // Tocar fuera del panel (el fondo del <dialog>) lo cierra; con teclado se cierra con Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape lo gestiona el propio <dialog>
    <dialog
      ref={ref}
      className={estilos.hoja}
      aria-labelledby={idTitulo}
      style={desplazamiento ? { transform: `translateY(${desplazamiento}px)` } : undefined}
      onCancel={(e) => {
        e.preventDefault()
        alCerrar()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar()
      }}
    >
      <div className={estilos.panel}>
        <div
          className={estilos.asa}
          aria-hidden="true"
          onPointerDown={empezarArrastre}
          onPointerMove={arrastrar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
        />
        <header className={estilos.cabecera}>
          <h2 id={idTitulo}>{titulo}</h2>
          <BotonIcono etiqueta="Cerrar" icono={<X aria-hidden size={22} />} onClick={alCerrar} />
        </header>
        <div className={estilos.cuerpo}>{children}</div>
        {pie && <footer className={estilos.pie}>{pie}</footer>}
      </div>
    </dialog>
  )
}
