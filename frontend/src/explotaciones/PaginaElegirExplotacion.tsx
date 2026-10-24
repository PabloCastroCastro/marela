import { Check, ChevronRight, Tractor } from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { useSesion } from '../auth/sesion'
import { useCerrarSesion } from '../auth/useCerrarSesion'
import { Boton } from '../componentes/Boton'
import { Cargando, EstadoError, EstadoVacio } from '../componentes/Estados'
import {
  type ExplotacionDelUsuario,
  leerUltimaExplotacion,
  rutaExplotacion,
  useExplotaciones,
} from './datos'
import estilos from './Explotaciones.module.css'

const ROLES = { administrador: 'Administrador', empleado: 'Empleado' } as const

// "/": abre la última explotación usada, o la única; con varias y ninguna recordada, a elegir
export function RedireccionInicial() {
  const explotaciones = useExplotaciones()
  if (explotaciones.isPending) return <Cargando />
  const lista = explotaciones.data ?? []
  const ultima = leerUltimaExplotacion()
  const elegida = lista.length === 1 ? lista[0] : lista.find((e) => e.id === ultima)
  return <Navigate to={elegida ? rutaExplotacion(elegida.id) : '/explotaciones'} replace />
}

// "/explotaciones": con qué explotación trabajar. Con una sola se entra directamente.
export function PaginaElegirExplotacion() {
  const explotaciones = useExplotaciones()
  const sesion = useSesion()
  const cerrarSesion = useCerrarSesion()

  if (explotaciones.isPending) return <Cargando />
  if (explotaciones.isError) {
    return (
      <main className={estilos.pantalla}>
        <EstadoError
          alReintentar={() => explotaciones.refetch()}
          reintentando={explotaciones.isFetching}
        />
      </main>
    )
  }
  const lista = explotaciones.data
  const unica = lista.length === 1 ? lista[0] : undefined
  if (unica) return <Navigate to={rutaExplotacion(unica.id)} replace />

  return (
    <main className={estilos.pantalla}>
      <div className={estilos.contenido}>
        {lista.length === 0 ? (
          <EstadoVacio
            icono={<Tractor size={32} />}
            titulo="Aún no perteneces a ninguna explotación"
            descripcion={
              sesion.data?.usuario.propietario
                ? 'Como propietario de la plataforma, podrás crear explotaciones desde aquí en cuanto esté disponible.'
                : 'Pide al administrador de tu explotación que te añada.'
            }
          />
        ) : (
          <>
            <h1>¿Con qué explotación vas a trabajar?</h1>
            <ListaExplotaciones explotaciones={lista} />
          </>
        )}
        <Boton variante="texto" anchoCompleto onClick={cerrarSesion}>
          Cerrar sesión
        </Boton>
      </div>
    </main>
  )
}

// Lista de explotaciones para elegir; marca la actual si se indica
export function ListaExplotaciones({
  explotaciones,
  actual,
  alElegir,
}: {
  explotaciones: ExplotacionDelUsuario[]
  actual?: string
  alElegir?: () => void
}) {
  return (
    <ul className={estilos.lista}>
      {explotaciones.map((e) => (
        <li key={e.id}>
          <Link
            to={rutaExplotacion(e.id)}
            className={estilos.opcion}
            aria-current={e.id === actual ? 'true' : undefined}
            onClick={alElegir}
          >
            <span className={estilos.datos}>
              <span className={estilos.nombre}>{e.nombre}</span>
              <span className={estilos.detalle}>
                REGA {e.rega} · {ROLES[e.rol]}
              </span>
            </span>
            {e.id === actual ? (
              <Check aria-label="Actual" size={20} className={estilos.marca} />
            ) : (
              <ChevronRight aria-hidden size={20} className={estilos.flecha} />
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
