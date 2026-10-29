import { Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Boton } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { porcentaje, REGIMENES, useFiscal } from './datos'
import estilos from './Finanzas.module.css'
import { FormularioFiscal } from './FormularioFiscal'

// Finanzas, solo para el administrador. Empieza por el régimen fiscal de la explotación (GH-34); las
// facturas, los otros ingresos y gastos y las ventas llegan después, en el ciclo 7.
export function PaginaFinanzas() {
  const explotacion = useExplotacionActual()
  const fiscal = useFiscal(explotacion.id)
  const [editando, setEditando] = useState(false)

  return (
    <section className={estilos.pagina}>
      <h1>Finanzas</h1>

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
              <Dato titulo="Compensación del REAGP">
                {porcentaje(fiscal.data.compensacionReagp)}
              </Dato>
              <Dato titulo="Tipos de IVA">{fiscal.data.tiposIva.map(porcentaje).join(' · ')}</Dato>
            </dl>
            {!fiscal.data.configurado && (
              <p className={estilos.suave}>
                Son los valores por defecto. Revísalos con tu gestor y guárdalos.
              </p>
            )}
          </>
        )}
      </Tarjeta>

      {editando && fiscal.data && (
        <FormularioFiscal fiscal={fiscal.data} alCerrar={() => setEditando(false)} />
      )}
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
