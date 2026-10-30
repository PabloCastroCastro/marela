import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { consultaAnimales, type FiltrosAnimales, identificacion } from '../animales/datos'
import { Boton } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Finanzas.module.css'

export type AnimalElegido = { id: string; crotal: string | null; nombre?: string | null }

// Buscar un animal por crotal o nombre y añadirlo: los animales comprados con una factura (GH-35) o
// los de una venta (GH-38). Se ofrecen los cinco primeros que coinciden y no están ya elegidos.
export function BuscarAnimal({
  elegidos,
  alElegir,
  filtros = {},
  ayuda,
  error,
}: {
  elegidos: AnimalElegido[]
  alElegir: (animal: AnimalElegido) => void
  filtros?: FiltrosAnimales
  ayuda?: string
  error?: string
}) {
  const explotacion = useExplotacionActual()
  const [q, setQ] = useState('')
  const buscando = q.trim().length >= 2
  const encontrados = useQuery({
    ...consultaAnimales(explotacion.id, { ...filtros, q: q.trim() }),
    enabled: buscando,
  })
  const elegibles = (encontrados.data ?? [])
    .filter((a) => !elegidos.some((e) => e.id === a.id))
    .slice(0, 5)

  return (
    <>
      <Campo
        etiqueta="Buscar animal"
        ayuda={ayuda}
        type="search"
        autoComplete="off"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        error={error}
      />
      {buscando && encontrados.data && (
        <ul className={estilos.encontrados} aria-label="Animales encontrados">
          {elegibles.length === 0 ? (
            <li className={estilos.suave}>Ningún animal coincide</li>
          ) : (
            elegibles.map((a) => (
              <li key={a.id}>
                <Boton
                  variante="texto"
                  tamano="compacto"
                  icono={<Plus aria-hidden size={18} />}
                  onClick={() => {
                    alElegir(a)
                    setQ('')
                  }}
                >
                  {identificacion(a)}
                </Boton>
              </li>
            ))
          )}
        </ul>
      )}
    </>
  )
}
