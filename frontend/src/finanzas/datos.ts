import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { numero } from '../formato'

export type Fiscal = components['schemas']['Fiscal']
export type DatosFiscales = components['schemas']['DatosFiscales']
export type RegimenFiscal = Fiscal['regimen']

export const REGIMENES: Record<RegimenFiscal, string> = {
  reagp: 'Régimen especial agrario (REAGP)',
  general: 'Régimen general de IVA',
}

// "10,5 %", "21 %", "5,25 %": con los decimales que tenga
export const porcentaje = (n: number) =>
  `${numero(n, Number.isInteger(n) ? 0 : Number.isInteger(n * 10) ? 1 : 2)} %`

// Todas las consultas de finanzas cuelgan de esta clave, para refrescarlas juntas tras un cambio
export const CLAVE_FINANZAS = ['finanzas'] as const

export const useFiscal = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_FINANZAS, explotacionId, 'fiscal'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/fiscal', {
          params: { path: { explotacionId } },
        }),
      ),
  })
