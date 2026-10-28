import { Check, Minus } from 'lucide-react'
import type { InputHTMLAttributes, Ref } from 'react'
import estilos from './Casilla.module.css'
import { clases } from './clases'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  etiqueta: string
  // La etiqueta solo para lectores de pantalla, cuando el contexto ya la da (una fila de tabla)
  ocultarEtiqueta?: boolean
  // Parte de las opciones marcadas: "seleccionar todos" con algunas filas elegidas
  indeterminada?: boolean
  ref?: Ref<HTMLInputElement>
}

// Casilla de verificación con un área táctil de 48 px. Vacía, con borde fuerte; marcada, con el
// relleno primario y el check en el color sobre primario.
export function Casilla({ etiqueta, ocultarEtiqueta, indeterminada, className, ...resto }: Props) {
  return (
    <label className={clases(estilos.casilla, className)}>
      <input
        type="checkbox"
        className={estilos.control}
        aria-checked={indeterminada ? 'mixed' : undefined}
        data-indeterminada={indeterminada || undefined}
        {...resto}
      />
      <span className={estilos.caja} aria-hidden>
        {indeterminada ? <Minus size={16} strokeWidth={3} /> : <Check size={16} strokeWidth={3} />}
      </span>
      <span className={ocultarEtiqueta ? estilos.oculta : undefined}>{etiqueta}</span>
    </label>
  )
}
