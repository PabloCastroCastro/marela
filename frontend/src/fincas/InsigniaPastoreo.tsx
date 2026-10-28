import { Insignia } from '../componentes/Etiquetas'
import { Vaca } from '../componentes/iconos'
import { fecha } from '../formato'
import estilos from './Fincas.module.css'
import { animales } from './pastoreos'

// Pastoreo en curso de una finca (GH-28). Como el plazo de seguridad, la versión corta
// ("Pastando 12") es para el listado; los lectores de pantalla leen siempre el texto completo.
export function InsigniaPastoreo({
  pastoreo,
  corta,
}: {
  pastoreo: { desde: string; animales: number }
  corta?: boolean
}) {
  const completo = `Pastando ${animales(pastoreo.animales)} desde el ${fecha(pastoreo.desde)}`
  return (
    <Insignia tipo="informacion" icono={<Vaca aria-hidden />}>
      {corta ? (
        <>
          <span aria-hidden title={completo}>
            Pastando {pastoreo.animales}
          </span>
          <span className={estilos.oculto}>{completo}</span>
        </>
      ) : (
        completo
      )}
    </Insignia>
  )
}
