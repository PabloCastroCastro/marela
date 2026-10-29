import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'

// Consultas a SIGPAC, Catastro y CartoCiudad a través del backend (GH-52)

export type RecintoSigpac = components['schemas']['RecintoSigpac']
export type ParcelaCatastral = components['schemas']['ParcelaCatastral']
export type Contorno = components['schemas']['Contorno']

export const consultarRecinto = (
  explotacionId: string,
  consulta: { lon: number; lat: number } | { referencia: string },
) =>
  datos(
    api.GET('/api/explotaciones/{explotacionId}/cartografia/recinto', {
      params: { path: { explotacionId }, query: consulta },
    }),
  )

export const consultarCatastro = (explotacionId: string, referencia: string) =>
  datos(
    api.GET('/api/explotaciones/{explotacionId}/cartografia/catastro', {
      params: { path: { explotacionId }, query: { referencia } },
    }),
  )

export const situarMunicipio = (explotacionId: string, nombre: string) =>
  datos(
    api.GET('/api/explotaciones/{explotacionId}/cartografia/municipio', {
      params: { path: { explotacionId }, query: { nombre } },
    }),
  )

// Usos SIGPAC más habituales; los demás se muestran con su código
export const USOS_SIGPAC: Record<string, string> = {
  PS: 'Pastizal',
  PR: 'Pasto arbustivo',
  PA: 'Pasto con arbolado',
  TA: 'Tierra arable',
  TH: 'Huerta',
  FO: 'Forestal',
  FY: 'Frutales',
  FS: 'Frutos secos',
  VI: 'Viñedo',
  OV: 'Olivar',
  IV: 'Invernadero',
  CA: 'Viales',
  ED: 'Edificaciones',
  ZU: 'Zona urbana',
  ZC: 'Zona concentrada',
  AG: 'Agua',
  IM: 'Improductivo',
}

export const usoSigpac = (uso: string | null | undefined) =>
  uso ? (USOS_SIGPAC[uso] ?? uso) : null
