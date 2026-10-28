import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { numero } from '../formato'
import { CLAVE_FINCAS } from './datos'

export type Aplicacion = components['schemas']['Aplicacion']
export type TipoAplicacion = Aplicacion['tipo']
export type TipoAbono = NonNullable<Aplicacion['tipoAbono']>
export type UnidadDosis = Aplicacion['unidadDosis']

export const TIPOS_APLICACION: Record<TipoAplicacion, string> = {
  abono: 'Abono',
  fitosanitario: 'Fitosanitario',
}

export const TIPOS_ABONO: Record<TipoAbono, string> = {
  mineral: 'Mineral',
  organico: 'Orgánico',
}

export const UNIDADES_DOSIS: Record<UnidadDosis, string> = {
  kg_ha: 'kg/ha',
  t_ha: 't/ha',
  l_ha: 'l/ha',
  m3_ha: 'm³/ha',
}

// Para sugerir en el formulario, junto a los ya usados en la explotación
export const ABONOS_HABITUALES = [
  'Purín de vacuno',
  'Estiércol de vacuno',
  'Compost',
  'NPK 8-24-16',
  'NPK 15-15-15',
  'Urea 46 %',
  'Nitrato amónico cálcico 27 %',
  'Cal agrícola',
]

// Cuelga de la clave de fincas: al cambiar una finca se refrescan también sus aplicaciones
export const claveAplicaciones = (explotacionId: string, fincaId: string) =>
  [...CLAVE_FINCAS, explotacionId, 'aplicaciones', fincaId] as const

export const useAplicaciones = (explotacionId: string, fincaId: string) =>
  useQuery({
    queryKey: claveAplicaciones(explotacionId, fincaId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fincas/{fincaId}/aplicaciones', {
          params: { path: { explotacionId, fincaId } },
        }),
      ),
  })

export const useOpcionesAplicacion = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_FINCAS, explotacionId, 'opciones-aplicacion'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/aplicaciones/opciones', {
          params: { path: { explotacionId } },
        }),
      ),
    staleTime: 5 * 60_000,
  })

// "30 m³/ha", "1,5 l/ha"
export const dosis = (a: Aplicacion) =>
  `${a.dosis % 1 ? numero(a.dosis, 3).replace(/0+$/, '') : numero(a.dosis)} ${UNIDADES_DOSIS[a.unidadDosis]}`
