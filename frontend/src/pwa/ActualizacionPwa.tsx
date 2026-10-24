import { useRegisterSW } from 'virtual:pwa-register/react'
import estilos from './ActualizacionPwa.module.css'

// Cuando hay una versión nueva de la aplicación no se recarga sola (podría pasar en mitad de un
// registro): se avisa y el usuario decide cuándo actualizar.
export function ActualizacionPwa() {
  const {
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW()

  if (!hayVersionNueva) return null

  return (
    <div className={estilos.aviso} role="status">
      <span>Hay una versión nueva de Marela</span>
      <button type="button" className={estilos.boton} onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
    </div>
  )
}
