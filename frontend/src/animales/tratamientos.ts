import { useQuery } from '@tanstack/react-query'
import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'
import { CLAVE_ANIMALES } from './datos'

export type Tratamiento = components['schemas']['Tratamiento']
export type DatosTratamiento = components['schemas']['DatosTratamiento']
export type MotivoTratamiento = Tratamiento['motivo']
export type ViaAdministracion = NonNullable<Tratamiento['via']>

export const MOTIVOS_TRATAMIENTO: Record<MotivoTratamiento, string> = {
  enfermedad: 'Enfermedad',
  vacuna: 'Vacuna',
  desparasitacion: 'Desparasitación',
  otro: 'Otro motivo',
}

export const VIAS: Record<ViaAdministracion, string> = {
  intramuscular: 'Intramuscular',
  subcutanea: 'Subcutánea',
  intravenosa: 'Intravenosa',
  oral: 'Oral',
  topica: 'Tópica (pour-on, spray…)',
  intramamaria: 'Intramamaria',
  intrauterina: 'Intrauterina',
  otra: 'Otra vía',
}

// Cuelga de la clave de animales: al registrar o anular un tratamiento se refrescan también la
// ficha y el listado, que muestran la supresión en curso
export const claveTratamientos = (explotacionId: string, animalId: string) =>
  [...CLAVE_ANIMALES, explotacionId, 'tratamientos', animalId] as const

export const useTratamientos = (explotacionId: string, animalId: string) =>
  useQuery({
    queryKey: claveTratamientos(explotacionId, animalId),
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/animales/{animalId}/tratamientos', {
          params: { path: { explotacionId, animalId } },
        }),
      ),
  })

export const useOpcionesTratamiento = (explotacionId: string) =>
  useQuery({
    queryKey: [...CLAVE_ANIMALES, explotacionId, 'opciones-tratamiento'],
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/tratamientos/opciones', {
          params: { path: { explotacionId } },
        }),
      ),
    staleTime: 5 * 60_000,
  })

// Día en que termina la supresión: la fecha más los días, en aaaa-mm-dd
export const finSupresion = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
