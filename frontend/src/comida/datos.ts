import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { numero } from '../formato'

export type Almacen = components['schemas']['Almacen']
export type DatosAlmacen = components['schemas']['DatosAlmacen']
export type TipoAlmacen = Almacen['tipo']
export type UnidadAlmacen = Almacen['unidad']
export type Movimiento = components['schemas']['MovimientoComida']
export type DatosMovimiento = components['schemas']['DatosMovimiento']
export type TipoMovimiento = Movimiento['tipo']
export type OrigenEntrada = NonNullable<Movimiento['origen']>
export type TipoAjuste = NonNullable<Movimiento['ajuste']>

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

export const TIPOS_MOVIMIENTO: Record<TipoMovimiento, string> = {
  entrada: 'Entrada',
  salida: 'Salida (ración)',
  ajuste: 'Ajuste de inventario',
}

export const ORIGENES_ENTRADA: Record<OrigenEntrada, string> = {
  compra: 'Compra',
  produccion_propia: 'Producción propia',
}

export const TIPOS_AJUSTE: Record<TipoAjuste, string> = {
  recuento: 'Recuento',
  merma: 'Merma',
}

// Con decimales solo si los tiene (las cantidades llevan dos como mucho)
const cifra = (n: number) => numero(n, Number.isInteger(n) ? 0 : 2)

// "120 unidades", "1 unidad", "3.500 kg", "-40 kg"
export const cantidad = (n: number, unidad: UnidadAlmacen) =>
  unidad === 'kg' ? `${cifra(n)} kg` : `${cifra(n)} ${Math.abs(n) === 1 ? 'unidad' : 'unidades'}`

// Lo que cambia el stock, con signo: "+120 kg", "−30 kg"
export const diferencia = (n: number, unidad: UnidadAlmacen) =>
  n > 0 ? `+${cantidad(n, unidad)}` : n < 0 ? `−${cantidad(-n, unidad)}` : cantidad(0, unidad)

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

export const useAlmacen = (explotacionId: string, almacenId: string) =>
  useQuery({
    queryKey: [...CLAVE_COMIDA, explotacionId, 'almacen', almacenId],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/almacenes/{almacenId}', {
          params: { path: { explotacionId, almacenId } },
        }),
      ),
  })

export type FiltrosMovimientos = { desde?: string; hasta?: string; tipo?: TipoMovimiento }

export const useMovimientos = (
  explotacionId: string,
  almacenId: string,
  filtros: FiltrosMovimientos = {},
) =>
  useQuery({
    queryKey: [...CLAVE_COMIDA, explotacionId, 'movimientos', almacenId, filtros],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos', {
          params: { path: { explotacionId, almacenId }, query: filtros },
        }),
      ),
    placeholderData: keepPreviousData,
  })
