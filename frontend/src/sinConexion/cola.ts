import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { ErrorApi, esSinConexion } from '../api/cliente'
import { CLAVE_SESION } from '../auth/sesion'
import { guardar, leer } from './almacen'
import { hayConexion, pedir } from './conexion'

// Registros pendientes de enviar (GH-31). Lo que se registra sin cobertura se guarda en el
// dispositivo, en orden, y se envía solo al recuperarla. Cada registro lleva el id que generó el
// dispositivo, y el backend devuelve el ya guardado si le llega dos veces: reenviar nunca duplica.
//
// Al enviar cada uno:
//   - si llega, se quita de la cola y se refrescan sus consultas;
//   - si no hay red o el servidor no responde (5xx), se queda y se reintenta más tarde;
//   - si la sesión ha caducado (401), se queda, y se envía tras volver a iniciar sesión;
//   - si el servidor lo rechaza (otro 4xx: un crotal repetido, una fecha no válida), queda como
//     fallido, con el motivo, para corregirlo, reintentarlo o descartarlo. Los siguientes siguen.

export type EstadoPendiente = 'pendiente' | 'enviando' | 'fallido'

export type Pendiente = {
  // El del registro, generado en el dispositivo
  id: string
  // Solo los envía quien los registró: con la sesión de otro, no
  usuarioId: string
  explotacionId: string
  // Qué es ("pesada"), para mostrarlo y para corregirlo con su formulario (registros.tsx)
  tipo: string
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  ruta: string
  cuerpo: unknown
  // Para la lista de pendientes: "Pesada · ES36 0001 · 412,5 kg"
  descripcion: string
  // Los datos que necesita su formulario para corregirlo (el animal…)
  contexto: Record<string, string>
  // Consultas que se refrescan cuando llega
  claves: QueryKey[]
  creadoEn: string
  estado: EstadoPendiente
  error?: { codigo: string; mensaje: string; detalles?: unknown }
}

const CLAVE = 'pendientes'

let pendientes: Pendiente[] = []
const oyentes = new Set<() => void>()

function cambiar(nuevos: Pendiente[]) {
  pendientes = nuevos
  void guardar(CLAVE, pendientes)
  for (const oyente of oyentes) oyente()
}

// Al abrir la aplicación. Lo que se estaba enviando cuando se cerró, vuelve a estar pendiente.
export async function cargarCola() {
  const guardados = (await leer<Pendiente[]>(CLAVE)) ?? []
  pendientes = guardados.map((p) => (p.estado === 'enviando' ? { ...p, estado: 'pendiente' } : p))
  for (const oyente of oyentes) oyente()
}

export const verCola = () => pendientes

const suscribir = (oyente: () => void) => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export const useCola = () => useSyncExternalStore(suscribir, verCola)

// Los del usuario de la sesión
export const delUsuario = (lista: Pendiente[], usuarioId: string | undefined) =>
  lista.filter((p) => p.usuarioId === usuarioId)

export function encolar(p: Omit<Pendiente, 'estado' | 'creadoEn'>) {
  cambiar([
    ...pendientes.filter((x) => x.id !== p.id),
    { ...p, estado: 'pendiente', creadoEn: new Date().toISOString() },
  ])
}

export const descartar = (id: string) => cambiar(pendientes.filter((p) => p.id !== id))

export const reintentar = (id: string) =>
  cambiar(
    pendientes.map((p) => (p.id === id ? { ...p, estado: 'pendiente', error: undefined } : p)),
  )

// Corregido con su formulario: los datos nuevos, y otra vez a la cola
export const reemplazar = (id: string, cuerpo: unknown, descripcion?: string) =>
  cambiar(
    pendientes.map((p) =>
      p.id === id
        ? {
            ...p,
            cuerpo,
            descripcion: descripcion ?? p.descripcion,
            estado: 'pendiente',
            error: undefined,
          }
        : p,
    ),
  )

// Al cerrar sesión, los suyos: los de otro usuario del mismo dispositivo se quedan
export const vaciarCola = (usuarioId: string | undefined) =>
  cambiar(pendientes.filter((p) => p.usuarioId !== usuarioId))

