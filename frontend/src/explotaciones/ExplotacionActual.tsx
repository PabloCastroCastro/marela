import { Lock } from 'lucide-react'
import { createContext, type ReactNode, useContext } from 'react'
import { EstadoVacio } from '../componentes/Estados'
import type { DetalleExplotacion, Modulo } from './datos'

// Explotación con la que se está trabajando (la de la URL), con el rol del usuario y sus módulos

const Contexto = createContext<DetalleExplotacion | null>(null)

export const ProveedorExplotacion = Contexto.Provider

export function useExplotacionActual() {
  const explotacion = useContext(Contexto)
  if (!explotacion) throw new Error('useExplotacionActual solo funciona dentro de una explotación')
  return explotacion
}

const NOMBRES: Record<Modulo, string> = {
  animales: 'Animales',
  comida: 'Comida',
  fincas: 'Fincas',
  finanzas: 'Finanzas',
  administracion: 'la administración de la explotación',
}

// Muestra el contenido solo si el rol da acceso al módulo (el backend lo comprueba igualmente)
export function SoloModulo({ modulo, children }: { modulo: Modulo; children: ReactNode }) {
  const { modulos } = useExplotacionActual()
  if (modulos.includes(modulo)) return children
  return (
    <EstadoVacio
      icono={<Lock size={32} />}
      titulo={`No tienes acceso a ${NOMBRES[modulo]}`}
      descripcion="Tu rol en esta explotación no lo permite. Si lo necesitas, habla con el administrador."
    />
  )
}
