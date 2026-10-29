import { z } from '@hono/zod-openapi'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { verAlmacen } from './almacenes.js'
import type { Transaccion } from './db/explotacion.js'
import {
  CANTIDAD_MAXIMA,
  fincas,
  movimientosComida,
  ORIGENES_ENTRADA,
  TIPOS_AJUSTE,
  TIPOS_MOVIMIENTO,
} from './db/schema/index.js'
import { ErrorApi } from './errores.js'
import { hoyEnMadrid } from './fechas.js'

// Entradas, salidas y ajustes de los almacenes de comida (GH-30). Como en pastoreos.ts, todas las
// funciones reciben la transacción de enLaExplotacion. Se corrigen o se borran; los cambios quedan en
// el historial. El stock lo calcula la base de datos (movimientos_con_stock, migración 0028).

const textoOpcional = z
  .string()
  .trim()
  .transform((t) => t || null)
  .nullish()

export const DatosMovimiento = z
  .object({
    tipo: z.enum(TIPOS_MOVIMIENTO),
    fecha: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    // En la unidad del almacén, con dos decimales como mucho
    cantidad: z
      .number('Indica la cantidad')
      .min(0, 'La cantidad no puede ser negativa')
      .max(CANTIDAD_MAXIMA, 'Cantidad demasiado grande')
      .transform((n) => Math.round(n * 100) / 100)
      .openapi({ example: 120 }),
    origen: z.enum(ORIGENES_ENTRADA).nullish(),
    fincaId: z.uuid().nullish(),
    ajuste: z.enum(TIPOS_AJUSTE).nullish(),
    motivo: textoOpcional.openapi({ example: 'Recuento de fin de mes' }),
    observaciones: textoOpcional,
  })
  .superRefine((m, ctx) => {
    const falta = (campo: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [campo], message })
    if (m.fecha > hoyEnMadrid()) falta('fecha', 'La fecha no puede ser futura')
    // Solo un recuento puede dejar el almacén vacío
    if (m.cantidad <= 0 && m.ajuste !== 'recuento')
      falta('cantidad', 'La cantidad tiene que ser mayor que 0')
    if (m.tipo === 'entrada' && !m.origen)
      falta('origen', 'Indica si es compra o producción propia')
    if (m.tipo !== 'entrada' && m.origen) falta('origen', 'Solo las entradas tienen origen')
    if (m.fincaId && m.origen !== 'produccion_propia')
      falta('fincaId', 'Solo la producción propia viene de una finca')
    if (m.tipo === 'ajuste' && !m.ajuste) falta('ajuste', 'Indica si es un recuento o una merma')
    if (m.tipo !== 'ajuste' && m.ajuste) falta('ajuste', 'Solo los ajustes son recuento o merma')
    if (m.tipo === 'ajuste' && !m.motivo) falta('motivo', 'Indica el motivo del ajuste')
    if (m.tipo !== 'ajuste' && m.motivo) falta('motivo', 'Solo los ajustes llevan motivo')
  })
  .openapi('DatosMovimiento')

export type DatosMovimiento = z.output<typeof DatosMovimiento>

export type FiltrosMovimientos = {
  desde?: string
  hasta?: string
  tipo?: (typeof TIPOS_MOVIMIENTO)[number]
}

const columnas = {
  id: movimientosComida.id,
  almacenId: movimientosComida.almacenId,
  tipo: movimientosComida.tipo,
  fecha: movimientosComida.fecha,
  cantidad: movimientosComida.cantidad,
  origen: movimientosComida.origen,
  finca: sql<{ id: string; nombre: string } | null>`(select json_build_object('id', f.id,
    'nombre', f.nombre) from fincas f where f.id = "movimientos_comida"."finca_id")`,
  ajuste: movimientosComida.ajuste,
  motivo: movimientosComida.motivo,
  observaciones: movimientosComida.observaciones,
  // Lo que cambió el stock y el stock que dejó (de consulta(), que calcula los de todo el almacén)
  diferencia: sql<number>`s.diferencia::float8`,
  stock: sql<number>`s.stock::float8`,
  creadoEn: movimientosComida.creadoEn,
  modificadoEn: movimientosComida.modificadoEn,
}

