// Almacén local del dispositivo para trabajar sin conexión (GH-31): un clave-valor sobre IndexedDB,
// que guarda objetos sin pasarlos a texto y aguanta mucho más que localStorage. Guarda dos cosas: las
// consultas ya descargadas (persistencia.ts) y los registros pendientes de enviar (cola.ts).
//
// Sin IndexedDB (modo privado de algunos navegadores, los tests) se guarda en memoria: la aplicación
// funciona igual, pero lo guardado no sobrevive a cerrarla.

const BASE = 'marela'
const ALMACEN = 'datos'

let abierta: Promise<IDBDatabase> | null = null
const enMemoria = new Map<string, unknown>()

const conIndexedDb = () => typeof globalThis.indexedDB !== 'undefined'

function abrir() {
  abierta ??= new Promise<IDBDatabase>((resolver, rechazar) => {
    const peticion = globalThis.indexedDB.open(BASE, 1)
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN)
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
  return abierta
}

async function operar<T>(modo: IDBTransactionMode, fn: (almacen: IDBObjectStore) => IDBRequest<T>) {
  const base = await abrir()
  return new Promise<T>((resolver, rechazar) => {
    const peticion = fn(base.transaction(ALMACEN, modo).objectStore(ALMACEN))
    peticion.onsuccess = () => resolver(peticion.result)
    peticion.onerror = () => rechazar(peticion.error)
  })
}

export async function leer<T>(clave: string): Promise<T | undefined> {
  if (!conIndexedDb()) return enMemoria.get(clave) as T | undefined
  try {
    return (await operar('readonly', (a) => a.get(clave))) as T | undefined
  } catch {
    return enMemoria.get(clave) as T | undefined
  }
}

export async function guardar(clave: string, valor: unknown) {
  enMemoria.set(clave, valor)
  if (!conIndexedDb()) return
  try {
    await operar('readwrite', (a) => a.put(valor, clave))
  } catch {
    // Sin espacio o sin permiso: queda en memoria mientras la aplicación esté abierta
  }
}

export async function borrar(clave: string) {
  enMemoria.delete(clave)
  if (!conIndexedDb()) return
  try {
    await operar('readwrite', (a) => a.delete(clave))
  } catch {
    // Si no se puede, el siguiente inicio de sesión lo sobrescribe
  }
}
