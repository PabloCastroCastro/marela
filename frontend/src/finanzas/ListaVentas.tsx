import { HandCoins, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton } from '../componentes/Boton'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, fecha, kilos } from '../formato'
import { useVentas } from './datos'
import { type Fechas, FiltroFechas, rangoFechas } from './FiltroFechas'
import estilos from './Finanzas.module.css'
import { FormularioVenta } from './FormularioVenta'

type FiltroFactura = 'con' | 'sin' | 'todas'

// Las ventas de animales (GH-38), de la más reciente a la más antigua, con buscador por comprador y
// filtro por tener o no factura
export function ListaVentas() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [factura, setFactura] = useState<FiltroFactura>('todas')
  const [creando, setCreando] = useState(false)
  const [fechas, setFechas] = useState<Fechas>({ desde: '', hasta: '' })
  const ventas = useVentas(explotacion.id, {
    q: texto || undefined,
    factura: factura === 'todas' ? undefined : factura,
    ...rangoFechas(fechas),
  })
  const ficha = (id: string) => `${rutaExplotacion(explotacion.id)}/finanzas/ventas/${id}`

  return (
    <Tarjeta aria-labelledby="finanzas-ventas" className={estilos.tarjeta}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="finanzas-ventas" className={estilos.tituloTarjeta}>
          Ventas de animales
        </h2>
        <Boton
          variante="secundario"
          tamano="compacto"
          icono={<Plus aria-hidden size={18} />}
          onClick={() => setCreando(true)}
        >
          Nueva venta
        </Boton>
      </div>

      <BarraFiltros buscador={<Buscador etiqueta="Buscar por comprador" alCambiar={setTexto} />}>
        <FiltroDesplegable
          etiqueta="Factura"
          opciones={[
            { valor: 'todas', texto: 'Todas' },
            { valor: 'con', texto: 'Con factura' },
            { valor: 'sin', texto: 'Sin factura' },
          ]}
          valor={factura}
          porDefecto="todas"
          alCambiar={setFactura}
        />
      </BarraFiltros>
      <FiltroFechas valor={fechas} alCambiar={setFechas} />

      {ventas.isPending ? (
        <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }, { alto: '4rem' }]} />
      ) : ventas.isError && !ventas.data ? (
        <EstadoError alReintentar={() => ventas.refetch()} reintentando={ventas.isFetching} />
      ) : ventas.data.length === 0 ? (
        texto || factura !== 'todas' || fechas.desde || fechas.hasta ? (
          <EstadoVacio
            titulo="Nada coincide"
            descripcion="Prueba con otra búsqueda o con otro filtro."
          />
        ) : (
          <EstadoVacio
            icono={<HandCoins size={32} />}
            titulo="Aún no hay ventas"
            descripcion="Registra cada venta con sus animales: pasan a vendidos y su peso queda en la ficha. También desde la lista de animales, seleccionándolos."
          />
        )
      ) : (
        <Tabla
          etiqueta="Ventas"
          filas={ventas.data}
          claveFila={(v) => v.id}
          alSeleccionar={(v) => navegar(ficha(v.id))}
          columnas={[
            {
              clave: 'comprador',
              titulo: 'Comprador',
              valor: (v) => v.comprador,
              ordenar: (v) => v.comprador,
              principal: true,
            },
            {
              clave: 'fecha',
              titulo: 'Fecha',
              valor: (v) => fecha(v.fecha),
              ordenar: (v) => v.fecha,
            },
            {
              clave: 'animales',
              titulo: 'Animales',
              valor: (v) => `${v.animales.length}${v.kg !== null ? ` · ${kilos(v.kg, 1)}` : ''}`,
              ordenar: (v) => v.animales.length,
            },
            {
              clave: 'total',
              titulo: 'Total',
              valor: (v) => euros(v.total),
              ordenar: (v) => v.total,
              numerica: true,
            },
            {
              clave: 'factura',
              titulo: 'Factura',
              valor: (v) =>
                v.factura ? v.factura.numero : <Insignia tipo="aviso">Sin factura</Insignia>,
              ordenar: (v) => v.factura?.numero ?? '',
            },
          ]}
        />
      )}

      {creando && (
        <FormularioVenta
          alCerrar={() => setCreando(false)}
          alGuardar={(v) => navegar(ficha(v.id))}
        />
      )}
    </Tarjeta>
  )
}
