import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

// Si hay conexión con el servidor (GH-31). navigator.onLine no basta en el campo: con una raya de
// cobertura dice que sí, pero las peticiones no llegan. Así que cuando una petición falla por la red
// se marca sin conexión y se prueba cada poco con /api/health hasta que responda.
//
// Es el onlineManager de TanStack Query: sin conexión, las consultas no fallan, se quedan esperando
// con lo que ya tenían guardado, y se repiten solas al volver.

const CADA = 15_000

let sonda: ReturnType<typeof setInterval> | undefined

async function probar() {
  try {
    const respuesta = await globalThis.fetch('/api/health', { cache: 'no-store' })
    if (respuesta.ok) marcarConConexion()
  } catch {
    // Sigue sin conexión
  }
}

export function marcarSinConexion() {
  onlineManager.setOnline(false)
  sonda ??= setInterval(probar, CADA)
}

export function marcarConConexion() {
  clearInterval(sonda)
  sonda = undefined
  onlineManager.setOnline(true)
}

// El navegador avisa cuando cambia de red: se comprueba en el momento, sin esperar a la sonda
if (typeof globalThis.addEventListener === 'function') {
  onlineManager.setEventListener((alCambiar) => {
    const conRed = () => void probar()
    const sinRed = () => {
      alCambiar(false)
      marcarSinConexion()
    }
    globalThis.addEventListener('online', conRed)
    globalThis.addEventListener('offline', sinRed)
    return () => {
      globalThis.removeEventListener('online', conRed)
      globalThis.removeEventListener('offline', sinRed)
    }
  })
}

export const hayConexion = () => onlineManager.isOnline()

export const useConexion = () =>
  useSyncExternalStore(
    (alCambiar) => onlineManager.subscribe(alCambiar),
    () => onlineManager.isOnline(),
  )
