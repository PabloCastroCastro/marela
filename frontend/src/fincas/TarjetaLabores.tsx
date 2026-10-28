import { Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import type { FincaDetalle } from './datos'
import estilos from './Fincas.module.css'
import { FormularioLabor } from './FormularioLabor'
import { cantidadCosechada, type Labor, superficieLabor, tituloLabor, useLabores } from './labores'

// Siembras, cosechas y otras labores de la finca, de la más reciente a la más antigua y con solo
// las últimas a la vista (GH-26)
export function TarjetaLabores({ finca }: { finca: FincaDetalle }) {
  const explotacion = useExplotacionActual()
  const labores = useLabores(explotacion.id, finca.id)
  const [corrigiendo, setCorrigiendo] = useState<Labor>()
  const recorte = useRecorte(labores.data ?? [])

  let contenido: ReactNode
  if (labores.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }]} />
  } else if (labores.isError) {
    contenido = (
      <EstadoError alReintentar={() => labores.refetch()} reintentando={labores.isFetching} />
    )
  } else if (labores.data.length === 0) {
    contenido = <p className={estilos.suave}>Sin labores registradas</p>
  } else {
    contenido = (
      <ul className={estilos.registros} aria-label="Labores">
        {recorte.elementos.map((l) => (
          <li key={l.id}>
            <div>
              <span className={estilos.tituloRegistro}>{tituloLabor(l)}</span>
              <span className={estilos.suave}>
                {[
                  fecha(l.fecha),
                  superficieLabor(l),
                  cantidadCosechada(l),
                  l.realizadaPor && `por ${l.realizadaPor.nombre}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {l.observaciones && <span className={estilos.suave}>{l.observaciones}</span>}
            </div>
            <BotonIcono
              etiqueta={`Corregir ${tituloLabor(l).toLowerCase()} del ${fecha(l.fecha)}`}
              icono={<Pencil aria-hidden size={18} />}
              onClick={() => setCorrigiendo(l)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Tarjeta aria-labelledby="finca-labores" className={estilos.tarjetaRegistros}>
      <h2 id="finca-labores" className={estilos.tituloTarjeta}>
        Labores
      </h2>
      {contenido}
      {recorte.boton}
      {corrigiendo && (
        <FormularioLabor
          fincas={[finca]}
          labor={corrigiendo}
          alCerrar={() => setCorrigiendo(undefined)}
        />
      )}
    </Tarjeta>
  )
}
