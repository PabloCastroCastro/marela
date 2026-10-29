import type { ComponentType } from 'react'
import { FormularioPesada } from '../animales/FormularioPesada'
import { FormularioAplicacion } from '../fincas/FormularioAplicacion'
import { FormularioLabor } from '../fincas/FormularioLabor'
import { FormularioPastoreo } from '../fincas/FormularioPastoreo'
import { FormularioSalida } from '../fincas/FormularioSalida'
import type { Pendiente } from './cola'

// Qué tipos de registro se pueden corregir desde la lista de pendientes, y con qué formulario. Cada
// sección que funciona sin conexión añade aquí los suyos (GH-32 fincas, GH-33 animales). Lo que el
// formulario necesita y no está en el cuerpo (la finca, el animal) va en el contexto del pendiente.

type Props = { pendiente: Pendiente; alCerrar: () => void }
type Corrector = ComponentType<Props>

const leer = <T,>(texto: string | undefined, porDefecto: T): T => {
  try {
    return texto ? (JSON.parse(texto) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

function CorregirPesada({ pendiente, alCerrar }: Props) {
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

type FincaBreve = { id: string; nombre: string; superficie: number }

function CorregirLabor({ pendiente, alCerrar }: Props) {
  const fincas = leer<FincaBreve[]>(pendiente.contexto.fincas, [])
  return <FormularioLabor fincas={fincas} pendiente={pendiente} alCerrar={alCerrar} />
}

function CorregirAplicacion({ pendiente, alCerrar }: Props) {
  const fincas = leer<FincaBreve[]>(pendiente.contexto.fincas, [])
  return <FormularioAplicacion fincas={fincas} pendiente={pendiente} alCerrar={alCerrar} />
}

function CorregirPastoreo({ pendiente, alCerrar }: Props) {
  const finca = leer(pendiente.contexto.finca, { id: '', nombre: '', finSeguridad: null })
  return <FormularioPastoreo finca={finca} pendiente={pendiente} alCerrar={alCerrar} />
}

function CorregirSalida({ pendiente, alCerrar }: Props) {
  const finca = leer(pendiente.contexto.finca, { id: '', nombre: '' })
  const pastoreo = leer(pendiente.contexto.pastoreo, { id: '', desde: '', animales: 0 })
  return (
    <FormularioSalida pastoreo={pastoreo} finca={finca} pendiente={pendiente} alCerrar={alCerrar} />
  )
}

export const CORRECTORES: Record<string, Corrector> = {
  pesada: CorregirPesada,
  labor: CorregirLabor,
  aplicacion: CorregirAplicacion,
  pastoreo: CorregirPastoreo,
  salida: CorregirSalida,
}
