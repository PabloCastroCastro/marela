import { FileText, Paperclip, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton } from '../componentes/Boton'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia, Tarjeta } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, fecha } from '../formato'
import { type Factura, TIPOS_FACTURA, type TipoFactura, useFacturas } from './datos'
import { BotonExportar } from './Exportar'
import { type Fechas, FiltroFechas, rangoFechas } from './FiltroFechas'
import estilos from './Finanzas.module.css'
import { FormularioFactura } from './FormularioFactura'

export const InsigniaPago = ({ factura }: { factura: Factura }) =>
  factura.pagadaEn ? (
    <Insignia tipo="exito">Pagada</Insignia>
  ) : (
    <Insignia tipo="aviso">Pendiente</Insignia>
  )

type FiltroTipo = TipoFactura | 'todas'
type FiltroPago = 'pendiente' | 'pagada' | 'todas'

// Las facturas de la explotación (GH-35), de la más reciente a la más antigua, con filtros por tipo,
// por estado de pago y por proveedor o cliente, número o NIF
export function ListaFacturas() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todas')
  const [pago, setPago] = useState<FiltroPago>('todas')
  const [creando, setCreando] = useState(false)
  const [fechas, setFechas] = useState<Fechas>({ desde: '', hasta: '' })
  const filtros = {
    q: texto || undefined,
    tipo: tipo === 'todas' ? undefined : tipo,
    estado: pago === 'todas' ? undefined : pago,
    ...rangoFechas(fechas),
  }
  const facturas = useFacturas(explotacion.id, filtros)
  const filtrado =
    texto !== '' ||
    tipo !== 'todas' ||
    pago !== 'todas' ||
    fechas.desde !== '' ||
    fechas.hasta !== ''
  const ficha = (id: string) => `${rutaExplotacion(explotacion.id)}/finanzas/facturas/${id}`

  return (
    <Tarjeta aria-labelledby="finanzas-facturas" className={estilos.tarjeta}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="finanzas-facturas" className={estilos.tituloTarjeta}>
          Facturas
        </h2>
        <div className={estilos.acciones}>
          <BotonExportar
            listado="facturas"
            filtros={filtros}
            formatos={['xlsx', 'csv', 'zip']}
            descripcion="Las facturas que se ven, con los filtros y las fechas que tengas puestos."
          />
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<Plus aria-hidden size={18} />}
            onClick={() => setCreando(true)}
          >
            Nueva factura
          </Boton>
        </div>
      </div>

      <BarraFiltros
        buscador={
          <Buscador etiqueta="Buscar por proveedor, cliente, número o NIF" alCambiar={setTexto} />
        }
      >
        <Chips
          etiqueta="Tipo"
          opciones={[
            { valor: 'todas' as const, texto: 'Todas' },
            { valor: 'recibida' as const, texto: 'Recibidas' },
            { valor: 'emitida' as const, texto: 'Emitidas' },
          ]}
          seleccion={tipo}
          alCambiar={setTipo}
        />
        <FiltroDesplegable
          etiqueta="Pago"
          opciones={[
            { valor: 'todas', texto: 'Todas' },
            { valor: 'pendiente', texto: 'Pendientes' },
            { valor: 'pagada', texto: 'Pagadas' },
          ]}
          valor={pago}
          porDefecto="todas"
          alCambiar={setPago}
        />
      </BarraFiltros>
      <FiltroFechas valor={fechas} alCambiar={setFechas} />

      {facturas.isPending ? (
        <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }, { alto: '4rem' }]} />
      ) : facturas.isError && !facturas.data ? (
        <EstadoError alReintentar={() => facturas.refetch()} reintentando={facturas.isFetching} />
      ) : facturas.data.length === 0 ? (
        filtrado ? (
          <EstadoVacio
            titulo="Nada coincide"
            descripcion="Prueba con otra búsqueda o con otro filtro."
          />
        ) : (
          <EstadoVacio
            icono={<FileText size={32} />}
            titulo="Aún no hay facturas"
            descripcion="Registra las facturas de lo que compras y de lo que vendes, con su PDF o una foto."
          />
        )
      ) : (
        <Tabla
          etiqueta="Facturas"
          filas={facturas.data}
          claveFila={(f) => f.id}
          alSeleccionar={(f) => navegar(ficha(f.id))}
          columnas={[
            {
              clave: 'tercero',
              titulo: 'Proveedor o cliente',
              valor: (f) => f.tercero,
              ordenar: (f) => f.tercero,
              principal: true,
            },
            {
              clave: 'fecha',
              titulo: 'Fecha',
              valor: (f) => fecha(f.fecha),
              ordenar: (f) => f.fecha,
            },
            {
              clave: 'numero',
              titulo: 'Número',
              valor: (f) => (
                <span className={estilos.numero}>
                  {f.numero}
                  {f.archivo && <Paperclip aria-label="Con archivo" size={14} />}
                </span>
              ),
              ordenar: (f) => f.numero,
            },
            {
              clave: 'tipo',
              titulo: 'Tipo',
              valor: (f) => TIPOS_FACTURA[f.tipo],
              ordenar: (f) => f.tipo,
            },
            {
              clave: 'total',
              titulo: 'Total',
              valor: (f) => euros(f.total),
              ordenar: (f) => f.total,
              numerica: true,
            },
            {
              clave: 'pago',
              titulo: 'Pago',
              valor: (f) => <InsigniaPago factura={f} />,
              ordenar: (f) => (f.pagadaEn ? 1 : 0),
            },
          ]}
        />
      )}

      {creando && (
        <FormularioFactura
          alCerrar={() => setCreando(false)}
          alGuardar={(f) => navegar(ficha(f.id))}
        />
      )}
    </Tarjeta>
  )
}
