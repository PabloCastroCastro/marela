import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { CLAVE_COMIDA, cantidad } from '../comida/datos'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Selector } from '../componentes/Campo'
import { Casilla } from '../componentes/Casilla'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import { CLAVE_FINANZAS, type Factura } from './datos'
import estilos from './Finanzas.module.css'

type EntradaFactura = Factura['entradasComida'][number]

// "Pienso de engorde · 01/10/2026 · 500 kg"
const descripcion = (e: EntradaFactura) =>
  `${e.almacen.nombre} · ${fecha(e.fecha)} · ${cantidad(e.cantidad, e.almacen.unidad)}`

// Las entradas de comida compradas con una factura recibida (GH-36), con un enlace a su almacén, y el
// botón para elegirlas
export function TarjetaEntradasComida({ factura }: { factura: Factura }) {
  const explotacion = useExplotacionActual()
  const [eligiendo, setEligiendo] = useState(false)
  return (
    <Tarjeta aria-labelledby="factura-entradas" className={estilos.tarjeta}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="factura-entradas" className={estilos.tituloTarjeta}>
          Entradas de comida
        </h2>
        <Boton
          variante="secundario"
          tamano="compacto"
          icono={<Link2 aria-hidden size={18} />}
          onClick={() => setEligiendo(true)}
        >
          Asociar entradas
        </Boton>
      </div>
      {factura.entradasComida.length === 0 ? (
        <p className={estilos.suave}>
          Si es una compra de comida, asocia las entradas de los almacenes que paga.
        </p>
      ) : (
        <ul className={estilos.enlaces} aria-label="Entradas de comida de la factura">
          {factura.entradasComida.map((e) => (
            <li key={e.id}>
              <Link to={`${rutaExplotacion(explotacion.id)}/comida/${e.almacen.id}`}>
                {descripcion(e)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {eligiendo && <ElegirEntradas factura={factura} alCerrar={() => setEligiendo(false)} />}
    </Tarjeta>
  )
}

// Las compras de todos los almacenes que aún no tienen factura, y las de esta, para marcarlas
function ElegirEntradas({ factura, alCerrar }: { factura: Factura; alCerrar: () => void }) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [almacenId, setAlmacenId] = useState('')
  const [elegidas, setElegidas] = useState(() => new Set(factura.entradasComida.map((e) => e.id)))
  const compras = useQuery({
    queryKey: [...CLAVE_FINANZAS, explotacion.id, 'entradas-comida'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/entradas-comida', {
          params: { path: { explotacionId: explotacion.id }, query: { origen: 'compra' } },
        }),
      ),
  })
  const disponibles = (compras.data ?? []).filter((e) => !e.factura || e.factura.id === factura.id)
  const almacenes = [...new Map(disponibles.map((e) => [e.almacen.id, e.almacen])).values()]
  const visibles = disponibles.filter((e) => !almacenId || e.almacen.id === almacenId)

  const guardar = useMutation({
    mutationFn: (movimientoIds: string[]) =>
      datos(
        api.PUT('/api/explotaciones/{explotacionId}/facturas/{facturaId}/entradas-comida', {
          params: { path: { explotacionId: explotacion.id, facturaId: factura.id } },
          body: { movimientoIds },
        }),
      ),
    onSuccess: async (f) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })
      // Los almacenes muestran la factura de cada entrada
      await cliente.invalidateQueries({ queryKey: [...CLAVE_COMIDA, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje:
          f.entradasComida.length === 1
            ? '1 entrada de comida en la factura'
            : `${f.entradasComida.length} entradas de comida en la factura`,
      })
      alCerrar()
    },
  })
  const error = erroresPorCampo(guardar.error).movimientoIds ?? guardar.error?.message

  const cambiar = (id: string, marcada: boolean) =>
    setElegidas((actuales) => {
      const nuevas = new Set(actuales)
      if (marcada) nuevas.add(id)
      else nuevas.delete(id)
      return nuevas
    })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    guardar.mutate([...elegidas])
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo="Entradas de comida"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-entradas" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-entradas" className={estilos.formulario} onSubmit={enviar} noValidate>
        {error && (
          <p className={estilos.error} role="alert">
            {error}
          </p>
        )}
        <p className={estilos.suave}>
          Las compras de comida que paga la factura {factura.numero}. Solo salen las que aún no
          tienen factura.
        </p>
        {compras.isPending ? (
          <Esqueleto bloques={[{ alto: '3rem' }, { alto: '3rem' }, { alto: '3rem' }]} />
        ) : compras.isError ? (
          <EstadoError alReintentar={() => compras.refetch()} reintentando={compras.isFetching} />
        ) : disponibles.length === 0 ? (
          <p className={estilos.suave}>No hay compras de comida sin factura en los almacenes.</p>
        ) : (
          <>
            {almacenes.length > 1 && (
              <Selector
                etiqueta="Almacén"
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
              >
                <option value="">Todos</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </Selector>
            )}
            <ul className={estilos.casillas} aria-label="Compras de comida">
              {visibles.map((e) => (
                <li key={e.id}>
                  <Casilla
                    etiqueta={descripcion(e)}
                    checked={elegidas.has(e.id)}
                    onChange={(ev) => cambiar(e.id, ev.target.checked)}
                  />
                  {e.observaciones && <span className={estilos.suave}>{e.observaciones}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </form>
    </HojaInferior>
  )
}
