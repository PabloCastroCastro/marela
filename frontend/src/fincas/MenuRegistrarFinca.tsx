import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Boton } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import { TIPOS_APLICACION, type TipoAplicacion } from './aplicaciones'
import type { Finca } from './datos'
import estilos from './Fincas.module.css'
import { FormularioAplicacion } from './FormularioAplicacion'
import { FormularioLabor } from './FormularioLabor'
import { FormularioPastoreo } from './FormularioPastoreo'
import { FormularioSalida } from './FormularioSalida'
import { TIPOS_LABOR, type TipoLabor } from './labores'

type Opcion = TipoLabor | TipoAplicacion | 'pastoreo' | 'salida'

// En el orden del año: se siembra, se abona y se trata, se pasta y se cosecha
const ORDEN: Opcion[] = ['siembra', 'abono', 'fitosanitario', 'pastoreo', 'cosecha', 'otra']

const TEXTOS: Record<Opcion, string> = {
  ...TIPOS_LABOR,
  ...TIPOS_APLICACION,
  pastoreo: 'Entrada a pastar',
  salida: 'Salida del pastoreo',
}

const esAplicacion = (o: Opcion): o is TipoAplicacion => o in TIPOS_APLICACION

// Acceso rápido desde la ficha de la finca a registrar lo que se hace en ella, como en la de los
// animales: siembra, cosecha u otra labor (GH-26), abono y fitosanitarios (GH-27), la entrada o la
// salida del pastoreo (GH-28) y, al final, desactivarla. También desde el listado, para las fincas
// marcadas, salvo el pastoreo, que va finca a finca.
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
  const unica = fincas.length === 1 ? fincas[0] : undefined
  // Con animales pastando, la salida en lugar de otra entrada
  const opciones = ORDEN.flatMap((o): Opcion[] =>
    o !== 'pastoreo' ? [o] : !unica ? [] : unica.pastoreo ? ['salida'] : ['pastoreo'],
  )

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
          {opciones.map((o) => (
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
      {opcion === 'pastoreo' && unica && <FormularioPastoreo finca={unica} alCerrar={cerrar} />}
      {opcion === 'salida' && unica?.pastoreo && (
        <FormularioSalida pastoreo={unica.pastoreo} alCerrar={cerrar} />
      )}
      {opcion &&
        opcion !== 'pastoreo' &&
        opcion !== 'salida' &&
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
