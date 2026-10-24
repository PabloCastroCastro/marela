import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import estilos from './Paginas.module.css'

// Página de inicio provisional: comprueba que la cadena frontend → proxy → API → base de datos funciona
export function PaginaInicio() {
  const salud = useQuery({
    queryKey: ['salud'],
    queryFn: () => datos(api.GET('/api/health')),
  })

  return (
    <section className={estilos.pagina}>
      <h1>Marela</h1>
      <p>Gestión de ganadería de vacuno: animales, comida, fincas y finanzas.</p>
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
