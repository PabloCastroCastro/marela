import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Boton } from './Boton'

// Las listas de las fichas (reproducción, tratamientos, pesadas, labores) muestran solo lo más
// reciente: con los años, una vaca o una finca acumula decenas de registros. El resto, con "Ver todos".
export const VISIBLES = 3

export function useRecorte<T>(lista: T[], visibles = VISIBLES) {
  const [todo, setTodo] = useState(false)
  const recortada = lista.length > visibles
  return {
    elementos: todo || !recortada ? lista : lista.slice(0, visibles),
    boton: recortada ? (
      <div>
        <Boton
          variante="texto"
          tamano="compacto"
          icono={todo ? <ChevronUp aria-hidden size={18} /> : <ChevronDown aria-hidden size={18} />}
          aria-expanded={todo}
          onClick={() => setTodo(!todo)}
        >
          {todo ? 'Ver menos' : `Ver todos (${lista.length})`}
        </Boton>
      </div>
    ) : null,
  }
}
