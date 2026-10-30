import '@testing-library/jest-dom/vitest'
import { File as FileDeNode } from 'node:buffer'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { descartar, verCola } from '../src/sinConexion/cola'
import { marcarConConexion } from '../src/sinConexion/conexion'

// Sin la API simulada, ninguna petición sale a la red: si una llega tarde, después de acabar su test,
// no debe marcar sin conexión el siguiente. Cada test simula la suya (simularApi).
globalThis.fetch = async () =>
  Response.json({ error: { codigo: 'sin_simular', mensaje: 'Sin API simulada' } }, { status: 503 })

afterEach(() => {
  cleanup()
  // La conexión y la cola de pendientes son del módulo: cada test empieza con conexión y sin nada
  marcarConConexion()
  for (const p of verCola()) descartar(p.id)
})

beforeEach(() => {
  marcarConConexion()
})

// jsdom trae su FormData y su File, que el Request de Node no entiende (enviaría "[object FormData]"):
// se usan los de Node, que se comportan como los del navegador al subir un archivo
const { constructor: FormDataDeNode } = await new Response('--x--\r\n', {
  headers: { 'content-type': 'multipart/form-data; boundary=x' },
}).formData()
Object.assign(globalThis, { File: FileDeNode, FormData: FormDataDeNode })

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
