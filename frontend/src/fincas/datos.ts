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

// También para descargar el listado al entrar en la explotación, y tenerlo sin conexión (GH-31)
export const consultaFincas = (explotacionId: string, filtros: FiltrosFincas = {}) => ({
  queryKey: [...CLAVE_FINCAS, explotacionId, 'lista', filtros],
  queryFn: () =>
    datos(
      api.GET('/api/explotaciones/{explotacionId}/fincas', {
        params: { path: { explotacionId }, query: filtros },
      }),
    ),
})

export const useFincas = (explotacionId: string, filtros: FiltrosFincas = {}) =>
  useQuery({ ...consultaFincas(explotacionId, filtros), placeholderData: keepPreviousData })

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

// "36:24:0:0:12:45:1": provincia, municipio, agregado, zona, polígono, parcela y recinto, como la
// escribe el SIGPAC; null si la parcela no la tiene
export const referenciaSigpac = (p: Parcela) =>
  p.recinto
    ? [
        p.provincia,
        p.municipio,
        p.agregado ?? '0',
        p.zona ?? '0',
        p.poligono,
        p.parcela,
        p.recinto,
      ].join(':')
    : null

// Contornos de las parcelas de todas las fincas, para el mapa (GH-91)
export const useContornos = (explotacionId: string, activo = true) =>
  useQuery({
    queryKey: [...CLAVE_FINCAS, explotacionId, 'contornos'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fincas/contornos', {
          params: { path: { explotacionId } },
        }),
      ),
    enabled: activo,
  })
