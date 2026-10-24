import { Navigate, Outlet, useLocation } from 'react-router'
import { Cargando, EstadoError } from '../componentes/Estados'
import { useSesion } from './sesion'

export const RUTA_ENTRAR = '/entrar'
export const RUTA_CAMBIAR_CONTRASENA = '/cambiar-contrasena'

// Estado de navegación con la dirección a la que volver después de iniciar sesión
export type DesdeDonde = { desde?: string }

// Rutas que exigen sesión: sin ella, al inicio de sesión (y después, de vuelta aquí). Con la contraseña
// temporal sin cambiar, solo se puede cambiar la contraseña.
export function RutaProtegida() {
  const sesion = useSesion()
  const ubicacion = useLocation()
  const aqui = `${ubicacion.pathname}${ubicacion.search}`

  if (sesion.isPending) return <Cargando />
  if (sesion.isError) {
    return <EstadoError alReintentar={() => sesion.refetch()} reintentando={sesion.isFetching} />
  }
  if (!sesion.data) {
    return <Navigate to={RUTA_ENTRAR} replace state={{ desde: aqui } satisfies DesdeDonde} />
  }
  if (sesion.data.usuario.debeCambiarContrasena && ubicacion.pathname !== RUTA_CAMBIAR_CONTRASENA) {
    return (
      <Navigate to={RUTA_CAMBIAR_CONTRASENA} replace state={{ desde: aqui } satisfies DesdeDonde} />
    )
  }
  return <Outlet />
}
