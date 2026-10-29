import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'
import { fincas } from './fincas.js'

// Almacenes de comida de una explotación (docs/diseno.md, "Comida"). Cada uno es un stock de una
// comida, que se mide en unidades (pacas) o en kilos. No se borran: se desactivan.

// Qué comida guarda
export const TIPOS_ALMACEN = ['hierba_verde', 'hierba_seca', 'maiz', 'pienso', 'otro'] as const

export const tipoAlmacen = pgEnum('tipo_almacen', TIPOS_ALMACEN)

export const UNIDADES_ALMACEN = ['unidades', 'kg'] as const

export const unidadAlmacen = pgEnum('unidad_almacen', UNIDADES_ALMACEN)

export const almacenes = pgTable(
  'almacenes',
  {
    id: id(),
    ...deExplotacion(),
    nombre: text('nombre').notNull(),
    tipo: tipoAlmacen('tipo').notNull(),
    unidad: unidadAlmacen('unidad').notNull(),
    activo: boolean('activo').notNull().default(true),
    ...auditoria(),
  },
  (t) => [
    // Los movimientos, siempre de un almacén de la misma explotación (clave foránea compuesta)
    unique('almacenes_explotacion_id_unique').on(t.explotacionId, t.id),
    // Sin dos almacenes con el mismo nombre en la explotación, para no confundirlos
    uniqueIndex('almacenes_nombre_unico').on(t.explotacionId, sql`lower(${t.nombre})`),
    index('almacenes_explotacion_idx').on(t.explotacionId),
    check('almacenes_nombre_no_vacio', sql`btrim(${t.nombre}) <> ''`),
    separacionPorExplotacion(),
  ],
)

// Movimientos de un almacén (GH-30): entradas, salidas (raciones) y ajustes de inventario. El stock
// sale de ellos (función stock_almacen, migración 0028). Como las labores, se corrigen o se borran, y
// los cambios quedan en el historial.

export const TIPOS_MOVIMIENTO = ['entrada', 'salida', 'ajuste'] as const

export const tipoMovimiento = pgEnum('tipo_movimiento_comida', TIPOS_MOVIMIENTO)

// Entrada: comprada o de las fincas de la explotación
export const ORIGENES_ENTRADA = ['compra', 'produccion_propia'] as const

export const origenEntrada = pgEnum('origen_entrada_comida', ORIGENES_ENTRADA)

// Ajuste: un recuento físico deja el stock en la cantidad contada; una merma lo baja en la cantidad
// perdida
export const TIPOS_AJUSTE = ['recuento', 'merma'] as const

export const tipoAjuste = pgEnum('tipo_ajuste_comida', TIPOS_AJUSTE)

// El límite solo descarta errores al teclear: 100.000 t
export const CANTIDAD_MAXIMA = 100_000_000

export const movimientosComida = pgTable(
  'movimientos_comida',
  {
    id: id(),
    ...deExplotacion(),
    almacenId: uuid('almacen_id').notNull(),
    tipo: tipoMovimiento('tipo').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    // En la unidad del almacén. En un recuento, la cantidad contada; en el resto, lo que entra o sale.
    cantidad: numeric('cantidad', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    origen: origenEntrada('origen'),
    // Producción propia: de qué finca, si se sabe
    fincaId: uuid('finca_id'),
    ajuste: tipoAjuste('ajuste'),
    motivo: text('motivo'),
    observaciones: text('observaciones'),
    ...auditoria(),
  },
  (t) => [
    // Compuestas, para que el almacén y la finca sean siempre de la misma explotación
    foreignKey({
      name: 'movimientos_comida_almacen_fk',
      columns: [t.explotacionId, t.almacenId],
      foreignColumns: [almacenes.explotacionId, almacenes.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'movimientos_comida_finca_fk',
      columns: [t.explotacionId, t.fincaId],
      foreignColumns: [fincas.explotacionId, fincas.id],
    }).onDelete('restrict'),
    index('movimientos_comida_explotacion_idx').on(t.explotacionId),
    index('movimientos_comida_almacen_idx').on(t.almacenId, t.fecha),
    check(
      'movimientos_comida_cantidad',
      sql`${t.cantidad} <= ${sql.raw(String(CANTIDAD_MAXIMA))} and (${t.cantidad} > 0
        or (${t.ajuste} = 'recuento' and ${t.cantidad} = 0))`,
    ),
    // Cada tipo, con sus datos y sin los de los demás
    check(
      'movimientos_comida_datos',
      sql`case ${t.tipo}
        when 'entrada' then ${t.origen} is not null and ${t.ajuste} is null and ${t.motivo} is null
          and (${t.fincaId} is null or ${t.origen} = 'produccion_propia')
        when 'salida' then ${t.origen} is null and ${t.fincaId} is null and ${t.ajuste} is null
          and ${t.motivo} is null
        else ${t.ajuste} is not null and btrim(coalesce(${t.motivo}, '')) <> ''
          and ${t.origen} is null and ${t.fincaId} is null
      end`,
    ),
    separacionPorExplotacion(),
  ],
)
