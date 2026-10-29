import { Ban } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import estilos from './Animales.module.css'

type Marca = { desde: string; motivo: string; alcance: 'hijas' | 'descendencia' }

// Reposición (GH-110): la vaca con una enfermedad que se transmite a la descendencia y cada animal
// afectado, con el motivo. Si es solo para sus hijas, "No dejar hijas" y "Madre no apta"; si afecta a
// toda su descendencia, "Afecta a su descendencia" y "Madre con paratuberculosis". La versión corta,
// para el listado; los lectores de pantalla leen siempre el texto completo.
export function InsigniaReposicion({
  propia,
  madre,
  corta,
}: {
  propia?: Marca | null
  madre?: Marca | null
  corta?: boolean
}) {
  const marca = propia ?? madre
  if (!marca) return null
  const toda = marca.alcance === 'descendencia'
  const breve = propia
    ? toda
      ? 'Descendencia afectada'
      : 'No dejar hijas'
    : toda
      ? `Madre con ${marca.motivo.toLowerCase()}`
      : 'Madre no apta'
  const completo = propia
    ? toda
      ? `Afecta a su descendencia: ${marca.motivo}`
      : `No dejar hijas para reposición: ${marca.motivo}`
    : toda
      ? `Madre con ${marca.motivo.toLowerCase()}`
      : `Madre no apta para reposición: ${marca.motivo}`
  return (
    <Insignia tipo="peligro" icono={<Ban aria-hidden />}>
      {corta ? (
        <>
          <span aria-hidden title={completo}>
            {breve}
          </span>
          <span className={estilos.oculto}>{completo}</span>
        </>
      ) : (
        completo
      )}
    </Insignia>
  )
}
