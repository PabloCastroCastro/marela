import { Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Boton } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Chips, Tarjeta } from '../componentes/Etiquetas'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { porcentaje, REGIMENES, useFiscal } from './datos'
import estilos from './Finanzas.module.css'
import { FormularioFiscal } from './FormularioFiscal'
import { ListaApuntes } from './ListaApuntes'
import { ListaFacturas } from './ListaFacturas'

type Vista = 'facturas' | 'apuntes' | 'regimen'

const VISTAS: { valor: Vista; texto: string }[] = [
  { valor: 'facturas', texto: 'Facturas' },
  { valor: 'apuntes', texto: 'Otros ingresos y gastos' },
  { valor: 'regimen', texto: 'Régimen fiscal' },
]

// Finanzas, solo para el administrador, en pestañas: las facturas (GH-35), los otros ingresos y
// gastos (GH-37) y el régimen fiscal (GH-34). Las ventas y los informes llegan después, en el ciclo
// 7. La pestaña, en la dirección para que se conserve al volver de una ficha.
export function PaginaFinanzas() {
  const [busqueda, setBusqueda] = useSearchParams()
  const vista = VISTAS.find((v) => v.valor === busqueda.get('vista'))?.valor ?? 'facturas'

  return (
    <section className={estilos.pagina}>
      <h1>Finanzas</h1>
      <Chips
        etiqueta="Sección de Finanzas"
        envolver
        opciones={VISTAS}
        seleccion={vista}
        alCambiar={(v) => setBusqueda(v === 'facturas' ? {} : { vista: v }, { replace: true })}
      />
      {vista === 'facturas' && <ListaFacturas />}
      {vista === 'apuntes' && <ListaApuntes />}
      {vista === 'regimen' && <TarjetaRegimen />}
    </section>
  )
}

function TarjetaRegimen() {
  const explotacion = useExplotacionActual()
  const fiscal = useFiscal(explotacion.id)
  const [editando, setEditando] = useState(false)

  return (
    <Tarjeta aria-labelledby="finanzas-fiscal" className={estilos.tarjeta}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="finanzas-fiscal" className={estilos.tituloTarjeta}>
          Régimen fiscal
        </h2>
        {fiscal.data && (
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<Pencil aria-hidden size={18} />}
            onClick={() => setEditando(true)}
          >
            Editar
          </Boton>
        )}
      </div>
      {fiscal.isPending ? (
        <Esqueleto bloques={[{ alto: '1.5rem' }, { alto: '1.5rem' }, { alto: '1.5rem' }]} />
      ) : fiscal.isError && !fiscal.data ? (
        <EstadoError alReintentar={() => fiscal.refetch()} reintentando={fiscal.isFetching} />
      ) : (
        <>
          <dl className={estilos.datos}>
            <Dato titulo="Régimen">{REGIMENES[fiscal.data.regimen]}</Dato>
            <Dato titulo="Compensación del REAGP">{porcentaje(fiscal.data.compensacionReagp)}</Dato>
            <Dato titulo="Tipos de IVA">{fiscal.data.tiposIva.map(porcentaje).join(' · ')}</Dato>
          </dl>
          {!fiscal.data.configurado && (
            <p className={estilos.suave}>
              Son los valores por defecto. Revísalos con tu gestor y guárdalos.
            </p>
          )}
        </>
      )}
      {editando && fiscal.data && (
        <FormularioFiscal fiscal={fiscal.data} alCerrar={() => setEditando(false)} />
      )}
    </Tarjeta>
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
