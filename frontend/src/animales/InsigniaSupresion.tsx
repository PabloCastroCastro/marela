import { Hourglass } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import { fecha } from '../formato'

// Supresión en curso de un animal (GH-20): no puede ir a matadero hasta ese día
export function InsigniaSupresion({ fin }: { fin: string }) {
  return (
    <Insignia tipo="aviso" icono={<Hourglass aria-hidden />}>
      En supresión hasta el {fecha(fin)}
    </Insignia>
  )
}
