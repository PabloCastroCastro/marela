import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { hoy } from '../formato'

export type Equipo = components['schemas']['Equipo']
export type DatosEquipo = components['schemas']['DatosEquipo']
export type TipoEquipo = Equipo['tipo']
export type Tarea = components['schemas']['Tarea']
export type DatosTarea = components['schemas']['DatosTarea']
export type Prioridad = Tarea['prioridad']

export const TIPOS_EQUIPO: Record<TipoEquipo, string> = {
  maquinaria: 'Maquinaria',
  infraestructura: 'Infraestructura',
}

export const PRIORIDADES: Record<Prioridad, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
}

// Pendiente y con la fecha límite ya pasada
export const vencida = (t: Tarea) => !t.hecha && t.fechaLimite !== null && t.fechaLimite < hoy()

// "3 tareas pendientes", "1 tarea pendiente"
export const pendientes = (n: number) => (n === 1 ? '1 tarea pendiente' : `${n} tareas pendientes`)

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

export type FiltrosTareas = {
  estado?: 'pendiente' | 'hecha'
  para?: 'mi'
  equipoId?: string
}

export const useTareas = (explotacionId: string, filtros: FiltrosTareas = {}) =>
  useQuery({
    queryKey: [...CLAVE_MANTENIMIENTO, explotacionId, 'tareas', filtros],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/tareas', {
          params: { path: { explotacionId }, query: filtros },
        }),
      ),
    placeholderData: keepPreviousData,
  })

// Para el formulario de la tarea: a quién asignarla
export const usePersonas = (explotacionId: string, activo: boolean) =>
  useQuery({
    queryKey: [...CLAVE_MANTENIMIENTO, explotacionId, 'personas'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/tareas/personas', {
          params: { path: { explotacionId } },
        }),
      ),
    enabled: activo,
  })
