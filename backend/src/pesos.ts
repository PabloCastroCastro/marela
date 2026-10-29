import { z } from '@hono/zod-openapi'
import { and, asc, eq } from 'drizzle-orm'
import { verAnimal } from './animales.js'
import type { Transaccion } from './db/explotacion.js'
import { KG_MAXIMO, MOMENTOS_PESADA, pesos } from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'
import { IdCliente, idEnUso } from './idCliente.js'

// Pesadas de un animal (GH-21). Como en animales.ts, todas las funciones reciben la transacción de
// enLaExplotacion.

const NOMBRE_MOMENTO = { nacimiento: 'al nacer', destete: 'al destete', venta: 'a la venta' }

const Campos = z.object({
  fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
  kg: z
    .number('Indica el peso en kg')
    .positive('El peso tiene que ser mayor que 0')
    .max(KG_MAXIMO, `El peso no puede pasar de ${KG_MAXIMO} kg`)
    // Un decimal, como se guarda
    .transform((kg) => Math.round(kg * 10) / 10)
    .openapi({ example: 412.5 }),
  momento: z.enum(MOMENTOS_PESADA).default('otro'),
})

const fechaNoFutura = (p: { fecha: string }, ctx: z.RefinementCtx) => {
  if (p.fecha > hoyEnMadrid())
    ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'La fecha no puede ser futura' })
}

// Corregir una pesada
export const DatosPesada = Campos.superRefine(fechaNoFutura).openapi('DatosPesada')

export type DatosPesada = z.output<typeof DatosPesada>

// Registrar una: con el id del dispositivo, si se registró sin conexión (GH-31)
export const NuevaPesada = Campos.extend({ id: IdCliente })
  .superRefine(fechaNoFutura)
  .openapi('NuevaPesada')

export type NuevaPesada = z.output<typeof NuevaPesada>

const columnas = {
  id: pesos.id,
  animalId: pesos.animalId,
  fecha: pesos.fecha,
  kg: pesos.kg,
  momento: pesos.momento,
  creadoEn: pesos.creadoEn,
  modificadoEn: pesos.modificadoEn,
}

const pesada = <T extends { creadoEn: Date; modificadoEn: Date }>(p: T) => ({
  ...p,
  creadoEn: p.creadoEn.toISOString(),
  modificadoEn: p.modificadoEn.toISOString(),
})

// De la más antigua a la más reciente, para calcular la ganancia entre pesadas
export async function listarPesadas(tx: Transaccion, animalId: string) {
  await verAnimal(tx, animalId)
  const filas = await tx
    .select(columnas)
    .from(pesos)
    .where(eq(pesos.animalId, animalId))
    .orderBy(asc(pesos.fecha), asc(pesos.creadoEn))
  return filas.map(pesada)
}

async function verPesada(tx: Transaccion, animalId: string, pesoId: string) {
  const [fila] = await tx
    .select(columnas)
    .from(pesos)
    .where(and(eq(pesos.id, pesoId), eq(pesos.animalId, animalId)))
  if (!fila) throw new ErrorApi(404, 'pesada_no_encontrada', 'No existe la pesada')
  return pesada(fila)
}

// La fecha, entre el nacimiento y la baja del animal. La base de datos lo comprueba también; aquí
// se hace antes para dar el error en su campo.
async function comprobarFecha(tx: Transaccion, animalId: string, fecha: string) {
  const animal = await verAnimal(tx, animalId)
  const invalida = (mensaje: string) =>
    new ErrorApi(400, 'validacion', mensaje, [{ campo: 'fecha', mensaje }])
  if (fecha < animal.fechaNacimiento)
    throw invalida('La fecha no puede ser anterior al nacimiento del animal')
  if (animal.fechaBaja && fecha > animal.fechaBaja)
    throw invalida('La fecha no puede ser posterior a la baja del animal')
}

// Traduce los errores de la base de datos que puede provocar el usuario
async function conErroresClaros<T>(datos: DatosPesada, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const causa = (error as { cause?: { code?: string; constraint?: string } }).cause
    // El id del dispositivo, ya usado en otra explotación (que no se ve) o en otro animal
    if (causa?.code === '23505' && causa.constraint === 'pesos_pkey') throw idEnUso()
    if (causa?.code === '23505' && causa.constraint === 'pesos_momento_unico') {
      const momento = NOMBRE_MOMENTO[datos.momento as keyof typeof NOMBRE_MOMENTO]
      const mensaje = `El animal ya tiene una pesada ${momento}`
      throw new ErrorApi(409, 'momento_repetido', mensaje, [{ campo: 'momento', mensaje }])
    }
    throw error
  }
}

export async function crearPesada(tx: Transaccion, animalId: string, datos: NuevaPesada) {
  // Reenviada desde el dispositivo: la que ya se guardó
  if (datos.id) {
    const [ya] = await tx
      .select({ animalId: pesos.animalId })
      .from(pesos)
      .where(eq(pesos.id, datos.id))
    if (ya && ya.animalId !== animalId) throw idEnUso()
    if (ya) return verPesada(tx, animalId, datos.id)
  }
  await comprobarFecha(tx, animalId, datos.fecha)
  const [creada] = await conErroresClaros(datos, () =>
    tx
      .insert(pesos)
      .values({
        ...(datos.id ? { id: datos.id } : {}),
        animalId,
        fecha: datos.fecha,
        kg: datos.kg,
        momento: datos.momento,
      })
      .returning({ id: pesos.id }),
  )
  if (!creada) throw new Error('No se pudo registrar la pesada')
  return verPesada(tx, animalId, creada.id)
}

export async function corregirPesada(
  tx: Transaccion,
  animalId: string,
  pesoId: string,
  datos: DatosPesada,
) {
  await verPesada(tx, animalId, pesoId)
  await comprobarFecha(tx, animalId, datos.fecha)
  await conErroresClaros(datos, () =>
    tx
      .update(pesos)
      .set({ fecha: datos.fecha, kg: datos.kg, momento: datos.momento })
      .where(eq(pesos.id, pesoId)),
  )
  return verPesada(tx, animalId, pesoId)
}

// Borra una pesada registrada por error. Queda en el historial de cambios.
export async function borrarPesada(tx: Transaccion, animalId: string, pesoId: string) {
  const borrada = await verPesada(tx, animalId, pesoId)
  await tx.delete(pesos).where(eq(pesos.id, pesoId))
  return borrada
}
