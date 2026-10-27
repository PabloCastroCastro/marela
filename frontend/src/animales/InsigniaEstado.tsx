import { CircleCheck, CircleSlash, HandCoins } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import { ESTADOS, type EstadoAnimal } from './datos'

// Estado del animal con icono y texto, además del color
export function InsigniaEstado({ estado }: { estado: EstadoAnimal }) {
  if (estado === 'activo') {
    return (
      <Insignia tipo="exito" icono={<CircleCheck aria-hidden />}>
        {ESTADOS.activo}
      </Insignia>
    )
  }
  return (
    <Insignia
      icono={estado === 'vendido' ? <HandCoins aria-hidden /> : <CircleSlash aria-hidden />}
    >
      {ESTADOS[estado]}
    </Insignia>
  )
}
