import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { clases } from './clases'
import estilos from './Tabla.module.css'

// Tabla con ordenación en pantalla ancha que se convierte en una lista de tarjetas en el móvil:
//
//   <Tabla
//     etiqueta="Animales"
//     filas={animales}
//     claveFila={(a) => a.id}
//     columnas={[
//       { clave: 'crotal', titulo: 'Crotal', valor: (a) => a.crotal, ordenar: (a) => a.crotal, principal: true },
//       { clave: 'peso', titulo: 'Peso', valor: (a) => `${a.peso} kg`, ordenar: (a) => a.peso, numerica: true },
//     ]}
//     alSeleccionar={(a) => navegar(`/animales/${a.id}`)}
//   />

export type Columna<T> = {
  clave: string
  titulo: string
  valor: (fila: T) => ReactNode
  // Valor por el que se ordena; sin él, la columna no se puede ordenar
  ordenar?: (fila: T) => string | number | Date | null | undefined
  // Cifras: alineadas a la derecha y con números tabulares
  numerica?: boolean
  // Título de la tarjeta en el móvil (una columna por tabla)
  principal?: boolean
}

type Orden = { clave: string; sentido: 'asc' | 'desc' }

type Props<T> = {
  // Nombre de la tabla para los lectores de pantalla
  etiqueta: string
  columnas: Columna<T>[]
  filas: T[]
  claveFila: (fila: T) => string
  ordenInicial?: Orden
  // Si se indica, cada fila abre su detalle
  alSeleccionar?: (fila: T) => void
}

const comparar = (a: unknown, b: unknown) => {
  // Los vacíos van siempre al final
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
  }
  return Number(a) - Number(b)
}

export function Tabla<T>({
  etiqueta,
  columnas,
  filas,
  claveFila,
  ordenInicial,
  alSeleccionar,
}: Props<T>) {
  const [orden, setOrden] = useState<Orden | undefined>(ordenInicial)

  const ordenadas = useMemo(() => {
    const columna = columnas.find((c) => c.clave === orden?.clave)
    if (!orden || !columna?.ordenar) return filas
    const valor = columna.ordenar
    const signo = orden.sentido === 'asc' ? 1 : -1
    return [...filas].sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      // Los vacíos al final también en orden descendente
      if (va === null || va === undefined || vb === null || vb === undefined)
        return comparar(va, vb)
      return signo * comparar(va, vb)
    })
  }, [filas, columnas, orden])

  const cambiarOrden = (clave: string) =>
    setOrden((actual) =>
      actual?.clave === clave && actual.sentido === 'asc'
        ? { clave, sentido: 'desc' }
        : { clave, sentido: 'asc' },
    )

  const principal = columnas.find((c) => c.principal) ?? columnas[0]
  const resto = columnas.filter((c) => c !== principal)

  return (
    <>
      <table className={estilos.tabla} aria-label={etiqueta}>
        <thead>
          <tr>
            {columnas.map((c) => {
              const sentido = orden?.clave === c.clave ? orden.sentido : undefined
              return (
                <th
                  key={c.clave}
                  scope="col"
                  className={clases(c.numerica && estilos.numerica)}
                  aria-sort={
                    sentido === 'asc' ? 'ascending' : sentido === 'desc' ? 'descending' : undefined
                  }
                >
                  {c.ordenar ? (
                    <button
                      type="button"
                      className={estilos.ordenar}
                      onClick={() => cambiarOrden(c.clave)}
                    >
                      {c.titulo}
                      {sentido === 'asc' ? (
                        <ArrowUp aria-hidden size={16} />
                      ) : sentido === 'desc' ? (
                        <ArrowDown aria-hidden size={16} />
                      ) : (
                        <ArrowUpDown aria-hidden size={16} className={estilos.sinOrden} />
                      )}
                    </button>
                  ) : (
                    c.titulo
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((fila) => (
            <tr
              key={claveFila(fila)}
              className={clases(alSeleccionar && estilos.seleccionable)}
              // Con teclado se usa el botón de la columna principal; el clic en la fila es un atajo
              onClick={alSeleccionar ? () => alSeleccionar(fila) : undefined}
            >
              {columnas.map((c) => (
                <td key={c.clave} className={clases(c.numerica && estilos.numerica)}>
                  {c === principal && alSeleccionar ? (
                    <button
                      type="button"
                      className={estilos.enlace}
                      onClick={(e) => {
                        e.stopPropagation()
                        alSeleccionar(fila)
                      }}
                    >
                      {c.valor(fila)}
                    </button>
                  ) : (
                    c.valor(fila)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={estilos.tarjetas} aria-label={etiqueta}>
        {ordenadas.map((fila) => {
          const contenido = (
            <>
              <span className={estilos.titulo}>{principal?.valor(fila)}</span>
              {resto.length > 0 && (
                <dl className={estilos.datos}>
                  {resto.map((c) => (
                    <div key={c.clave} className={estilos.dato}>
                      <dt>{c.titulo}</dt>
                      <dd className={clases(c.numerica && estilos.cifra)}>{c.valor(fila)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )
          return (
            <li key={claveFila(fila)}>
              {alSeleccionar ? (
                <button
                  type="button"
                  className={clases(estilos.tarjeta, estilos.tarjetaBoton)}
                  onClick={() => alSeleccionar(fila)}
                >
                  <span className={estilos.contenido}>{contenido}</span>
                  <ChevronRight aria-hidden size={20} className={estilos.flecha} />
                </button>
              ) : (
                <div className={estilos.tarjeta}>
                  <span className={estilos.contenido}>{contenido}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
