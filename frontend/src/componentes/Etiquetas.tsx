import { Check } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { clases } from './clases'
import estilos from './Etiquetas.module.css'

// Insignias de estado, chips de selección y tarjetas

type PropsInsignia = {
  tipo?: 'neutro' | 'exito' | 'aviso' | 'peligro' | 'informacion'
  // Siempre con icono además del color ("Gestante", "En tratamiento", "Vendido")
  icono?: ReactNode
  children: ReactNode
}

export function Insignia({ tipo = 'neutro', icono, children }: PropsInsignia) {
  return (
    <span className={clases(estilos.insignia, estilos[tipo])}>
      {icono}
      {children}
    </span>
  )
}

type PropsChip = {
  seleccionado: boolean
  alPulsar: () => void
  children: ReactNode
}

// Chip de filtro: alterna su selección. 32 px de alto con un área táctil de 48 px.
export function Chip({ seleccionado, alPulsar, children }: PropsChip) {
  return (
    <button
      type="button"
      className={clases(estilos.chip, seleccionado && estilos.seleccionado)}
      aria-pressed={seleccionado}
      onClick={alPulsar}
    >
      {seleccionado && <Check aria-hidden size={16} />}
      {children}
    </button>
  )
}

type PropsChips<T extends string> = {
  // Nombre del grupo para los lectores de pantalla
  etiqueta: string
  opciones: { valor: T; texto: string }[]
  seleccion: T
  alCambiar: (valor: T) => void
  // En varias filas en lugar de desplazarse en horizontal, para que se vean todas las opciones
  envolver?: boolean
}

// Grupo de chips con una sola opción seleccionada (Todos, Vacas, Terneros…)
export function Chips<T extends string>({
  etiqueta,
  opciones,
  seleccion,
  alCambiar,
  envolver,
}: PropsChips<T>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: un fieldset no admite el diseño en fila con desplazamiento
    <div
      className={clases(estilos.chips, envolver && estilos.envolver)}
      role="group"
      aria-label={etiqueta}
    >
      {opciones.map((o) => (
        <Chip
          key={o.valor}
          seleccionado={o.valor === seleccion}
          alPulsar={() => alCambiar(o.valor)}
        >
          {o.texto}
        </Chip>
      ))}
    </div>
  )
}

// Contenedor de contenido agrupado: fondo, borde y 16 px de margen interior
export function Tarjeta({ className, ...resto }: HTMLAttributes<HTMLElement>) {
  return <section className={clases(estilos.tarjeta, className)} {...resto} />
}
