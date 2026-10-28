import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Boton } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import type { FincaDetalle } from './datos'
import estilos from './Fincas.module.css'
import { FormularioLabor } from './FormularioLabor'
import { TIPOS_LABOR, type TipoLabor } from './labores'

// Acceso rápido desde la ficha de la finca a registrar lo que se hace en ella, como en la de los
// animales: siembra, cosecha u otra labor (GH-26). El abono, los fitosanitarios y el pastoreo se
// añadirán aquí.
export function MenuRegistrarFinca({ finca }: { finca: FincaDetalle }) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoLabor>()

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
          {(Object.keys(TIPOS_LABOR) as TipoLabor[]).map((t) => (
            <Boton
              key={t}
              variante="secundario"
              anchoCompleto
              onClick={() => {
                setAbierto(false)
                setTipo(t)
              }}
            >
              {TIPOS_LABOR[t]}
            </Boton>
          ))}
        </div>
      </HojaInferior>
      {tipo && (
        <FormularioLabor fincas={[finca]} tipoInicial={tipo} alCerrar={() => setTipo(undefined)} />
      )}
    </>
  )
}
