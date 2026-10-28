import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { numero } from '../formato'
import { CLAVE_ANIMALES } from './datos'

export type Pesada = components['schemas']['Pesada']
export type DatosPesada = components['schemas']['DatosPesada']
export type MomentoPesada = Pesada['momento']

export const MOMENTOS: Record<MomentoPesada, string> = {
  nacimiento: 'Al nacer',
  destete: 'Al destete',
  venta: 'A la venta',
  otro: 'Otra pesada',
}

// Cuelga de la clave de animales: al dar de baja o editar un animal se refrescan también
export const clavePesadas = (explotacionId: string, animalId: string) =>
  [...CLAVE_ANIMALES, explotacionId, 'pesos', animalId] as const

export const usePesadas = (explotacionId: string, animalId: string) =>
  useQuery({
    queryKey: clavePesadas(explotacionId, animalId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales/{animalId}/pesos', {
          params: { path: { explotacionId, animalId } },
        }),
      ),
  })

const DIA = 86_400_000
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA)

// Ganancia media diaria en kg/día entre dos pesadas; null si son del mismo día
export function gananciaDiaria(anterior: Pesada, actual: Pesada) {
  const d = diasEntre(anterior.fecha, actual.fecha)
  return d > 0 ? (actual.kg - anterior.kg) / d : null
}

// Las pesadas (de la más antigua a la más reciente, como las da la API) con la ganancia desde la
// anterior
export const conGanancia = (pesadas: Pesada[]) =>
  pesadas.map((p, i) => {
    const anterior = pesadas[i - 1]
    return { ...p, ganancia: anterior ? gananciaDiaria(anterior, p) : null }
  })

// Ganancia media de toda la serie, de la primera pesada a la última
export function gananciaMedia(pesadas: Pesada[]) {
  const primera = pesadas[0]
  const ultima = pesadas.at(-1)
  return primera && ultima && primera !== ultima ? gananciaDiaria(primera, ultima) : null
}

// "+1,05 kg/día", con signo
export const ganancia = (g: number) =>
  `${g > 0 ? '+' : g < 0 ? '−' : ''}${numero(Math.abs(g), 2)} kg/día`
