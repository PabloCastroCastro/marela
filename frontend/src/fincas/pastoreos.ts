import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { CLAVE_FINCAS } from './datos'

export type Pastoreo = components['schemas']['Pastoreo']

// Cuelga de la clave de fincas: al cambiar una finca se refrescan también sus pastoreos
export const clavePastoreos = (explotacionId: string, fincaId: string) =>
  [...CLAVE_FINCAS, explotacionId, 'pastoreos', fincaId] as const

export const usePastoreos = (explotacionId: string, fincaId: string) =>
  useQuery({
    queryKey: clavePastoreos(explotacionId, fincaId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fincas/{fincaId}/pastoreos', {
          params: { path: { explotacionId, fincaId } },
        }),
      ),
  })

// "12 animales", "1 animal"
export const animales = (n: number) => `${n} ${n === 1 ? 'animal' : 'animales'}`
