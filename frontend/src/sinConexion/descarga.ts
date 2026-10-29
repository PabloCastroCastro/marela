import type { QueryClient } from '@tanstack/react-query'
import { consultaAnimal, consultaAnimales } from '../animales/datos'
import type { DetalleExplotacion } from '../explotaciones/datos'
import { consultaFinca, consultaFincas } from '../fincas/datos'

// Lo que se descarga al entrar en una explotación con cobertura, para trabajar sin ella (GH-31): los
// listados de animales y fincas y las fichas de los activos, para poder abrirlas y registrar en
// ellas. El historial de cada ficha (pesadas, labores…) se guarda al abrirla.

// Las fichas descargadas valen unas horas: no se vuelven a pedir todas cada vez que se entra
const FICHAS_VALEN = 6 * 60 * 60 * 1000

// De pocas en pocas, para no saturar el móvil ni el servidor
const A_LA_VEZ = 4

async function deAPocas(tareas: (() => Promise<unknown>)[]) {
  const cola = [...tareas]
  await Promise.all(
    Array.from({ length: A_LA_VEZ }, async () => {
      for (let tarea = cola.shift(); tarea; tarea = cola.shift()) await tarea()
    }),
  )
}

export async function descargarParaSinConexion(
  cliente: QueryClient,
  explotacion: DetalleExplotacion,
) {
  const tareas: (() => Promise<unknown>)[] = []
  try {
    if (explotacion.modulos.includes('animales')) {
      const lista = await cliente.fetchQuery({
        ...consultaAnimales(explotacion.id, { estado: 'activo' }),
        staleTime: 30_000,
      })
      for (const a of lista)
        tareas.push(() =>
          cliente.prefetchQuery({
            ...consultaAnimal(explotacion.id, a.id),
            staleTime: FICHAS_VALEN,
          }),
        )
    }
    if (explotacion.modulos.includes('fincas')) {
      const lista = await cliente.fetchQuery({
        ...consultaFincas(explotacion.id, { activa: 'true' }),
        staleTime: 30_000,
      })
      for (const f of lista)
        tareas.push(() =>
          cliente.prefetchQuery({
            ...consultaFinca(explotacion.id, f.id),
            staleTime: FICHAS_VALEN,
          }),
        )
    }
  } catch {
    // Sin conexión: ya se descargará al volver a entrar con ella
    return
  }
  await deAPocas(tareas)
}
