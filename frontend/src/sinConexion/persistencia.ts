import { type DehydratedState, dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'
import { borrar, guardar, leer } from './almacen'

// Consultas guardadas en el dispositivo (GH-31): lo que ya se ha descargado (listados, fichas que se
// han abierto, la sesión y la explotación) se guarda en IndexedDB y se recupera al abrir la
// aplicación, para consultarlo sin cobertura. Con conexión, se refresca como siempre.

const CLAVE = 'consultas'

// Lo que tenga más de esto no se recupera: la sesión dura 30 días
export const VIGENCIA = 30 * 24 * 60 * 60 * 1000

// Cada cambio de versión empieza de cero: los datos guardados pueden tener otra forma
const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'desarrollo'

// Qué se guarda: los datos de las secciones que funcionan sin conexión y lo que hace falta para
// entrar en ellas. Las consultas a servicios externos (mapas, catastro) no.
const SE_GUARDAN = new Set(['sesion', 'explotaciones', 'animales', 'fincas'])

// Al cerrar sesión: nada de lo descargado se queda en el dispositivo
export const borrarConsultas = () => borrar(CLAVE)

type Guardado = { version: string; guardadoEn: number; estado: DehydratedState }

export async function restaurarConsultas(cliente: QueryClient) {
  const guardado = await leer<Guardado>(CLAVE)
  if (!guardado || guardado.version !== VERSION || Date.now() - guardado.guardadoEn > VIGENCIA)
    return
  hydrate(cliente, guardado.estado)
}

// Guarda las consultas cada vez que cambian, como mucho una vez por segundo. Devuelve cómo dejar de
// hacerlo.
export function guardarConsultas(cliente: QueryClient) {
  let pendiente: ReturnType<typeof setTimeout> | undefined
  const volcar = () => {
    pendiente = undefined
    const estado = dehydrate(cliente, {
      shouldDehydrateQuery: (q) =>
        q.state.status === 'success' && SE_GUARDAN.has(String(q.queryKey[0])),
    })
    void guardar(CLAVE, { version: VERSION, guardadoEn: Date.now(), estado } satisfies Guardado)
  }
  const anular = cliente.getQueryCache().subscribe((evento) => {
    if (evento.type !== 'updated' && evento.type !== 'removed') return
    pendiente ??= setTimeout(volcar, 1000)
  })
  return () => {
    anular()
    clearTimeout(pendiente)
  }
}
