import { Insignia } from '../componentes/Etiquetas'
import { fecha } from '../formato'
import estilos from './Animales.module.css'
import type { Gestacion } from './reproduccion'

// Gestación en curso de una hembra (GH-22), sin icono: ninguno se lee bien como una cría. La versión corta ("Parto 12/03"), para el listado, cabe
// junto a la insignia de estado en el móvil; los lectores de pantalla leen el texto completo.
export function InsigniaGestacion({ gestacion, corta }: { gestacion: Gestacion; corta?: boolean }) {
  const prevista = gestacion.fechaPrevistaParto
  const completo = prevista
    ? `Parto previsto el ${fecha(prevista)}${gestacion.confirmada ? '' : ', sin confirmar'}`
    : 'Gestante'
  return (
    <Insignia tipo="informacion">
      {corta && prevista ? (
        <>
          <span aria-hidden title={completo}>
            Parto {prevista.slice(8, 10)}/{prevista.slice(5, 7)}
          </span>
          <span className={estilos.oculto}>{completo}</span>
        </>
      ) : (
        completo
      )}
    </Insignia>
  )
}
