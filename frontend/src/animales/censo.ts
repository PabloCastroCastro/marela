import { api, datos } from '../api/cliente'
import type { components } from '../api/esquema'

// Importación de los animales desde el censo en PDF de la Xunta (GH-130)

export type VistaPreviaCenso = components['schemas']['VistaPreviaCenso']
export type AnimalNuevoCenso = components['schemas']['AnimalNuevoCenso']
export type Diferencia = VistaPreviaCenso['existentes'][number]['diferencias'][number]

// El esquema da el archivo como texto (format: binary); va como formulario con el archivo
const conArchivo = (archivo: File) => ({
  body: { archivo: archivo as unknown as string },
  bodySerializer: () => {
    const formulario = new FormData()
    formulario.set('archivo', archivo)
    return formulario
  },
})

// Qué se importaría, sin cambiar nada
export const vistaPreviaCenso = (explotacionId: string, archivo: File) =>
  datos(
    api.POST('/api/explotaciones/{explotacionId}/censo/vista-previa', {
      params: { path: { explotacionId } },
      ...conArchivo(archivo),
    }),
  )

// Da de alta los animales nuevos del censo, todos o ninguno
export const importarCenso = (explotacionId: string, archivo: File) =>
  datos(
    api.POST('/api/explotaciones/{explotacionId}/censo/importacion', {
      params: { path: { explotacionId } },
      ...conArchivo(archivo),
    }),
  )

export const CAMPOS_DIFERENCIA: Record<Diferencia['campo'], string> = {
  sexo: 'Sexo',
  raza: 'Raza',
  fechaNacimiento: 'Nacimiento',
  madre: 'Madre',
}
