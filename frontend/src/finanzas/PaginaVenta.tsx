import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FilePlus, Pencil, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CLAVE_ANIMALES, identificacion } from '../animales/datos'
import { api, datos, ErrorApi, enviar } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Selector } from '../componentes/Campo'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, fecha, kilos, numero } from '../formato'
import { CLAVE_FINANZAS, MODOS_PRECIO, useFacturas, useVenta, type Venta } from './datos'
import estilos from './Finanzas.module.css'
import { FormularioFactura } from './FormularioFactura'
import { FormularioVenta } from './FormularioVenta'

// "4,125 €/kg", "900,00 € por animal", "1.986,19 € en total"
const precio = (v: Venta) =>
  v.modoPrecio === 'por_kg'
    ? `${numero(v.precio, 3)} €/kg`
    : v.modoPrecio === 'por_animal'
      ? `${euros(v.precio)} por animal`
      : `${euros(v.precio)} en total`

// Ficha de una venta de animales (GH-38): los animales con su peso y su importe, el precio, y la
// factura: elegir una emitida o crearla con los datos de la venta. Se corrige o se deshace (los
// animales vuelven a estar activos).
export function PaginaVenta() {
  const explotacion = useExplotacionActual()
  const { ventaId = '' } = useParams()
  const venta = useVenta(explotacion.id, ventaId)
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [editando, setEditando] = useState(false)
  const inicio = `${rutaExplotacion(explotacion.id)}/finanzas?vista=ventas`
  const ruta = { params: { path: { explotacionId: explotacion.id, ventaId } } }

  const deshacer = useMutation({
    mutationFn: () =>
      enviar(api.DELETE('/api/explotaciones/{explotacionId}/ventas/{ventaId}', ruta)),
    onSuccess: async () => {
      navegar(inicio)
      await Promise.all([
        cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] }),
        cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] }),
      ])
      avisar({ tipo: 'info', mensaje: 'Venta deshecha: los animales vuelven a estar activos' })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const volver = (
    <Link to={inicio} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      Ventas
    </Link>
  )

  if (venta.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '10rem' }]} />
      </section>
    )
  }
  if (venta.isError && !venta.data) {
    const noExiste = venta.error instanceof ErrorApi && venta.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Esta venta no está en la explotación"
            descripcion="Puede que se haya deshecho o que la dirección esté mal escrita."
          />
        ) : (
          <EstadoError alReintentar={() => venta.refetch()} reintentando={venta.isFetching} />
        )}
      </section>
    )
  }

  const v: Venta = venta.data
  const n = v.animales.length
  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>Venta a {v.comprador}</h1>
          <div className={estilos.insignias}>
            <span className={estilos.suave}>
              {fecha(v.fecha)} · {n === 1 ? '1 animal' : `${n} animales`}
            </span>
            {!v.factura && <Insignia tipo="aviso">Sin factura</Insignia>}
          </div>
        </div>
        <div className={estilos.acciones}>
          <Boton
            variante="secundario"
            icono={<Pencil aria-hidden size={18} />}
            onClick={() => setEditando(true)}
          >
            Corregir
          </Boton>
          <Boton
            variante="texto"
            className={estilos.peligro}
            icono={<Undo2 aria-hidden size={18} />}
            cargando={deshacer.isPending}
            onClick={async () => {
              const ok = await confirmar({
                titulo: '¿Deshacer la venta?',
                mensaje:
                  'Los animales vuelven a estar activos y se quitan sus pesadas de venta. La factura, si la tiene, se queda en Facturas. Queda en el historial.',
                textoConfirmar: 'Deshacer la venta',
                peligrosa: true,
              })
              if (ok) deshacer.mutate()
            }}
          >
            Deshacer la venta
          </Boton>
        </div>
      </div>

      <Tarjeta aria-labelledby="venta-importes" className={estilos.tarjeta}>
        <h2 id="venta-importes" className={estilos.tituloTarjeta}>
          Animales e importes
        </h2>
        <table className={estilos.tablaLineas}>
          <thead>
            <tr>
              <th scope="col">Animal</th>
              <th scope="col">Peso</th>
              <th scope="col">Importe</th>
            </tr>
          </thead>
          <tbody>
            {v.animales.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to={`${rutaExplotacion(explotacion.id)}/animales/${a.id}`}>
                    {identificacion(a)}
                  </Link>
                </td>
                <td>{a.kg !== null ? kilos(a.kg, 1) : '—'}</td>
                <td>{euros(a.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className={estilos.totales}>
          <div>
            <dt>Precio ({MODOS_PRECIO[v.modoPrecio].toLowerCase()})</dt>
            <dd>{precio(v)}</dd>
          </div>
          {v.kg !== null && (
            <div>
              <dt>Peso total</dt>
              <dd>{kilos(v.kg, 1)}</dd>
            </div>
          )}
          <div className={estilos.total}>
            <dt>Total, sin IVA ni compensación</dt>
            <dd>{euros(v.total)}</dd>
          </div>
        </dl>
      </Tarjeta>

      <TarjetaFactura venta={v} />

      {v.observaciones && (
        <Tarjeta aria-labelledby="venta-observaciones" className={estilos.tarjeta}>
          <h2 id="venta-observaciones" className={estilos.tituloTarjeta}>
            Observaciones
          </h2>
          <p className={estilos.descripcion}>{v.observaciones}</p>
        </Tarjeta>
      )}

      <p className={estilos.suave}>
        Registrada el {fecha(v.creadoEn)} · Última modificación el {fecha(v.modificadoEn)}
      </p>

      {editando && <FormularioVenta venta={v} alCerrar={() => setEditando(false)} />}
    </section>
  )
}

// La factura de la venta: la suya, con enlace, o elegir una emitida sin venta, o crearla con los datos
// de la venta (cliente, concepto y base) y asociarla al guardarla
function TarjetaFactura({ venta }: { venta: Venta }) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [creando, setCreando] = useState(false)
  const emitidas = useFacturas(explotacion.id, { tipo: 'emitida' }).data?.filter(
    (fa) => !fa.ventaId,
  )

  const asociar = useMutation({
    mutationFn: (facturaId: string | null) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/ventas/{ventaId}/factura', {
          params: { path: { explotacionId: explotacion.id, ventaId: venta.id } },
          body: { facturaId },
        }),
      ),
    onSuccess: async (v) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })
      avisar({
        tipo: v.factura ? 'exito' : 'info',
        mensaje: v.factura ? `Factura ${v.factura.numero} asociada` : 'Factura quitada de la venta',
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const n = venta.animales.length
  return (
    <Tarjeta aria-labelledby="venta-factura" className={estilos.tarjeta}>
      <h2 id="venta-factura" className={estilos.tituloTarjeta}>
        Factura
      </h2>
      {venta.factura ? (
        <>
          <Link
            to={`${rutaExplotacion(explotacion.id)}/finanzas/facturas/${venta.factura.id}`}
            className={estilos.enlaceArchivo}
          >
            Factura {venta.factura.numero} · {euros(venta.factura.total)}
          </Link>
          <div className={estilos.acciones}>
            <Boton
              variante="texto"
              className={estilos.peligro}
              cargando={asociar.isPending}
              onClick={() => asociar.mutate(null)}
            >
              Quitar de la venta
            </Boton>
          </div>
        </>
      ) : (
        <>
          <p className={estilos.suave}>
            Crea la factura con los datos de la venta, o elige una emitida que ya esté registrada.
          </p>
          <div className={estilos.acciones}>
            <Boton icono={<FilePlus aria-hidden size={18} />} onClick={() => setCreando(true)}>
              Crear la factura
            </Boton>
          </div>
          {emitidas && emitidas.length > 0 && (
            <Selector
              etiqueta="Elegir una factura emitida"
              value=""
              onChange={(e) => e.target.value && asociar.mutate(e.target.value)}
            >
              <option value="">Elige una…</option>
              {emitidas.map((fa) => (
                <option key={fa.id} value={fa.id}>
                  {fa.numero} · {fa.tercero} · {euros(fa.total)}
                </option>
              ))}
            </Selector>
          )}
        </>
      )}
      {creando && (
        <FormularioFactura
          inicial={{
            tipo: 'emitida',
            fecha: venta.fecha,
            tercero: venta.comprador,
            concepto: `Venta de ${n === 1 ? '1 animal' : `${n} animales`}: ${venta.animales.map(identificacion).join(', ')}`,
            base: venta.total,
          }}
          alCerrar={() => setCreando(false)}
          alGuardar={(f) => asociar.mutate(f.id)}
        />
      )}
    </Tarjeta>
  )
}
