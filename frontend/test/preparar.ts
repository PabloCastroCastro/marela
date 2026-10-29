import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { descartar, verCola } from '../src/sinConexion/cola'
import { marcarConConexion } from '../src/sinConexion/conexion'

afterEach(() => {
  cleanup()
  // La conexión y la cola de pendientes son del módulo: cada test empieza con conexión y sin nada
  marcarConConexion()
  for (const p of verCola()) descartar(p.id)
})

// jsdom no implementa los diálogos modales: versión mínima para los tests (abre y cierra)
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}
