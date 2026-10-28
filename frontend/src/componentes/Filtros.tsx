import { ChevronDown, Search, X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { BotonIcono } from './Boton'
import { clases } from './clases'
import estilos from './Filtros.module.css'

// Barra de filtros de un listado: buscador a lo ancho y, debajo, una fila de filtros desplegables.
// En pantalla ancha, todo en una fila.
//
//   <BarraFiltros buscador={<Buscador etiqueta="Buscar animal" alCambiar={setTexto} />}>
//     <FiltroDesplegable etiqueta="Estado" opciones={…} valor={estado} porDefecto="activo" … />
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

type PropsDesplegable<T extends string> = {
  etiqueta: string
  opciones: { valor: T; texto: string }[]
  valor: T
  // Con otro valor, el filtro se marca para que se vea que está filtrando
  porDefecto: T
  alCambiar: (valor: T) => void
}

// Filtro compacto con forma de chip ("Estado: Activos ▾"). Por dentro es un desplegable nativo: en el
// móvil abre el selector del sistema, grande y cómodo con el dedo, y es accesible sin más.
export function FiltroDesplegable<T extends string>({
  etiqueta,
  opciones,
  valor,
  porDefecto,
  alCambiar,
}: PropsDesplegable<T>) {
  const id = useId()
  const actual = opciones.find((o) => o.valor === valor)
  return (
    <div className={clases(estilos.desplegable, valor !== porDefecto && estilos.marcado)}>
      <label htmlFor={id} className={estilos.texto}>
        {etiqueta}: <strong>{actual?.texto}</strong>
      </label>
      <ChevronDown aria-hidden size={16} className={estilos.flecha} />
      <select
        id={id}
        className={estilos.selector}
        value={valor}
        onChange={(e) => alCambiar(e.target.value as T)}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
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
