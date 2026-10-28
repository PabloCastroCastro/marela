import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { CLAVE_ANIMALES } from './datos'

export type EventoReproductivo = components['schemas']['EventoReproductivo']
export type DatosEvento = components['schemas']['DatosEvento']
export type TipoEvento = EventoReproductivo['tipo']
export type MetodoDiagnostico = NonNullable<EventoReproductivo['metodo']>
export type ResultadoDiagnostico = NonNullable<EventoReproductivo['resultado']>
export type Gestacion = NonNullable<components['schemas']['Animal']['gestacion']>

export const TIPOS_EVENTO: Record<TipoEvento, string> = {
  cubricion: 'Cubrición',
  inseminacion: 'Inseminación',
  diagnostico: 'Diagnóstico',
  aborto: 'Aborto',
  destete: 'Destete',
}

// Los de la madre; el destete es del ternero
export const EVENTOS_DE_HEMBRA: TipoEvento[] = [
  'cubricion',
  'inseminacion',
  'diagnostico',
  'aborto',
]

export const METODOS: Record<MetodoDiagnostico, string> = {
  ecografia: 'Ecografía',
  palpacion: 'Palpación',
}

export const RESULTADOS: Record<ResultadoDiagnostico, string> = {
  gestante: 'Gestante',
  vacia: 'Vacía',
}

// Duración media de la gestación, la misma que usa el backend para la fecha prevista de parto
export const DIAS_GESTACION = 283

// Cuelga de la clave de animales: al registrar o anular un evento se refrescan también la ficha y
// el listado, que muestran la gestación en curso
export const claveEventos = (explotacionId: string, animalId: string) =>
  [...CLAVE_ANIMALES, explotacionId, 'reproduccion', animalId] as const

export const useEventos = (explotacionId: string, animalId: string) =>
  useQuery({
    queryKey: claveEventos(explotacionId, animalId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales/{animalId}/reproduccion', {
          params: { path: { explotacionId, animalId } },
        }),
      ),
  })

// La fecha más n días, en aaaa-mm-dd
export const masDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

// Lo que se registra desde la ficha: los eventos y el parto (GH-23), que tiene su propia tabla
export type TipoRegistro = TipoEvento | 'parto'

export const TIPOS_REGISTRO: Record<TipoRegistro, string> = { ...TIPOS_EVENTO, parto: 'Parto' }

// Qué se puede registrar a un animal: a las hembras, sus eventos y el parto; a los terneros (con
// madre), el destete. A una gestante, primero lo que le toca: el parto y el diagnóstico.
export function tiposPara(animal: {
  sexo: 'hembra' | 'macho'
  madreId?: string | null
  madreTexto?: string | null
  gestacion?: unknown
}) {
  const tipos: TipoRegistro[] =
    animal.sexo !== 'hembra'
      ? []
      : animal.gestacion
        ? ['parto', 'diagnostico', 'aborto', 'cubricion', 'inseminacion']
        : ['cubricion', 'inseminacion', 'diagnostico', 'parto', 'aborto']
  if (animal.madreId || animal.madreTexto) tipos.push('destete')
  return tipos
}

// Partos (GH-23)
export type Parto = components['schemas']['Parto']
export type DatosParto = components['schemas']['DatosParto']
export type TipoParto = Parto['tipo']

export const TIPOS_PARTO: Record<TipoParto, string> = {
  normal: 'Normal',
  con_ayuda: 'Con ayuda',
  cesarea: 'Cesárea',
}

export const clavePartos = (explotacionId: string, animalId: string) =>
  [...CLAVE_ANIMALES, explotacionId, 'partos', animalId] as const

export const usePartos = (explotacionId: string, animalId: string, activo = true) =>
  useQuery({
    queryKey: clavePartos(explotacionId, animalId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales/{animalId}/partos', {
          params: { path: { explotacionId, animalId } },
        }),
      ),
    enabled: activo,
  })
