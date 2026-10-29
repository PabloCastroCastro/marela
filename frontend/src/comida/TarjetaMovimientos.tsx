import { Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { BotonIcono } from '../componentes/Boton'
import { CampoFecha } from '../componentes/Campo'
import { clases } from '../componentes/clases'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Chips, Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha, hoy } from '../formato'
import estilos from './Comida.module.css'
import {
  type Almacen,
  cantidad,
  diferencia,
  type Movimiento,
  ORIGENES_ENTRADA,
  type TipoMovimiento,
  useMovimientos,
} from './datos'
import { FormularioMovimiento } from './FormularioMovimiento'

// Con los años, un almacén acumula cientos de raciones: a la vista, las más recientes
const VISIBLES = 20

type FiltroTipo = TipoMovimiento | 'todos'

// "Entrada · Compra", "Entrada · Producción propia (Agra de abaixo)", "Salida", "Recuento"
const titulo = (m: Movimiento) =>
  m.tipo === 'entrada'
    ? `Entrada · ${m.origen ? ORIGENES_ENTRADA[m.origen] : ''}${m.finca ? ` (${m.finca.nombre})` : ''}`
    : m.tipo === 'salida'
      ? 'Salida'
      : m.ajuste === 'recuento'
        ? 'Recuento'
        : 'Merma'

// Historial de movimientos de un almacén, del más reciente al más antiguo, con filtros de fecha y
// tipo (GH-30). Cada uno, con lo que cambió el stock y el stock que dejó; se corrige con el lápiz.
export function TarjetaMovimientos({ almacen }: { almacen: Almacen }) {
  const explotacion = useExplotacionActual()
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const movimientos = useMovimientos(explotacion.id, almacen.id, {
    tipo: tipo === 'todos' ? undefined : tipo,
    desde: desde || undefined,
    hasta: hasta || undefined,
  })
  const recorte = useRecorte(movimientos.data ?? [], VISIBLES)
  const [corrigiendo, setCorrigiendo] = useState<Movimiento>()
  const filtrado = tipo !== 'todos' || desde !== '' || hasta !== ''

  let contenido: ReactNode
  if (movimientos.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }, { alto: '4rem' }]} />
  } else if (movimientos.isError) {
    contenido = (
      <EstadoError
        alReintentar={() => movimientos.refetch()}
        reintentando={movimientos.isFetching}
      />
    )
  } else if (movimientos.data.length === 0) {
    contenido = (
      <p className={estilos.suave}>
        {filtrado ? 'Ningún movimiento coincide con los filtros' : 'Sin movimientos registrados'}
      </p>
    )
  } else {
    contenido = (
      <ul className={estilos.registros} aria-label="Movimientos">
        {recorte.elementos.map((m) => (
          <li key={m.id}>
            <div>
              <span className={estilos.tituloRegistro}>{titulo(m)}</span>
              <span className={estilos.suave}>{fecha(m.fecha)}</span>
              {m.motivo && <span className={estilos.suave}>{m.motivo}</span>}
              {m.observaciones && <span className={estilos.suave}>{m.observaciones}</span>}
            </div>
            <div className={estilos.cifras}>
              <span
                className={clases(
                  estilos.diferencia,
                  m.diferencia < 0 ? estilos.baja : m.diferencia > 0 && estilos.sube,
                )}
              >
                {diferencia(m.diferencia, almacen.unidad)}
              </span>
              <span className={clases(estilos.suave, m.stock < 0 && estilos.negativo)}>
                Quedan {cantidad(m.stock, almacen.unidad)}
              </span>
            </div>
            <BotonIcono
              etiqueta={`Corregir ${titulo(m).toLowerCase()} del ${fecha(m.fecha)}`}
              icono={<Pencil aria-hidden size={18} />}
              onClick={() => setCorrigiendo(m)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Tarjeta aria-labelledby="almacen-movimientos" className={estilos.tarjetaRegistros}>
      <h2 id="almacen-movimientos" className={estilos.tituloTarjeta}>
        Movimientos
      </h2>
      <div className={estilos.filtros}>
        <Chips
          etiqueta="Tipo de movimiento"
          envolver
          opciones={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'entrada', texto: 'Entradas' },
            { valor: 'salida', texto: 'Salidas' },
            { valor: 'ajuste', texto: 'Ajustes' },
          ]}
          seleccion={tipo}
          alCambiar={setTipo}
        />
        <div className={estilos.fechas}>
          <CampoFecha
            etiqueta="Desde"
            value={desde}
            max={hasta || hoy()}
            onChange={(e) => setDesde(e.target.value)}
          />
          <CampoFecha
            etiqueta="Hasta"
            value={hasta}
            min={desde || undefined}
            max={hoy()}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
      </div>
      {contenido}
      {recorte.boton}
      {corrigiendo && (
        <FormularioMovimiento
          almacen={almacen}
          tipo={corrigiendo.tipo}
          movimiento={corrigiendo}
          alCerrar={() => setCorrigiendo(undefined)}
        />
      )}
    </Tarjeta>
  )
}
