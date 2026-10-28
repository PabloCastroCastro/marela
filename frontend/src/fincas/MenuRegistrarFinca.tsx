import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Boton } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import { TIPOS_APLICACION, type TipoAplicacion } from './aplicaciones'
import type { Finca } from './datos'
import estilos from './Fincas.module.css'
import { FormularioAplicacion } from './FormularioAplicacion'
import { FormularioLabor } from './FormularioLabor'
import { TIPOS_LABOR, type TipoLabor } from './labores'

type Opcion = TipoLabor | TipoAplicacion

// En el orden del año: se siembra, se abona y se trata, y se cosecha
const OPCIONES: Opcion[] = ['siembra', 'abono', 'fitosanitario', 'cosecha', 'otra']

const TEXTOS: Record<Opcion, string> = { ...TIPOS_LABOR, ...TIPOS_APLICACION }

const esAplicacion = (o: Opcion): o is TipoAplicacion => o in TIPOS_APLICACION

// Acceso rápido desde la ficha de la finca a registrar lo que se hace en ella, como en la de los
// animales: siembra, cosecha u otra labor (GH-26), abono y fitosanitarios (GH-27) y, al final,
// desactivarla. También desde el listado, para las fincas marcadas. El pastoreo se añadirá aquí.
export function MenuRegistrarFinca({
  fincas,
  alDesactivar,
  alGuardar,
}: {
  fincas: Finca[]
  // Solo en la ficha
  alDesactivar?: () => void
  // Tras registrar, por ejemplo para desmarcar las fincas del listado
  alGuardar?: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [opcion, setOpcion] = useState<Opcion>()
  const cerrar = () => setOpcion(undefined)

  return (
    <>
      <Boton
        icono={<ChevronDown aria-hidden size={18} />}
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
      >
        Registrar
      </Boton>
      <HojaInferior abierta={abierto} alCerrar={() => setAbierto(false)} titulo="Registrar">
        <div className={estilos.opcionesRegistrar}>
          {OPCIONES.map((o) => (
            <Boton
              key={o}
              variante="secundario"
              anchoCompleto
              onClick={() => {
                setAbierto(false)
                setOpcion(o)
              }}
            >
              {TEXTOS[o]}
            </Boton>
          ))}
          {alDesactivar && (
            <Boton
              variante="secundario"
              anchoCompleto
              className={estilos.peligro}
              onClick={() => {
                setAbierto(false)
                alDesactivar()
              }}
            >
              Desactivar la finca
            </Boton>
          )}
        </div>
      </HojaInferior>
      {opcion &&
        (esAplicacion(opcion) ? (
          <FormularioAplicacion
            fincas={fincas}
            tipoInicial={opcion}
            alCerrar={cerrar}
            alGuardar={alGuardar}
          />
        ) : (
          <FormularioLabor
            fincas={fincas}
            tipoInicial={opcion}
            alCerrar={cerrar}
            alGuardar={alGuardar}
          />
        ))}
    </>
  )
}
