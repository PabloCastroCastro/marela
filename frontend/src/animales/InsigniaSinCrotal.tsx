import { TriangleAlert } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import { fecha, hoy } from '../formato'
import estilos from './Animales.module.css'
import { DIAS_PARA_CROTALAR } from './datos'
import { masDias } from './reproduccion'

// Ternero aún sin crotal (GH-23): hay que ponérselo en los 20 días siguientes a su nacimiento. En
// aviso mientras hay plazo y en peligro cuando ha vencido. La versión corta ("Sin crotal"), para el
// listado; los lectores de pantalla leen siempre el texto completo.
export function InsigniaSinCrotal({ nacimiento, corta }: { nacimiento: string; corta?: boolean }) {
  const limite = masDias(nacimiento, DIAS_PARA_CROTALAR)
  const vencido = limite < hoy()
  const completo = vencido
    ? `Sin crotal: el plazo venció el ${fecha(limite)}`
    : `Sin crotal: ponlo como tarde el ${fecha(limite)}`
  return (
    <Insignia tipo={vencido ? 'peligro' : 'aviso'} icono={<TriangleAlert aria-hidden />}>
      {corta ? (
        <>
          <span aria-hidden title={completo}>
            Sin crotal
          </span>
          <span className={estilos.oculto}>{completo}</span>
        </>
      ) : (
        completo
      )}
    </Insignia>
  )
}
