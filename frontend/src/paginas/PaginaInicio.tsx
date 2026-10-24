import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Paginas.module.css'

const ROLES = { administrador: 'Administrador', empleado: 'Empleado' } as const

// Inicio de la explotación, provisional hasta que haya panel: la explotación y el estado del servidor
export function PaginaInicio() {
  const explotacion = useExplotacionActual()
  const salud = useQuery({
    queryKey: ['salud'],
    queryFn: () => datos(api.GET('/api/health')),
  })

  return (
    <section className={estilos.pagina}>
      <h1>{explotacion.nombre}</h1>
      <p className={estilos.version}>
        REGA {explotacion.rega} · {ROLES[explotacion.rol]}
      </p>
      <p className={estilos.estado} role="status">
        {salud.isPending
          ? 'Comprobando el servidor…'
          : salud.data?.estado === 'ok'
            ? 'Servidor y base de datos funcionando'
            : 'El servidor no responde'}
      </p>
      <p className={estilos.version}>Versión {__VERSION__}</p>
    </section>
  )
}
