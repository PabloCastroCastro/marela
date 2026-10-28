import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Casilla } from './Casilla'
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
//
// Con `seleccion`, cada fila lleva una casilla y pulsarla la marca en lugar de abrirla.

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
  // Modo selección: las claves de las filas marcadas y el nombre de cada fila para su casilla
  seleccion?: {
    claves: ReadonlySet<string>
    alCambiar: (claves: Set<string>) => void
    etiquetaFila: (fila: T) => string
  }
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
  alSeleccionar: alAbrir,
  seleccion,
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

  const marcada = (fila: T) => seleccion?.claves.has(claveFila(fila)) ?? false
  const alternar = (fila: T) => {
    if (!seleccion) return
    const claves = new Set(seleccion.claves)
    const clave = claveFila(fila)
    if (claves.has(clave)) claves.delete(clave)
    else claves.add(clave)
    seleccion.alCambiar(claves)
  }
  const todas = filas.length > 0 && filas.every(marcada)
  const alguna = filas.some(marcada)
  // En modo selección, pulsar la fila la marca; la casilla ya lo hace por sí sola
  const alSeleccionar = seleccion
    ? (fila: T, e?: { target: EventTarget }) => {
        if (!(e?.target instanceof Element && e.target.closest('label'))) alternar(fila)
      }
    : alAbrir

  const principal = columnas.find((c) => c.principal) ?? columnas[0]
  const resto = columnas.filter((c) => c !== principal)

  return (
    <>
      <table className={estilos.tabla} aria-label={etiqueta}>
        <thead>
          <tr>
            {seleccion && (
              <th scope="col" className={estilos.columnaCasilla}>
                <Casilla
                  etiqueta="Seleccionar todos"
                  ocultarEtiqueta
                  checked={todas}
                  indeterminada={alguna && !todas}
                  onChange={() =>
                    seleccion.alCambiar(todas ? new Set() : new Set(filas.map(claveFila)))
                  }
                />
              </th>
            )}
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
              className={clases(
                alSeleccionar && estilos.seleccionable,
                marcada(fila) && estilos.marcada,
              )}
              // Con teclado se usa el botón de la columna principal, o la casilla; el clic en la fila
              // es un atajo
              onClick={alSeleccionar ? (e) => alSeleccionar(fila, e) : undefined}
            >
              {seleccion && (
                <td className={estilos.columnaCasilla}>
                  <Casilla
                    etiqueta={`Seleccionar ${seleccion.etiquetaFila(fila)}`}
                    ocultarEtiqueta
                    checked={marcada(fila)}
                    onChange={() => alternar(fila)}
                  />
                </td>
              )}
              {columnas.map((c) => (
                <td key={c.clave} className={clases(c.numerica && estilos.numerica)}>
                  {c === principal && alAbrir && !seleccion ? (
                    <button
                      type="button"
                      className={estilos.enlace}
                      onClick={(e) => {
                        e.stopPropagation()
                        alAbrir(fila)
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
              {seleccion ? (
                // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: con teclado se usa la casilla; el clic en la tarjeta es un atajo
                <div
                  className={clases(
                    estilos.tarjeta,
                    estilos.tarjetaBoton,
                    marcada(fila) && estilos.marcada,
                  )}
                  onClick={(e) => alSeleccionar?.(fila, e)}
                >
                  <Casilla
                    etiqueta={`Seleccionar ${seleccion.etiquetaFila(fila)}`}
                    ocultarEtiqueta
                    checked={marcada(fila)}
                    onChange={() => alternar(fila)}
                    className={estilos.casillaTarjeta}
                  />
                  <span className={estilos.contenido}>{contenido}</span>
                </div>
              ) : alSeleccionar ? (
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
