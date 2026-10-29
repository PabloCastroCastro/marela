import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { useCola } from '../sinConexion/cola'
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

type EnCurso = { id: string; desde: string; animales: number }

// El pastoreo en curso de una finca: el que dice el servidor o, si la entrada se registró sin conexión
// y aún no se ha enviado, esa. Con su salida pendiente de enviar, ya no está en curso (GH-32).
export function usePastoreoEnCurso(finca?: {
  id: string
  pastoreo: EnCurso | null
}): EnCurso | null {
  const cola = useCola()
  if (!finca) return null
  const entrada = cola.find(
    (p) =>
      p.tipo === 'pastoreo' &&
      p.contexto.fincaId === finca.id &&
      !(p.cuerpo as { fechaSalida?: string | null }).fechaSalida,
  )
  const cuerpo = entrada?.cuerpo as { fechaEntrada: string; animales: number } | undefined
  const enCurso =
    finca.pastoreo ??
    (entrada && cuerpo
      ? { id: entrada.id, desde: cuerpo.fechaEntrada, animales: cuerpo.animales }
      : null)
  if (!enCurso) return null
  const saliendo = cola.some(
    (p) => p.tipo === 'salida' && p.ruta.endsWith(`/pastoreos/${enCurso.id}/salida`),
  )
  return saliendo ? null : enCurso
}
