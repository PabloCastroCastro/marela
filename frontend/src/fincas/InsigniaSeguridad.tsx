import { Hourglass } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import { fecha } from '../formato'
import estilos from './Fincas.module.css'

// Plazo de seguridad en curso de una finca (GH-27): no se cosecha ni se pasta hasta ese día. Como la
// supresión de los animales, la versión corta ("Plazo 22/11") es para el listado; los lectores de
// pantalla leen siempre el texto completo.
export function InsigniaSeguridad({ fin, corta }: { fin: string; corta?: boolean }) {
  const completo = `Plazo de seguridad hasta el ${fecha(fin)}`
  return (
    <Insignia tipo="aviso" icono={<Hourglass aria-hidden />}>
      {corta ? (
        <>
          <span aria-hidden title={completo}>
            Plazo {fin.slice(8, 10)}/{fin.slice(5, 7)}
          </span>
          <span className={estilos.oculto}>{completo}</span>
        </>
      ) : (
        completo
      )}
    </Insignia>
  )
}
