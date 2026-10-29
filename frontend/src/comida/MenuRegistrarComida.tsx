import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Boton } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import estilos from './Comida.module.css'
import { type Almacen, TIPOS_MOVIMIENTO, type TipoMovimiento } from './datos'
import { FormularioMovimiento } from './FormularioMovimiento'

// Lo más habitual, primero: la ración de cada día
const ORDEN: TipoMovimiento[] = ['salida', 'entrada', 'ajuste']

// "Registrar" de un almacén: una salida (ración), una entrada o un ajuste de inventario (GH-30). En
// su ficha y, discreto, en su tarjeta de la pantalla de Comida, bajo el contador de la ración.
export function MenuRegistrarComida({
  almacen,
  tamano,
}: {
  almacen: Almacen
  tamano?: 'compacto'
}) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoMovimiento>()

  return (
    <>
      <Boton
        variante={tamano ? 'texto' : undefined}
        tamano={tamano}
        icono={<ChevronDown aria-hidden size={18} />}
        aria-haspopup="dialog"
        aria-label={`Registrar en ${almacen.nombre}`}
        onClick={() => setAbierto(true)}
      >
        Registrar
      </Boton>
      <HojaInferior
        abierta={abierto}
        alCerrar={() => setAbierto(false)}
        titulo={`Registrar · ${almacen.nombre}`}
      >
        <div className={estilos.opcionesRegistrar}>
          {ORDEN.map((t) => (
            <Boton
              key={t}
              variante="secundario"
              anchoCompleto
              onClick={() => {
                setAbierto(false)
                setTipo(t)
              }}
            >
              {TIPOS_MOVIMIENTO[t]}
            </Boton>
          ))}
        </div>
      </HojaInferior>
      {tipo && (
        <FormularioMovimiento almacen={almacen} tipo={tipo} alCerrar={() => setTipo(undefined)} />
      )}
    </>
  )
}
