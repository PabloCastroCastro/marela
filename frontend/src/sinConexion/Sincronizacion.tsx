import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAvisos } from '../componentes/Avisos'
import { delUsuario, enviandoCola, procesarCola, useCola } from './cola'
import { useConexion } from './conexion'
import { abrirPendientes } from './IndicadorConexion'

// Reintentos mientras quede algo pendiente, aunque el navegador no avise de que ha vuelto la red
const CADA = 30_000

// Envía los registros pendientes del usuario (GH-31): al entrar, al recuperar la conexión, cuando se
// encola uno nuevo y, mientras quede alguno, cada 30 s. Avisa de lo enviado y de lo que falla.
export function Sincronizacion({ usuarioId }: { usuarioId: string }) {
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const conexion = useConexion()
  const suyos = delUsuario(useCola(), usuarioId)
  const hayPorEnviar = suyos.some((p) => p.estado === 'pendiente')

  useEffect(() => {
    if (!conexion || !hayPorEnviar) return
    const enviar = async () => {
      // Una sola vuelta a la vez, y un solo aviso de cada una
      if (enviandoCola()) return
      const { enviados, fallidos } = await procesarCola(cliente, usuarioId)
      if (enviados > 0)
        avisar({
          tipo: 'exito',
          mensaje:
            enviados === 1
              ? 'Se ha enviado 1 registro pendiente'
              : `Se han enviado ${enviados} registros pendientes`,
        })
      if (fallidos > 0)
        avisar({
          tipo: 'error',
          mensaje:
            fallidos === 1
              ? '1 registro pendiente no se ha podido enviar'
              : `${fallidos} registros pendientes no se han podido enviar`,
          accion: { texto: 'Ver', alPulsar: abrirPendientes },
        })
    }
    void enviar()
    const reintentos = setInterval(enviar, CADA)
    return () => clearInterval(reintentos)
  }, [conexion, hayPorEnviar, cliente, usuarioId, avisar])

  return null
}
