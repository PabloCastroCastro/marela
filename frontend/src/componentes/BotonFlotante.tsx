import type { ReactNode } from 'react'
import estilos from './BotonFlotante.module.css'

type Props = {
  // Texto para lectores de pantalla ("Añadir animal")
  etiqueta: string
  icono: ReactNode
  alPulsar: () => void
}

// Acción de crear en el móvil, al alcance del pulgar: 56 × 56 px, encima de la barra inferior. En
// pantalla ancha no se muestra: la acción va como botón junto al título.
export function BotonFlotante({ etiqueta, icono, alPulsar }: Props) {
  return (
    <button type="button" className={estilos.flotante} aria-label={etiqueta} onClick={alPulsar}>
      {icono}
    </button>
  )
}
