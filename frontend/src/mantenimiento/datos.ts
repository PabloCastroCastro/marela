import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'

export type Equipo = components['schemas']['Equipo']
export type DatosEquipo = components['schemas']['DatosEquipo']
export type TipoEquipo = Equipo['tipo']

export const TIPOS_EQUIPO: Record<TipoEquipo, string> = {
  maquinaria: 'Maquinaria',
  infraestructura: 'Infraestructura',
}

// Todas las consultas de mantenimiento cuelgan de esta clave, para refrescarlas juntas tras un cambio
export const CLAVE_MANTENIMIENTO = ['mantenimiento'] as const

export type FiltrosEquipos = { q?: string; tipo?: TipoEquipo; activo?: 'true' | 'false' }

export const useEquipos = (explotacionId: string, filtros: FiltrosEquipos = {}) =>
  useQuery({
    queryKey: [...CLAVE_MANTENIMIENTO, explotacionId, 'equipos', filtros],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/equipos', {
          params: { path: { explotacionId }, query: filtros },
        }),
      ),
    placeholderData: keepPreviousData,
  })

export const useEquipo = (explotacionId: string, equipoId: string) =>
  useQuery({
    queryKey: [...CLAVE_MANTENIMIENTO, explotacionId, 'equipo', equipoId],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/equipos/{equipoId}', {
          params: { path: { explotacionId, equipoId } },
        }),
      ),
  })