const actualizar = (id: string, cambios: Partial<Pendiente>) =>
  cambiar(pendientes.map((p) => (p.id === id ? { ...p, ...cambios } : p)))

export type Resultado = { enviados: number; fallidos: number; parado: boolean }

let enCurso: Promise<Resultado> | null = null

export const enviandoCola = () => enCurso !== null

// Envía los pendientes del usuario, de uno en uno y en el orden en que se registraron. Si ya se están
// enviando, espera a que termine esa vuelta.
export function procesarCola(cliente: QueryClient, usuarioId: string) {
  enCurso ??= enviarTodos(cliente, usuarioId).finally(() => {
    enCurso = null
  })
  return enCurso
}

async function enviarTodos(cliente: QueryClient, usuarioId: string): Promise<Resultado> {
  const resultado: Resultado = { enviados: 0, fallidos: 0, parado: false }
  for (;;) {
    const p = pendientes.find((x) => x.usuarioId === usuarioId && x.estado === 'pendiente')
    if (!p) return resultado
    actualizar(p.id, { estado: 'enviando' })
    let respuesta: Response
    try {
      respuesta = await pedir(p.ruta, {
        method: p.metodo,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: p.cuerpo === undefined ? undefined : JSON.stringify(p.cuerpo),
      })
    } catch {
      actualizar(p.id, { estado: 'pendiente' })
      return { ...resultado, parado: true }
    }
    if (respuesta.ok) {
      descartar(p.id)
      resultado.enviados += 1
      await Promise.all(p.claves.map((queryKey) => cliente.invalidateQueries({ queryKey })))
      continue
    }
    const cuerpo = (await respuesta.json().catch(() => null)) as {
      error?: { codigo?: string; mensaje?: string; detalles?: unknown }
    } | null
    const codigo = cuerpo?.error?.codigo ?? 'error'
    // Ni la sesión ni el servidor están para recibirlo: se queda para más tarde
    const esperar =
      respuesta.status === 401 ||
      respuesta.status === 429 ||
      respuesta.status >= 500 ||
      codigo === 'cambio_contrasena_obligatorio'
    if (esperar) {
      actualizar(p.id, { estado: 'pendiente' })
      // Sin sesión, al inicio de sesión: después se envía
      if (respuesta.status === 401) cliente.setQueryData(CLAVE_SESION, null)
      return { ...resultado, parado: true }
    }
    actualizar(p.id, {
      estado: 'fallido',
      error: {
        codigo,
        mensaje: cuerpo?.error?.mensaje ?? 'El servidor no lo ha aceptado',
        detalles: cuerpo?.error?.detalles,
      },
    })
    resultado.fallidos += 1
  }
}

// Las peticiones que pueden esperar en la cola: si no llegan al servidor, o el servidor no responde
export const puedeEsperar = (error: unknown) =>
  esSinConexion(error) || (error instanceof ErrorApi && [502, 503, 504].includes(error.estado))

// Para los formularios que funcionan sin conexión: envía y, si no llega, lo deja en la cola; si ya se
// sabe que no hay conexión, lo deja directamente. Lo que el servidor rechaza (un dato no válido) se
// lanza como siempre, para mostrarlo en el formulario.
export async function enviarOGuardar<T>(
  p: Omit<Pendiente, 'estado' | 'creadoEn'>,
  enviar: () => Promise<T>,
): Promise<{ enviado: T } | { pendiente: true }> {
  // Ya se sabe que no hay conexión: a la cola sin esperar a que falle
  if (!hayConexion()) {
    encolar(p)
    return { pendiente: true }
  }
  try {
    return { enviado: await enviar() }
  } catch (error) {
    if (!puedeEsperar(error)) throw error
    encolar(p)
    return { pendiente: true }
  }
}

// El id de un registro nuevo. randomUUID solo existe en contextos seguros (HTTPS o localhost), que
// es donde funciona la aplicación instalada.
export const nuevoId = () =>
  globalThis.crypto?.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  )
