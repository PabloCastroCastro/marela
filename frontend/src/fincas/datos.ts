import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'

export type Finca = components['schemas']['Finca']
export type FincaDetalle = components['schemas']['FincaDetalle']
export type DatosFinca = components['schemas']['DatosFinca']
export type Parcela = FincaDetalle['parcelas'][number]
export type Regimen = Finca['regimen']

export const REGIMENES: Record<Regimen, string> = {
  propiedad: 'Propiedad',
  arrendamiento: 'Arrendamiento',
  aparceria: 'Aparcería',
  cesion: 'Cesión',
  otro: 'Otro',
}

// Todas las consultas de fincas cuelgan de esta clave, para refrescarlas juntas tras un cambio
export const CLAVE_FINCAS = ['fincas'] as const

export type FiltrosFincas = {
  q?: string
  activa?: 'true' | 'false'
  seguridad?: 'en_curso'
  pastoreo?: 'en_curso'
}

export const useFincas = (explotacionId: string, filtros: FiltrosFincas = {}) =>
  useQuery({
    queryKey: [...CLAVE_FINCAS, explotacionId, 'lista', filtros],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fincas', {
          params: { path: { explotacionId }, query: filtros },
        }),
      ),
    placeholderData: keepPreviousData,
  })

export const useFinca = (explotacionId: string, fincaId: string) =>
  useQuery({
    queryKey: [...CLAVE_FINCAS, explotacionId, 'ficha', fincaId],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fincas/{fincaId}', {
          params: { path: { explotacionId, fincaId } },
        }),
      ),
  })

// "36:24:12:45:1", como la escribe el SIGPAC; null si la parcela no la tiene
export const referenciaSigpac = (p: Parcela) =>
  p.recinto ? [p.provincia, p.municipio, p.poligono, p.parcela, p.recinto].join(':') : null