// Los movimientos de un almacén, cada uno con su diferencia y su stock
const consulta = (tx: Transaccion, almacenId: string) =>
  tx
    .select(columnas)
    .from(movimientosComida)
    .innerJoin(
      sql`movimientos_con_stock(${almacenId}) s`,
      sql`s.movimiento_id = ${movimientosComida.id}`,
    )

const movimiento = <T extends { creadoEn: Date; modificadoEn: Date }>(m: T) => ({
  ...m,
  creadoEn: m.creadoEn.toISOString(),
  modificadoEn: m.modificadoEn.toISOString(),
})

// Los de un almacén, del más reciente al más antiguo, con filtros de fecha y tipo
export async function listarMovimientos(
  tx: Transaccion,
  almacenId: string,
  filtros: FiltrosMovimientos,
) {
  await verAlmacen(tx, almacenId)
  const filas = await consulta(tx, almacenId)
    .where(
      and(
        filtros.desde ? gte(movimientosComida.fecha, filtros.desde) : undefined,
        filtros.hasta ? lte(movimientosComida.fecha, filtros.hasta) : undefined,
        filtros.tipo ? eq(movimientosComida.tipo, filtros.tipo) : undefined,
      ),
    )
    .orderBy(
      desc(movimientosComida.fecha),
      desc(movimientosComida.creadoEn),
      desc(movimientosComida.id),
    )
  return filas.map(movimiento)
}

async function verMovimiento(tx: Transaccion, almacenId: string, movimientoId: string) {
  const [fila] = await consulta(tx, almacenId).where(eq(movimientosComida.id, movimientoId))
  if (!fila)
    throw new ErrorApi(404, 'movimiento_no_encontrado', 'No existe el movimiento en este almacén')
  return movimiento(fila)
}

const invalido = (campo: string, mensaje: string) =>
  new ErrorApi(400, 'validacion', mensaje, [{ campo, mensaje }])

// La finca de la producción propia, de la explotación. La clave foránea lo impide también; aquí se
// comprueba antes para dar el error en su campo.
async function comprobarFinca(tx: Transaccion, fincaId: string | null | undefined) {
  if (!fincaId) return
  const [finca] = await tx.select({ id: fincas.id }).from(fincas).where(eq(fincas.id, fincaId))
  if (!finca) throw invalido('fincaId', 'La finca no está entre las de la explotación')
}

const valores = (d: DatosMovimiento) => ({
  tipo: d.tipo,
  fecha: d.fecha,
  cantidad: d.cantidad,
  origen: d.origen ?? null,
  fincaId: d.fincaId ?? null,
  ajuste: d.ajuste ?? null,
  motivo: d.motivo ?? null,
  observaciones: d.observaciones ?? null,
})

// Registra un movimiento en un almacén activo. El stock puede quedar en negativo: se guarda igual (el
// frontend lo avisa) y el almacén sale en rojo hasta que una entrada o un ajuste lo corrija.
export async function crearMovimiento(tx: Transaccion, almacenId: string, datos: DatosMovimiento) {
  const almacen = await verAlmacen(tx, almacenId)
  if (!almacen.activo)
    throw new ErrorApi(409, 'almacen_desactivado', 'El almacén está desactivado: reactívalo antes')
  await comprobarFinca(tx, datos.fincaId)
  const [creado] = await tx
    .insert(movimientosComida)
    .values({ almacenId, ...valores(datos) })
    .returning({ id: movimientosComida.id })
  return verMovimiento(tx, almacenId, creado?.id ?? '')
}

// Corrige un movimiento: todo menos el almacén
export async function corregirMovimiento(
  tx: Transaccion,
  almacenId: string,
  movimientoId: string,
  datos: DatosMovimiento,
) {
  await verMovimiento(tx, almacenId, movimientoId)
  await comprobarFinca(tx, datos.fincaId)
  await tx
    .update(movimientosComida)
    .set(valores(datos))
    .where(eq(movimientosComida.id, movimientoId))
  return verMovimiento(tx, almacenId, movimientoId)
}

// Borra un movimiento registrado por error y lo devuelve, para poder deshacerlo. Queda en el
// historial.
export async function borrarMovimiento(tx: Transaccion, almacenId: string, movimientoId: string) {
  const borrado = await verMovimiento(tx, almacenId, movimientoId)
  await tx.delete(movimientosComida).where(eq(movimientosComida.id, movimientoId))
  return borrado
}
