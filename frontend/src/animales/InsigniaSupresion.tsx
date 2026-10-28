import { Hourglass } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import { fecha } from '../formato'
import estilos from './Animales.module.css'

// Supresión en curso de un animal (GH-20): no puede ir a matadero hasta ese día. La versión corta
// ("Supresión 22/11"), para el listado, cabe junto a la insignia de estado en el móvil; los lectores
// de pantalla leen siempre el texto completo.
export function InsigniaSupresion({ fin, corta }: { fin: string; corta?: boolean }) {
  const completo = `En supresión hasta el ${fecha(fin)}`
  return (
    <Insignia tipo="aviso" icono={<Hourglass aria-hidden />}>
      {corta ? (
        <>
          <span aria-hidden title={completo}>
            Supresión {fin.slice(8, 10)}/{fin.slice(5, 7)}
          </span>
          <span className={estilos.oculto}>{completo}</span>
        </>
      ) : (
        completo
      )}
    </Insignia>
  )
}
