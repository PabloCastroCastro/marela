import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'

export type ExplotacionDelUsuario = components['schemas']['ExplotacionDelUsuario']
export type DetalleExplotacion = components['schemas']['DetalleExplotacion']
export type Modulo = DetalleExplotacion['modulos'][number]

export const CLAVE_EXPLOTACIONES = ['explotaciones'] as const

export const useExplotaciones = () =>
  useQuery({
    queryKey: CLAVE_EXPLOTACIONES,
    queryFn: () => datos(api.GET('/api/explotaciones')),
  })

export const useExplotacion = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_EXPLOTACIONES, explotacionId],
    queryFn: () =>
      datos(api.GET('/api/explotaciones/{explotacionId}', { params: { path: { explotacionId } } })),
  })

export const rutaExplotacion = (explotacionId: string) => `/explotaciones/${explotacionId}`

// Última explotación usada en este dispositivo, para volver a ella al abrir la aplicación. Si el
// navegador no deja guardar (modo privado…), simplemente no se recuerda.
const CLAVE_ULTIMA = 'marela.ultimaExplotacion'

export function leerUltimaExplotacion(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA)
  } catch {
    return null
  }
}

export function guardarUltimaExplotacion(explotacionId: string) {
  try {
    localStorage.setItem(CLAVE_ULTIMA, explotacionId)
  } catch {
    // Sin almacenamiento: no pasa nada
  }
}
