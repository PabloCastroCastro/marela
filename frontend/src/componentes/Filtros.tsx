import { Search, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { BotonIcono } from './Boton'
import estilos from './Filtros.module.css'

// Barra de filtros de un listado: buscador arriba y, debajo, los demás filtros (chips, fechas,
// desplegables). En pantalla ancha, todo en una fila.
//
//   <BarraFiltros buscador={<Buscador etiqueta="Buscar animal" alCambiar={setTexto} />}>
//     <Chips etiqueta="Tipo" … />
//     <CampoFecha etiqueta="Desde" … />
//   </BarraFiltros>
export function BarraFiltros({
  buscador,
  children,
}: {
  buscador?: ReactNode
  children?: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: search aún no lo anuncian todos los lectores
    <div className={estilos.barra} role="search">
      {buscador}
      {children && <div className={estilos.filtros}>{children}</div>}
    </div>
  )
}

export const ESPERA_BUSCADOR = 300

type PropsBuscador = {
  // Nombre del buscador para los lectores de pantalla ("Buscar por crotal o nombre")
  etiqueta: string
  valorInicial?: string
  // Recibe el texto 300 ms después de dejar de escribir, o al borrarlo
  alCambiar: (texto: string) => void
}

export function Buscador({ etiqueta, valorInicial = '', alCambiar }: PropsBuscador) {
  const [texto, setTexto] = useState(valorInicial)
  const alCambiarActual = useRef(alCambiar)
  alCambiarActual.current = alCambiar
  const primera = useRef(true)

  useEffect(() => {
    // No se avisa del valor inicial
    if (primera.current) {
      primera.current = false
      return
    }
    const temporizador = setTimeout(() => alCambiarActual.current(texto.trim()), ESPERA_BUSCADOR)
    return () => clearTimeout(temporizador)
  }, [texto])

  return (
    <div className={estilos.buscador}>
      <Search aria-hidden size={20} className={estilos.lupa} />
      <input
        type="search"
        className={estilos.entrada}
        aria-label={etiqueta}
        placeholder={etiqueta}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {texto && (
        <BotonIcono
          etiqueta="Borrar la búsqueda"
          icono={<X aria-hidden size={18} />}
          className={estilos.borrar}
          onClick={() => {
            setTexto('')
            alCambiarActual.current('')
          }}
        />
      )}
    </div>
  )
}
