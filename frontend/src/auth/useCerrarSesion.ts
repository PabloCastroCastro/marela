import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useAvisos } from '../componentes/Avisos'
import { RUTA_ENTRAR } from './RutaProtegida'
import { CLAVE_SESION, cerrarSesion } from './sesion'

// Cierra la sesión, borra los datos guardados en memoria y vuelve al inicio de sesión
export function useCerrarSesion() {
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const { avisar } = useAvisos()

  return async () => {
    try {
      await cerrarSesion()
    } catch {
      avisar({ tipo: 'error', mensaje: 'No se ha podido cerrar la sesión. Inténtalo de nuevo.' })
      return
    }
    cliente.clear()
    cliente.setQueryData(CLAVE_SESION, null)
    navegar(RUTA_ENTRAR, { replace: true })
  }
}
