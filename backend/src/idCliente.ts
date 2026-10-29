import { z } from '@hono/zod-openapi'
import { ErrorApi } from './errores.js'

// Registros sin conexión (GH-31): el dispositivo genera el identificador de lo que da de alta, y si
// lo reenvía (porque no supo si llegó, o porque estaba en la cola de pendientes) se devuelve el que
// ya se guardó en lugar de duplicarlo.

export const IdCliente = z.uuid('Identificador no válido').optional().openapi({
  description:
    'Generado en el dispositivo. Si ya existe un registro con este id, se devuelve ese en lugar de crear otro: reenviar no duplica.',
})

// El id ya lo usa un registro de otra explotación, de otro animal o de otra tabla: no es un reenvío
export const idEnUso = () =>
  new ErrorApi(409, 'id_en_uso', 'El identificador ya lo usa otro registro', [
    { campo: 'id', mensaje: 'El identificador ya lo usa otro registro' },
  ])

// Altas de varias filas a la vez (la misma labor en varias fincas, el mismo tratamiento a varios
// animales): un id por fila, en el orden de fincaIds o animalIds
export const IdsCliente = z.array(z.uuid('Identificador no válido')).max(200).optional().openapi({
  description:
    'Uno por finca o animal, en el mismo orden, generados en el dispositivo. Si ya existen, se devuelven esos en lugar de crear otros: reenviar no duplica.',
})

// Uno por cada finca o animal, sin repetir: si no, no se sabe qué id es de cuál
export function comprobarIds(ids: string[] | undefined, de: string[], ctx: z.RefinementCtx) {
  if (ids && (ids.length !== de.length || new Set(ids).size !== ids.length))
    ctx.addIssue({
      code: 'custom',
      path: ['ids'],
      message: 'Un id por cada uno, sin repetir',
    })
}

// Los ya guardados con esos ids: si están todos, es un reenvío y se devuelven; si no hay ninguno, se
// crean (null); si solo hay algunos, no es un reenvío
export async function reenvio<T>(
  ids: string[] | undefined,
  buscar: (ids: string[]) => Promise<T[]>,
): Promise<T[] | null> {
  if (!ids?.length) return null
  const ya = await buscar(ids)
  if (ya.length === 0) return null
  if (ya.length === ids.length) return ya
  throw idEnUso()
}

// El id lo usa ya una fila de otra explotación, que no se ve: choca con la clave primaria
export async function sinChoqueDeId<T>(tabla: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
    if (causa?.code === '23505' && causa.constraint === `${tabla}_pkey`) throw idEnUso()
    throw error
  }
}
