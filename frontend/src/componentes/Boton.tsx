import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import estilos from './Boton.module.css'
import { clases } from './clases'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'texto' | 'peligro'
  // 36, 48 (por defecto) o 56 px de alto
  tamano?: 'compacto' | 'normal' | 'grande'
  // Muestra un indicador y desactiva el botón mientras dura una acción
  cargando?: boolean
  icono?: ReactNode
  anchoCompleto?: boolean
  ref?: Ref<HTMLButtonElement>
}

// Botón con texto: el texto es un verbo ("Guardar parto"). Una sola acción primaria por pantalla.
export function Boton({
  variante = 'primario',
  tamano = 'normal',
  cargando = false,
  icono,
  anchoCompleto = false,
  disabled,
  className,
  children,
  type = 'button',
  ...resto
}: Props) {
  return (
    <button
      type={type}
      className={clases(
        estilos.boton,
        estilos[variante],
        estilos[tamano],
        anchoCompleto && estilos.anchoCompleto,
        className,
      )}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando ? <LoaderCircle className={estilos.girando} aria-hidden size={20} /> : icono}
      {children}
    </button>
  )
}

type PropsIcono = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  // Texto para lectores de pantalla y de la ayuda al pasar el ratón: obligatorio
  etiqueta: string
  icono: ReactNode
  ref?: Ref<HTMLButtonElement>
}

// Botón de solo icono, de 48 × 48 px
export function BotonIcono({ etiqueta, icono, className, type = 'button', ...resto }: PropsIcono) {
  return (
    <button
      type={type}
      className={clases(estilos.boton, estilos.icono, className)}
      aria-label={etiqueta}
      title={etiqueta}
      {...resto}
    >
      {icono}
    </button>
  )
}
