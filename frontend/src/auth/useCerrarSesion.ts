import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useAvisos } from '../componentes/Avisos'
import { useConfirmacion } from '../componentes/Confirmacion'
import { delUsuario, vaciarCola, verCola } from '../sinConexion/cola'
import { borrarConsultas } from '../sinConexion/persistencia'
import { RUTA_ENTRAR } from './RutaProtegida'
import { CLAVE_SESION, cerrarSesion, type Sesion } from './sesion'

// Cierra la sesión, borra los datos guardados (en memoria y en el dispositivo, GH-31) y vuelve al
// inicio de sesión. Si quedan registros sin enviar, avisa antes: se perderían.
export function useCerrarSesion() {
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()

  return async () => {
    const usuarioId = cliente.getQueryData<Sesion | null>(CLAVE_SESION)?.usuario.id
    const sinEnviar = delUsuario(verCola(), usuarioId).length
    if (sinEnviar > 0) {
      const ok = await confirmar({
        titulo: '¿Cerrar sesión sin enviar los registros?',
        mensaje:
          sinEnviar === 1
            ? 'Hay 1 registro sin enviar. Si cierras sesión, se borrará de este dispositivo.'
            : `Hay ${sinEnviar} registros sin enviar. Si cierras sesión, se borrarán de este dispositivo.`,
        textoConfirmar: 'Cerrar sesión',
      })
      if (!ok) return
    }
    try {
      await cerrarSesion()
    } catch {
      avisar({ tipo: 'error', mensaje: 'No se ha podido cerrar la sesión. Inténtalo de nuevo.' })
      return
    }
    cliente.clear()
    vaciarCola(usuarioId)
    await borrarConsultas()
    cliente.setQueryData(CLAVE_SESION, null)
    navegar(RUTA_ENTRAR, { replace: true })
  }
}
