import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react'
import estilos from './Campo.module.css'
import { clases } from './clases'

// Campos de formulario con etiqueta visible encima, y ayuda y error debajo, asociados al control con
// aria-describedby. Nunca se usa el placeholder como etiqueta.

type Comunes = {
  etiqueta: string
  // Mensaje de error: marca el campo como inválido y lo anuncia a los lectores de pantalla
  error?: string
  ayuda?: string
}

type Envoltorio = Comunes & {
  id: string
  requerido?: boolean
  className?: string
  children: (descripcion: string | undefined) => ReactNode
}

function Envoltorio({ id, etiqueta, ayuda, error, requerido, className, children }: Envoltorio) {
  const idAyuda = `${id}-ayuda`
  const idError = `${id}-error`
  const descripcion = clases(ayuda && idAyuda, error && idError) || undefined
  return (
    <div className={clases(estilos.campo, className)}>
      <label htmlFor={id} className={estilos.etiqueta}>
        {etiqueta}
        {requerido && <span aria-hidden="true"> *</span>}
      </label>
      {children(descripcion)}
      {ayuda && (
        <p id={idAyuda} className={estilos.ayuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className={estilos.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type PropsCampo = InputHTMLAttributes<HTMLInputElement> & Comunes & { ref?: Ref<HTMLInputElement> }

// Teclado del móvil: inputMode="decimal" en pesos y cantidades, inputMode="numeric" en crotales
export function Campo({ etiqueta, error, ayuda, id, className, ...resto }: PropsCampo) {
  const generado = useId()
  const idCampo = id ?? generado
  return (
    <Envoltorio
      id={idCampo}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      requerido={resto.required}
      className={className}
    >
      {(descripcion) => (
        <input
          id={idCampo}
          className={estilos.control}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          {...resto}
        />
      )}
    </Envoltorio>
  )
}

// Fecha con el selector nativo del sistema (valor en formato aaaa-mm-dd)
export function CampoFecha(props: Omit<PropsCampo, 'type'>) {
  return <Campo type="date" {...props} />
}

type PropsAreaTexto = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Comunes & { ref?: Ref<HTMLTextAreaElement> }

export function AreaTexto({ etiqueta, error, ayuda, id, className, ...resto }: PropsAreaTexto) {
  const generado = useId()
  const idCampo = id ?? generado
  return (
    <Envoltorio
      id={idCampo}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      requerido={resto.required}
      className={className}
    >
      {(descripcion) => (
        <textarea
          id={idCampo}
          rows={3}
          className={clases(estilos.control, estilos.area)}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          {...resto}
        />
      )}
    </Envoltorio>
  )
}

type PropsSelector = SelectHTMLAttributes<HTMLSelectElement> &
  Comunes & { children: ReactNode; ref?: Ref<HTMLSelectElement> }

// Desplegable nativo con el mismo aspecto que Campo
export function Selector({
  etiqueta,
  error,
  ayuda,
  id,
  className,
  children,
  ...resto
}: PropsSelector) {
  const generado = useId()
  const idCampo = id ?? generado
  return (
    <Envoltorio
      id={idCampo}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={error}
      requerido={resto.required}
      className={className}
    >
      {(descripcion) => (
        <select
          id={idCampo}
          className={clases(estilos.control, estilos.selector)}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcion}
          {...resto}
        >
          {children}
        </select>
      )}
    </Envoltorio>
  )
}
