import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CircleCheck,
  ExternalLink,
  Paperclip,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { identificacion } from '../animales/datos'
import { api, datos, ErrorApi, enviar } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, fecha, hoy } from '../formato'
import {
  CLAVE_FINANZAS,
  type Factura,
  IMPUESTOS,
  porcentaje,
  subirArchivo,
  TAMANO_MAXIMO_ARCHIVO,
  TERCERO,
  TIPOS_FACTURA,
  tamano,
  urlArchivo,
  useFactura,
} from './datos'
import estilos from './Finanzas.module.css'
import { ElegirArchivo, FormularioFactura } from './FormularioFactura'
import { InsigniaPago } from './ListaFacturas'

// Ficha de una factura (GH-35): sus datos y sus líneas, el pago, el archivo (verlo, cambiarlo o
// quitarlo) y los animales comprados con ella. Se corrige o se borra.
export function PaginaFactura() {
  const explotacion = useExplotacionActual()
  const { facturaId = '' } = useParams()
  const factura = useFactura(explotacion.id, facturaId)
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [editando, setEditando] = useState(false)
  const inicio = `${rutaExplotacion(explotacion.id)}/finanzas`
  const refrescar = () =>
    cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })
  const ruta = { params: { path: { explotacionId: explotacion.id, facturaId } } }

  const pagar = useMutation({
    mutationFn: (pagadaEn: string | null) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/facturas/{facturaId}/pago', {
          ...ruta,
          body: { pagadaEn },
        }),
      ),
    onSuccess: async (f, pagadaEn) => {
      await refrescar()
      avisar({
        tipo: pagadaEn ? 'exito' : 'info',
        mensaje: pagadaEn ? `Pagada: ${f.numero}` : `Otra vez pendiente: ${f.numero}`,
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const adjuntar = useMutation({
    mutationFn: (archivo: File) => subirArchivo(explotacion.id, facturaId, archivo),
    onSuccess: async () => {
      await refrescar()
      avisar({ tipo: 'exito', mensaje: 'Archivo adjuntado' })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const quitarArchivo = useMutation({
    mutationFn: () =>
      datos(api.DELETE('/api/explotaciones/{explotacionId}/facturas/{facturaId}/archivo', ruta)),
    onSuccess: async () => {
      await refrescar()
      avisar({ tipo: 'info', mensaje: 'Archivo quitado' })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: () =>
      enviar(api.DELETE('/api/explotaciones/{explotacionId}/facturas/{facturaId}', ruta)),
    onSuccess: async () => {
      navegar(inicio)
      await refrescar()
      avisar({ tipo: 'info', mensaje: `Factura borrada: ${factura.data?.numero ?? ''}` })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const elegir = (archivo: File | undefined) => {
    if (!archivo) return
    if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
      avisar({ tipo: 'error', mensaje: 'El archivo ocupa más de 10 MB' })
      return
    }
    adjuntar.mutate(archivo)
  }

  const volver = (
    <Link to={inicio} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      Finanzas
    </Link>
  )

  if (factura.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '10rem' }]} />
      </section>
    )
  }
  if (factura.isError && !factura.data) {
    const noExiste = factura.error instanceof ErrorApi && factura.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Esta factura no está en la explotación"
            descripcion="Puede que se haya borrado o que la dirección esté mal escrita."
          />
        ) : (
          <EstadoError alReintentar={() => factura.refetch()} reintentando={factura.isFetching} />
        )}
      </section>
    )
  }

  const f: Factura = factura.data
  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>Factura {f.numero}</h1>
          <div className={estilos.insignias}>
            <span className={estilos.suave}>
              {TIPOS_FACTURA[f.tipo]} · {fecha(f.fecha)}
            </span>
            <InsigniaPago factura={f} />
          </div>
        </div>
        <div className={estilos.acciones}>
          {f.pagadaEn ? (
            <Boton
              variante="secundario"
              icono={<RotateCcw aria-hidden size={18} />}
              cargando={pagar.isPending}
              onClick={() => pagar.mutate(null)}
            >
              Dejar pendiente
            </Boton>
          ) : (
            <Boton
              icono={<CircleCheck aria-hidden size={18} />}
              cargando={pagar.isPending}
              onClick={() => pagar.mutate(hoy())}
            >
              Marcar como pagada
            </Boton>
          )}
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
            icono={<Trash2 aria-hidden size={18} />}
            cargando={borrar.isPending}
            onClick={async () => {
              const ok = await confirmar({
                titulo: `¿Borrar la factura ${f.numero}?`,
                mensaje: 'Se borra con su archivo. Queda en el historial de cambios.',
                textoConfirmar: 'Borrar',
                peligrosa: true,
              })
              if (ok) borrar.mutate()
            }}
          >
            Borrar
          </Boton>
        </div>
      </div>

      <Tarjeta aria-labelledby="factura-datos" className={estilos.tarjeta}>
        <h2 id="factura-datos" className={estilos.tituloTarjeta}>
          Datos
        </h2>
        <dl className={estilos.datos}>
          <Dato titulo={TERCERO[f.tipo]}>{f.tercero}</Dato>
          <Dato titulo="NIF">
            {f.nif}
            {f.nifExtranjero && <span className={estilos.suave}> · extranjero</span>}
          </Dato>
          <Dato titulo="Concepto">
            <span className={estilos.descripcion}>{f.concepto}</span>
          </Dato>
          <Dato titulo="Pago">{f.pagadaEn ? `Pagada el ${fecha(f.pagadaEn)}` : 'Pendiente'}</Dato>
        </dl>
      </Tarjeta>

      <Tarjeta aria-labelledby="factura-importes" className={estilos.tarjeta}>
        <h2 id="factura-importes" className={estilos.tituloTarjeta}>
          Importes
        </h2>
        <table className={estilos.tablaLineas}>
          <thead>
            <tr>
              <th scope="col">Base imponible</th>
              <th scope="col">{IMPUESTOS[f.impuesto]}</th>
              <th scope="col">Cuota</th>
            </tr>
          </thead>
          <tbody>
            {f.lineas.map((l) => (
              <tr key={`${l.porcentaje}-${l.base}`}>
                <td>{euros(l.base)}</td>
                <td>{porcentaje(l.porcentaje)}</td>
                <td>{euros(l.cuota)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className={estilos.totales}>
          <div>
            <dt>Base imponible</dt>
            <dd>{euros(f.baseImponible)}</dd>
          </div>
          <div>
            <dt>{IMPUESTOS[f.impuesto]}</dt>
            <dd>{euros(f.cuota)}</dd>
          </div>
          <div className={estilos.total}>
            <dt>Total</dt>
            <dd>{euros(f.total)}</dd>
          </div>
        </dl>
      </Tarjeta>

      <Tarjeta aria-labelledby="factura-archivo" className={estilos.tarjeta}>
        <h2 id="factura-archivo" className={estilos.tituloTarjeta}>
          Archivo
        </h2>
        {f.archivo ? (
          <>
            <a
              href={urlArchivo(explotacion.id, f.id)}
              target="_blank"
              rel="noopener"
              className={estilos.enlaceArchivo}
            >
              <Paperclip aria-hidden size={18} />
              <span>
                {f.archivo.nombre}{' '}
                <span className={estilos.suave}>· {tamano(f.archivo.tamano)}</span>
              </span>
              <ExternalLink aria-hidden size={16} />
            </a>
            <div className={estilos.acciones}>
              <ElegirArchivo alElegir={elegir} texto="Cambiar el archivo" />
              <Boton
                variante="texto"
                className={estilos.peligro}
                cargando={quitarArchivo.isPending}
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: '¿Quitar el archivo?',
                    textoConfirmar: 'Quitar',
                    peligrosa: true,
                  })
                  if (ok) quitarArchivo.mutate()
                }}
              >
                Quitar
              </Boton>
            </div>
          </>
        ) : (
          <>
            <p className={estilos.suave}>Sin archivo. Adjunta el PDF o una foto de la factura.</p>
            <div className={estilos.acciones}>
              <ElegirArchivo alElegir={elegir} />
            </div>
          </>
        )}
        {adjuntar.isPending && <p className={estilos.suave}>Subiendo el archivo…</p>}
      </Tarjeta>

      {f.animales.length > 0 && (
        <Tarjeta aria-labelledby="factura-animales" className={estilos.tarjeta}>
          <h2 id="factura-animales" className={estilos.tituloTarjeta}>
            Animales comprados
          </h2>
          <ul className={estilos.enlaces}>
            {f.animales.map((a) => (
              <li key={a.id}>
                <Link to={`${rutaExplotacion(explotacion.id)}/animales/${a.id}`}>
                  {identificacion(a)}
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      <p className={estilos.suave}>
        Registrada el {fecha(f.creadoEn)} · Última modificación el {fecha(f.modificadoEn)}
      </p>

      {editando && <FormularioFactura factura={f} alCerrar={() => setEditando(false)} />}
    </section>
  )
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className={estilos.dato}>
      <dt>{titulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}
