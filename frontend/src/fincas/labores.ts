import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { hectareas, numero } from '../formato'
import { CLAVE_FINCAS } from './datos'

export type Labor = components['schemas']['Labor']
export type TipoLabor = Labor['tipo']
export type UnidadCosecha = NonNullable<Labor['unidad']>

export const TIPOS_LABOR: Record<TipoLabor, string> = {
  siembra: 'Siembra',
  cosecha: 'Cosecha',
  otra: 'Otra labor',
}

export const UNIDADES: Record<UnidadCosecha, string> = {
  kg: 'kg',
  t: 'toneladas',
  pacas: 'pacas',
  rolos: 'rolos',
  remolques: 'remolques',
}

// Para sugerir en el formulario, junto a los ya usados en la explotación
export const CULTIVOS_HABITUALES = [
  'Pradera',
  'Raigrás',
  'Maíz forrajero',
  'Trigo',
  'Centeno',
  'Avena',
  'Alfalfa',
  'Trébol',
]
export const LABORES_HABITUALES = [
  'Siega',
  'Laboreo',
  'Gradeo',
  'Rulado',
  'Riego',
  'Desbroce',
  'Encalado',
]

// Cuelga de la clave de fincas: al cambiar una finca se refrescan también sus labores
export const claveLabores = (explotacionId: string, fincaId: string) =>
  [...CLAVE_FINCAS, explotacionId, 'labores', fincaId] as const

export const useLabores = (explotacionId: string, fincaId: string) =>
  useQuery({
    queryKey: claveLabores(explotacionId, fincaId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fincas/{fincaId}/labores', {
          params: { path: { explotacionId, fincaId } },
        }),
      ),
  })

export const useOpcionesLabor = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_FINCAS, explotacionId, 'opciones-labor'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/labores/opciones', {
          params: { path: { explotacionId } },
        }),
      ),
    staleTime: 5 * 60_000,
  })

// "Siembra: Maíz forrajero", "Cosecha: Pradera" o la labor ("Siega")
export const tituloLabor = (l: Labor) =>
  l.tipo === 'otra' ? (l.labor ?? TIPOS_LABOR.otra) : `${TIPOS_LABOR[l.tipo]}: ${l.cultivo}`

// "42 rolos", "6.500 kg"
export const cantidadCosechada = (l: Labor) =>
  l.cantidad != null && l.unidad
    ? `${numero(l.cantidad, l.cantidad % 1 ? 2 : 0)} ${UNIDADES[l.unidad]}`
    : null

export const superficieLabor = (l: Labor) => hectareas(l.superficie)
