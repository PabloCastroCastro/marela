import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

// Si hay conexión con el servidor (GH-31). navigator.onLine no basta en el campo: con una raya de
// cobertura dice que sí, pero las peticiones no llegan. Así que cuando una petición falla por la red
// se marca sin conexión y se prueba cada poco con /api/health hasta que responda. También vuelve en
// cuanto otra petición (un registro, que no espera a la conexión) recibe respuesta del servidor.
//
// Es el onlineManager de TanStack Query: sin conexión, las consultas no fallan, se quedan esperando
// con lo que ya tenían guardado, y se repiten solas al volver.

const CADA = 15_000

let sonda: ReturnType<typeof setInterval> | undefined
let probando = false

// Con el mismo límite que una consulta: con poca cobertura responde, pero tarda
async function probar() {
  if (probando || onlineManager.isOnline()) return
  probando = true
  try {
    const respuesta = await globalThis.fetch('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(LIMITES.consulta),
    })
    if (respuesta.ok) marcarConConexion()
  } catch {
    // Sigue sin conexión
  } finally {
    probando = false
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

// El navegador avisa cuando cambia de red: se comprueba en el momento, sin esperar a la sonda. Y al
// volver a la aplicación: con la pantalla bloqueada o en otra app, el móvil congela la sonda, y la
// cobertura puede haber vuelto sin que el navegador avise.
if (typeof globalThis.addEventListener === 'function') {
  onlineManager.setEventListener((alCambiar) => {
    const conRed = () => void probar()
    const sinRed = () => {
      alCambiar(false)
      marcarSinConexion()
    }
    const alVolver = () => {
      if (globalThis.document?.visibilityState !== 'hidden') void probar()
    }
    globalThis.addEventListener('online', conRed)
    globalThis.addEventListener('offline', sinRed)
    globalThis.addEventListener('focus', alVolver)
    globalThis.addEventListener('pageshow', alVolver)
    globalThis.document?.addEventListener('visibilitychange', alVolver)
    return () => {
      globalThis.removeEventListener('online', conRed)
      globalThis.removeEventListener('offline', sinRed)
      globalThis.removeEventListener('focus', alVolver)
      globalThis.removeEventListener('pageshow', alVolver)
      globalThis.document?.removeEventListener('visibilitychange', alVolver)
    }
  })
}

export const hayConexion = () => onlineManager.isOnline()

// Con una raya de cobertura el móvil cree que tiene red y la petición se queda esperando hasta que el
// navegador la da por perdida, que puede ser más de un minuto. Antes de eso se da por fallida: un
// registro a los 10 s (va a la cola de pendientes, y reenviarlo no lo duplica) y una consulta a los
// 15 s (sigue a la vista lo guardado). Subir un archivo (una factura de hasta 10 MB) lleva más.
export const LIMITES = { consulta: 15_000, registro: 10_000, subida: 120_000 }

// No ha llegado al servidor: sin red o sin respuesta a tiempo
export class SinRespuesta extends Error {
  constructor() {
    super('No hay conexión con el servidor')
    this.name = 'SinRespuesta'
  }
}

// fetch con el límite de espera. Si no llega, se marca sin conexión y lanza SinRespuesta; si lo
// cancela quien lo pidió (una consulta que ya no hace falta), lanza su error como siempre.
export async function pedir(entrada: RequestInfo | URL, init: RequestInit = {}) {
  const peticion = entrada instanceof Request ? entrada : undefined
  const metodo = (init.method ?? peticion?.method ?? 'GET').toUpperCase()
  const tipo = new Headers(init.headers ?? peticion?.headers).get('content-type') ?? ''
  const limite = AbortSignal.timeout(
    metodo === 'GET'
      ? LIMITES.consulta
      : tipo.startsWith('multipart/form-data')
        ? LIMITES.subida
        : LIMITES.registro,
  )
  const propia = init.signal ?? peticion?.signal ?? undefined
  const signal =
    propia && typeof AbortSignal.any === 'function' ? AbortSignal.any([propia, limite]) : limite
  try {
    const respuesta = await globalThis.fetch(entrada, { ...init, signal })
    // Ha respondido el servidor (aunque sea con un error): hay conexión. Un 502, 503 o 504 puede
    // ser del proxy, sin el servidor detrás: eso lo decide la sonda
    if (!onlineManager.isOnline() && ![502, 503, 504].includes(respuesta.status)) {
      marcarConConexion()
    }
    return respuesta
  } catch (error) {
    if (propia?.aborted) throw error
    marcarSinConexion()
    throw new SinRespuesta()
  }
}

export const useConexion = () =>
  useSyncExternalStore(
    (alCambiar) => onlineManager.subscribe(alCambiar),
    () => onlineManager.isOnline(),
  )
