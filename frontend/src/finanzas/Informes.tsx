import { useState } from 'react'
import { Selector } from '../componentes/Campo'
import { clases } from '../componentes/clases'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Chips, Tarjeta } from '../componentes/Etiquetas'
import { Tabla } from '../componentes/Tabla'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, hoy } from '../formato'
import { nombrePeriodo, PERIODOS, type PeriodoResumen, type Resumen, useResumen } from './datos'
import estilos from './Finanzas.module.css'

// Los años que se ofrecen: el actual y los cinco anteriores
const ANIOS = 6

const Resultado = ({ valor }: { valor: number }) => (
  <span
    className={clases(estilos.importe, valor > 0 && estilos.ingreso, valor < 0 && estilos.gasto)}
  >
    {euros(valor)}
  </span>
)

// Informes de finanzas (GH-39): el resumen de ingresos y gastos por mes y trimestre de un año, o
// por años. Con impuestos (lo que de verdad entra y sale) y por la fecha de cada factura o
// movimiento; lo pendiente de cobro y de pago, aparte. En pantalla ancha, una tabla con el desglose.
export function Informes() {
  const explotacion = useExplotacionActual()
  const actual = Number(hoy().slice(0, 4))
  const [periodo, setPeriodo] = useState<PeriodoResumen>('mes')
  const [anio, setAnio] = useState(actual)
  const rango =
    periodo === 'anio'
      ? { desde: `${actual - ANIOS + 1}-01-01`, hasta: `${actual}-12-31` }
      : { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }
  const resumen = useResumen(explotacion.id, { periodo, ...rango })

  return (
    <Tarjeta aria-labelledby="finanzas-informes" className={estilos.tarjeta}>
      <h2 id="finanzas-informes" className={estilos.tituloTarjeta}>
        Ingresos y gastos
      </h2>
      <div className={estilos.controles}>
        <Chips
          etiqueta="Periodo"
          envolver
          opciones={(Object.keys(PERIODOS) as PeriodoResumen[]).map((p) => ({
            valor: p,
            texto: PERIODOS[p],
          }))}
          seleccion={periodo}
          alCambiar={setPeriodo}
        />
        {periodo !== 'anio' && (
          <Selector
            etiqueta="Año"
            className={estilos.anio}
            value={String(anio)}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {Array.from({ length: ANIOS }, (_, i) => actual - i).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Selector>
        )}
      </div>

      {resumen.isPending ? (
        <Esqueleto bloques={[{ alto: '5rem' }, { alto: '12rem' }]} />
      ) : resumen.isError && !resumen.data ? (
        <EstadoError alReintentar={() => resumen.refetch()} reintentando={resumen.isFetching} />
      ) : (
        <ContenidoResumen resumen={resumen.data} />
      )}
      <p className={estilos.suave}>
        Con impuestos y por la fecha de cada factura o movimiento. Ingresos: facturas emitidas,
        ventas sin factura (las que la tienen cuentan por ella) y otros ingresos. Gastos: facturas
        recibidas y otros gastos. Los anulados no cuentan.
      </p>
    </Tarjeta>
  )
}

function ContenidoResumen({ resumen }: { resumen: Resumen }) {
  const { total, pendiente } = resumen
  return (
    <>
      <dl className={estilos.cifras} aria-label="Totales del periodo">
        <div>
          <dt>Ingresos</dt>
          <dd className={estilos.ingreso}>{euros(total.ingresos.total)}</dd>
        </div>
        <div>
          <dt>Gastos</dt>
          <dd className={estilos.gasto}>{euros(total.gastos.total)}</dd>
        </div>
        <div>
          <dt>Resultado</dt>
          <dd>
            <Resultado valor={total.resultado} />
          </dd>
        </div>
        <div>
          <dt>Pendiente de cobro</dt>
          <dd>{euros(pendiente.cobro)}</dd>
        </div>
        <div>
          <dt>Pendiente de pago</dt>
          <dd>{euros(pendiente.pago)}</dd>
        </div>
      </dl>
      <div className={estilos.desplazable}>
        <Tabla
          etiqueta="Resumen por periodo"
          filas={resumen.filas}
          claveFila={(f) => f.clave}
          columnas={[
            {
              clave: 'periodo',
              titulo: 'Periodo',
              valor: (f) => nombrePeriodo(f.clave),
              ordenar: (f) => f.clave,
              principal: true,
            },
            {
              clave: 'facturasEmitidas',
              titulo: 'Facturas emitidas',
              valor: (f) => euros(f.ingresos.facturas),
              ordenar: (f) => f.ingresos.facturas,
              numerica: true,
            },
            {
              clave: 'ventas',
              titulo: 'Ventas sin factura',
              valor: (f) => euros(f.ingresos.ventas),
              ordenar: (f) => f.ingresos.ventas,
              numerica: true,
            },
            {
              clave: 'otrosIngresos',
              titulo: 'Otros ingresos',
              valor: (f) => euros(f.ingresos.otros),
              ordenar: (f) => f.ingresos.otros,
              numerica: true,
            },
            {
              clave: 'ingresos',
              titulo: 'Ingresos',
              valor: (f) => <strong>{euros(f.ingresos.total)}</strong>,
              ordenar: (f) => f.ingresos.total,
              numerica: true,
            },
            {
              clave: 'facturasRecibidas',
              titulo: 'Facturas recibidas',
              valor: (f) => euros(f.gastos.facturas),
              ordenar: (f) => f.gastos.facturas,
              numerica: true,
            },
            {
              clave: 'otrosGastos',
              titulo: 'Otros gastos',
              valor: (f) => euros(f.gastos.otros),
              ordenar: (f) => f.gastos.otros,
              numerica: true,
            },
            {
              clave: 'gastos',
              titulo: 'Gastos',
              valor: (f) => <strong>{euros(f.gastos.total)}</strong>,
              ordenar: (f) => f.gastos.total,
              numerica: true,
            },
            {
              clave: 'resultado',
              titulo: 'Resultado',
              valor: (f) => <Resultado valor={f.resultado} />,
              ordenar: (f) => f.resultado,
              numerica: true,
            },
          ]}
        />
      </div>
    </>
  )
}
