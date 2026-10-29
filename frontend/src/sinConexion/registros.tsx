import type { ComponentType } from 'react'
import { FormularioPesada } from '../animales/FormularioPesada'
import type { Pendiente } from './cola'

// Qué tipos de registro se pueden corregir desde la lista de pendientes, y con qué formulario. Cada
// sección que funciona sin conexión añade aquí los suyos (GH-32 fincas, GH-33 animales).

type Corrector = ComponentType<{ pendiente: Pendiente; alCerrar: () => void }>

function CorregirPesada({ pendiente, alCerrar }: { pendiente: Pendiente; alCerrar: () => void }) {
  const c = pendiente.contexto
  return (
    <FormularioPesada
      animal={{
        id: c.animalId ?? '',
        crotal: c.crotal || null,
        nombre: c.nombre || null,
        fechaNacimiento: c.fechaNacimiento ?? '',
        fechaBaja: c.fechaBaja || null,
      }}
      pendiente={pendiente}
      alCerrar={alCerrar}
    />
  )
}

export const CORRECTORES: Record<string, Corrector> = {
  pesada: CorregirPesada,
}
