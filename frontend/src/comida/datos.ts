import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { kilos, numero } from '../formato'

export type Almacen = components['schemas']['Almacen']
export type DatosAlmacen = components['schemas']['DatosAlmacen']
export type TipoAlmacen = Almacen['tipo']
export type UnidadAlmacen = Almacen['unidad']

// Qué comida guarda
export const TIPOS_ALMACEN: Record<TipoAlmacen, string> = {
  hierba_verde: 'Hierba verde',
  hierba_seca: 'Hierba seca',
  maiz: 'Maíz',
  pienso: 'Pienso',
  otro: 'Otra comida',
}

export const UNIDADES_ALMACEN: Record<UnidadAlmacen, string> = {
  unidades: 'Unidades (pacas)',
  kg: 'Kilos',
}

// "120 unidades", "1 unidad", "3.500 kg"
export const cantidad = (n: number, unidad: UnidadAlmacen) =>
  unidad === 'kg' ? kilos(n) : `${numero(n)} ${Math.abs(n) === 1 ? 'unidad' : 'unidades'}`

// Todas las consultas de comida cuelgan de esta clave, para refrescarlas juntas tras un cambio
export const CLAVE_COMIDA = ['comida'] as const

// Todos los almacenes, activos y desactivados: la pantalla los separa
export const useAlmacenes = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_COMIDA, explotacionId, 'almacenes'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/almacenes', {
          params: { path: { explotacionId } },
        }),
      ),
  })
