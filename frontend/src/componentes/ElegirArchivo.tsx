import { Paperclip } from 'lucide-react'
import type { ReactNode } from 'react'
import estilos from './ElegirArchivo.module.css'

// Botón para elegir un archivo de los tipos de `aceptar` (en el móvil, una foto también se puede
// hacer con la cámara). Es un input de archivo con forma de botón: se usa con el teclado y lo lee
// el lector de pantalla como tal.
export function ElegirArchivo({
  alElegir,
  aceptar,
  texto = 'Adjuntar archivo',
  icono = <Paperclip aria-hidden size={18} />,
}: {
  alElegir: (archivo: File | undefined) => void
  aceptar: string
  texto?: string
  icono?: ReactNode
}) {
  return (
    <label className={estilos.elegir}>
      <input
        type="file"
        accept={aceptar}
        className={estilos.oculto}
        onChange={(e) => {
          alElegir(e.target.files?.[0])
          // Para poder elegir otra vez el mismo archivo
          e.target.value = ''
        }}
      />
      {icono}
      {texto}
    </label>
  )
}
