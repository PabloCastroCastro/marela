import { CloudUpload } from 'lucide-react'
import { Insignia } from '../componentes/Etiquetas'
import { type Pendiente, useCola } from './cola'
import { abrirPendientes } from './IndicadorConexion'
import estilos from './SinConexion.module.css'

// En una ficha, los registros que se hicieron sin conexión y aún no han llegado (GH-32). Al tocarlos,
// la lista de pendientes, donde se corrigen o se descartan.
export function RegistrosSinEnviar({
  etiqueta,
  de,
}: {
  // "Labores sin enviar"
  etiqueta: string
  de: (p: Pendiente) => boolean
}) {
  const suyos = useCola().filter(de)
  if (suyos.length === 0) return null
  return (
    <ul className={estilos.sinEnviar} aria-label={etiqueta}>
      {suyos.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={abrirPendientes}>
            <span className={estilos.descripcion}>{p.descripcion}</span>
            <Insignia
              tipo={p.estado === 'fallido' ? 'peligro' : 'aviso'}
              icono={<CloudUpload aria-hidden size={14} />}
            >
              {p.estado === 'fallido' ? 'No enviado' : 'Sin enviar'}
            </Insignia>
          </button>
        </li>
      ))}
    </ul>
  )
}
