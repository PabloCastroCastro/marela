import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'

export type Animal = components['schemas']['Animal']
export type AnimalDetalle = components['schemas']['AnimalDetalle']
export type DatosAnimal = components['schemas']['DatosAnimal']
export type Sexo = Animal['sexo']
export type EstadoAnimal = Animal['estado']

export const SEXOS: Record<Sexo, string> = { hembra: 'Hembra', macho: 'Macho' }

export const ESTADOS: Record<EstadoAnimal, string> = {
  activo: 'Activo',
  vendido: 'Vendido',
  muerto: 'Muerto',
  baja: 'De baja',
}

export type TipoBaja = NonNullable<Animal['tipoBaja']>
export type DatosBaja = components['schemas']['DatosBaja']

export const TIPOS_BAJA: Record<TipoBaja, string> = {
  venta: 'Venta',
  muerte: 'Muerte',
  sacrificio: 'Sacrificio en la explotación',
  robo_extravio: 'Robo o extravío',
  otra: 'Otra causa',
}

// Todas las consultas de animales cuelgan de esta clave, para refrescarlas juntas tras un cambio
export const CLAVE_ANIMALES = ['animales'] as const

export type FiltrosAnimales = {
  q?: string
  estado?: EstadoAnimal
  sexo?: Sexo
  supresion?: 'en_curso'
  gestacion?: 'en_curso'
  crotal?: 'sin'
}

export const useAnimales = (explotacionId: string, filtros: FiltrosAnimales = {}) =>
  useQuery({
    queryKey: [...CLAVE_ANIMALES, explotacionId, 'lista', filtros],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales', {
          params: { path: { explotacionId }, query: filtros },
        }),
      ),
    // Mientras se escribe en el buscador se mantienen los resultados anteriores en vez de parpadear
    placeholderData: keepPreviousData,
  })

export const useAnimal = (explotacionId: string, animalId: string) =>
  useQuery({
    queryKey: [...CLAVE_ANIMALES, explotacionId, 'ficha', animalId],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales/{animalId}', {
          params: { path: { explotacionId, animalId } },
        }),
      ),
  })

export const useRazas = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_ANIMALES, explotacionId, 'razas'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales/razas', {
          params: { path: { explotacionId } },
        }),
      ),
    staleTime: 5 * 60_000,
  })

// "Marela · ES041503456789", o solo el crotal si no tiene nombre. Un ternero aún sin crotal
// (GH-23): "Sin crotal"
export const identificacion = (a: { crotal: string | null; nombre?: string | null }) =>
  a.nombre ? `${a.nombre} · ${a.crotal ?? 'sin crotal'}` : (a.crotal ?? 'Sin crotal')

// Plazo para crotalar a un ternero: los 20 días siguientes a su nacimiento
export const DIAS_PARA_CROTALAR = 20
