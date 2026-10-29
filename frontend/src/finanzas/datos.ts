import { keepPreviousData, useQuery } from '@tanstack/react-query'
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

// Facturas (GH-35)
export type Factura = components['schemas']['Factura']
export type DatosFactura = components['schemas']['DatosFactura']
export type TipoFactura = Factura['tipo']
export type ImpuestoFactura = Factura['impuesto']
export type LineaFactura = Factura['lineas'][number]

export const TIPOS_FACTURA: Record<TipoFactura, string> = {
  recibida: 'Recibida',
  emitida: 'Emitida',
}

export const IMPUESTOS: Record<ImpuestoFactura, string> = {
  iva: 'IVA',
  compensacion: 'Compensación REAGP',
}

// Recibidas, del proveedor; emitidas, al cliente
export const TERCERO: Record<TipoFactura, string> = { recibida: 'Proveedor', emitida: 'Cliente' }

// En las ventas de quien está en el REAGP, compensación; en lo demás, IVA
export const impuestoPorDefecto = (tipo: TipoFactura, regimen: RegimenFiscal): ImpuestoFactura =>
  tipo === 'emitida' && regimen === 'reagp' ? 'compensacion' : 'iva'

// "1.234,56" y "1234.56" → 1234.56; NaN si no es un importe
export const leerImporte = (texto: string) => {
  const t = texto.trim().replace(/\s|€/g, '')
  if (!t) return Number.NaN
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''))
  return Number(t)
}

// La cuota de una línea, como la calcula el backend: el porcentaje de la base, al céntimo
export const cuotaDe = (base: number, porcentaje: number) =>
  Math.round((Math.round(base * 100) * porcentaje) / 100) / 100

export type FiltrosFacturas = {
  tipo?: TipoFactura
  estado?: 'pendiente' | 'pagada'
  q?: string
}

export const useFacturas = (explotacionId: string, filtros: FiltrosFacturas = {}) =>
  useQuery({
    queryKey: [...CLAVE_FINANZAS, explotacionId, 'facturas', filtros],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/facturas', {
          params: { path: { explotacionId }, query: filtros },
        }),
      ),
    placeholderData: keepPreviousData,
  })

export const useFactura = (explotacionId: string, facturaId: string) =>
  useQuery({
    queryKey: [...CLAVE_FINANZAS, explotacionId, 'factura', facturaId],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/facturas/{facturaId}', {
          params: { path: { explotacionId, facturaId } },
        }),
      ),
  })

// El número que se propone para una emitida: el siguiente del año de su fecha
export const useSiguienteNumero = (explotacionId: string, fecha: string, activo: boolean) =>
  useQuery({
    queryKey: [...CLAVE_FINANZAS, explotacionId, 'siguiente-numero', fecha.slice(0, 4)],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/facturas/siguiente-numero', {
          params: { path: { explotacionId }, query: { fecha } },
        }),
      ),
    enabled: activo && /^\d{4}-\d{2}-\d{2}$/.test(fecha),
  })

// El archivo se abre con la cookie de sesión, en otra pestaña
export const urlArchivo = (explotacionId: string, facturaId: string) =>
  `/api/explotaciones/${explotacionId}/facturas/${facturaId}/archivo`

export const ARCHIVOS_ADMITIDOS = 'application/pdf,image/jpeg,image/png,image/webp'
export const TAMANO_MAXIMO_ARCHIVO = 10 * 1024 * 1024

// El esquema da el archivo como texto (format: binary); va como formulario con el archivo
export const subirArchivo = (explotacionId: string, facturaId: string, archivo: File) =>
  datos(
    api.PUT('/api/explotaciones/{explotacionId}/facturas/{facturaId}/archivo', {
      params: { path: { explotacionId, facturaId } },
      body: { archivo: archivo as unknown as string },
      bodySerializer: () => {
        const formulario = new FormData()
        formulario.set('archivo', archivo)
        return formulario
      },
    }),
  )

// "230 KB", "2,4 MB"
export const tamano = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${numero(Math.max(1, Math.round(bytes / 1024)))} KB`
    : `${numero(bytes / (1024 * 1024), 1)} MB`
