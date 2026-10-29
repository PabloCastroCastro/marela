import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { animales } from './animales.js'
import { user } from './auth.js'
import { movimientosComida } from './comida.js'
import { id } from './comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from './explotacion.js'

// Finanzas de una explotación (docs/diseno.md, "Finanzas"), solo para el administrador.

// Régimen fiscal (GH-34): el Régimen Especial de Agricultura, Ganadería y Pesca (REAGP), en el que las
// ventas llevan un recibo de compensación, o el régimen general de IVA. Los porcentajes se configuran,
// no se fijan en el código.
export const REGIMENES_FISCALES = ['reagp', 'general'] as const

export const regimenFiscal = pgEnum('regimen_fiscal', REGIMENES_FISCALES)

// Mientras una explotación no lo configure: REAGP, con la compensación de la ganadería, y los tipos de
// IVA general, reducido y superreducido
export const FISCAL_POR_DEFECTO = {
  regimen: 'reagp' as const,
  compensacionReagp: 10.5,
  tiposIva: [21, 10, 4],
}

export const TIPOS_IVA_MAXIMO = 8

// Una fila por explotación, la de su configuración fiscal
export const configuracionFiscal = pgTable(
  'configuracion_fiscal',
  {
    id: id(),
    ...deExplotacion(),
    regimen: regimenFiscal('regimen').notNull().default(FISCAL_POR_DEFECTO.regimen),
    // Porcentaje de compensación del REAGP
    compensacionReagp: numeric('compensacion_reagp', { precision: 5, scale: 2, mode: 'number' })
      .notNull()
      .default(FISCAL_POR_DEFECTO.compensacionReagp),
    // Tipos de IVA que se ofrecen en las facturas, de mayor a menor
    tiposIva: numeric('tipos_iva', { precision: 5, scale: 2 })
      .array()
      .notNull()
      .default(sql`'{21,10,4}'`),
    ...auditoria(),
  },
  (t) => [
    unique('configuracion_fiscal_explotacion_unica').on(t.explotacionId),
    check(
      'configuracion_fiscal_compensacion',
      sql`${t.compensacionReagp} >= 0 and ${t.compensacionReagp} <= 100`,
    ),
    check(
      'configuracion_fiscal_tipos_iva',
      sql`cardinality(${t.tiposIva}) between 1 and ${sql.raw(String(TIPOS_IVA_MAXIMO))}
        and 0 <= all(${t.tiposIva}) and 100 >= all(${t.tiposIva})`,
    ),
    separacionPorExplotacion(),
  ],
)

// Facturas (GH-35): recibidas (gastos) y emitidas (ingresos). Se corrigen y se borran; los cambios
// quedan en el historial.
export const TIPOS_FACTURA = ['recibida', 'emitida'] as const

export const tipoFactura = pgEnum('tipo_factura', TIPOS_FACTURA)

// IVA o, en las ventas de quien está en el REAGP, compensación. Se guarda en cada factura para que
// un cambio de régimen no cambie las ya registradas.
export const IMPUESTOS_FACTURA = ['iva', 'compensacion'] as const

export const impuestoFactura = pgEnum('impuesto_factura', IMPUESTOS_FACTURA)

export const LINEAS_FACTURA_MAXIMO = 8

// Una línea por tipo de IVA (o de compensación): base imponible, porcentaje y cuota
export type LineaFactura = { base: number; porcentaje: number; cuota: number }

// NIF español: DNI, NIE (X, Y, Z), los de K, L y M, y el de las entidades (CIF). La letra o el
// dígito de control los comprueba la API (src/nif.ts).
export const FORMATO_NIF =
  '^([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$'

const importe = (nombre: string) => numeric(nombre, { precision: 12, scale: 2, mode: 'number' })

export const facturas = pgTable(
  'facturas',
  {
    id: id(),
    ...deExplotacion(),
    tipo: tipoFactura('tipo').notNull(),
    numero: text('numero').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    // El proveedor (recibidas) o el cliente (emitidas)
    tercero: text('tercero').notNull(),
    nif: text('nif').notNull(),
    // Un NIF de otro país no sigue el formato español
    nifExtranjero: boolean('nif_extranjero').notNull().default(false),
    concepto: text('concepto').notNull(),
    impuesto: impuestoFactura('impuesto').notNull().default('iva'),
    lineas: jsonb('lineas').$type<LineaFactura[]>().notNull(),
    // Sumas de las líneas
    baseImponible: importe('base_imponible').notNull(),
    cuota: importe('cuota').notNull(),
    total: importe('total').notNull(),
    // Pendiente mientras no tiene fecha de pago
    pagadaEn: date('pagada_en', { mode: 'string' }),
    // Archivo adjunto (PDF o foto): ruta relativa en el directorio de archivos, con nombre generado
    archivoRuta: text('archivo_ruta'),
    archivoNombre: text('archivo_nombre'),
    archivoTipo: text('archivo_tipo'),
    archivoTamano: integer('archivo_tamano'),
    ...auditoria(),
  },
  (t) => [
    // Los animales enlazados, de la misma explotación (clave foránea compuesta)
    unique('facturas_explotacion_id_unique').on(t.explotacionId, t.id),
    // Las emitidas, sin repetir número en la explotación; las recibidas, sin repetir la misma
    // factura del mismo proveedor
    uniqueIndex('facturas_emitidas_numero_unico')
      .on(t.explotacionId, sql`lower(${t.numero})`)
      .where(sql`${t.tipo} = 'emitida'`),
    uniqueIndex('facturas_recibidas_numero_unico')
      .on(t.explotacionId, t.nif, sql`lower(${t.numero})`)
      .where(sql`${t.tipo} = 'recibida'`),
    index('facturas_explotacion_fecha_idx').on(t.explotacionId, t.fecha),
    check('facturas_numero_no_vacio', sql`btrim(${t.numero}) <> ''`),
    check('facturas_tercero_no_vacio', sql`btrim(${t.tercero}) <> ''`),
    check('facturas_concepto_no_vacio', sql`btrim(${t.concepto}) <> ''`),
    check(
      'facturas_nif',
      sql`btrim(${t.nif}) <> '' and (${t.nifExtranjero} or ${t.nif} ~ ${sql.raw(`'${FORMATO_NIF}'`)})`,
    ),
    check(
      'facturas_lineas',
      sql`jsonb_typeof(${t.lineas}) = 'array'
        and jsonb_array_length(${t.lineas}) between 1 and ${sql.raw(String(LINEAS_FACTURA_MAXIMO))}`,
    ),
    check('facturas_total', sql`${t.total} = ${t.baseImponible} + ${t.cuota}`),
    check(
      'facturas_archivo',
      sql`(${t.archivoRuta} is null) = (${t.archivoNombre} is null)
        and (${t.archivoRuta} is null) = (${t.archivoTipo} is null)
        and (${t.archivoRuta} is null) = (${t.archivoTamano} is null)`,
    ),
    separacionPorExplotacion(),
  ],
)

// Animales comprados con una factura recibida (las compras son excepcionales). Las ventas se
// enlazan a sus animales desde Ventas (GH-38).
export const facturasAnimales = pgTable(
  'facturas_animales',
  {
    id: id(),
    ...deExplotacion(),
    facturaId: uuid('factura_id').notNull(),
    animalId: uuid('animal_id').notNull(),
    ...auditoria(),
  },
  (t) => [
    foreignKey({
      name: 'facturas_animales_factura_fk',
      columns: [t.explotacionId, t.facturaId],
      foreignColumns: [facturas.explotacionId, facturas.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'facturas_animales_animal_fk',
      columns: [t.explotacionId, t.animalId],
      foreignColumns: [animales.explotacionId, animales.id],
    }).onDelete('restrict'),
    unique('facturas_animales_unico').on(t.facturaId, t.animalId),
    index('facturas_animales_explotacion_idx').on(t.explotacionId),
    index('facturas_animales_animal_idx').on(t.animalId),
    separacionPorExplotacion(),
  ],
)

// Entradas de comida compradas con una factura recibida (GH-36): una factura, una o varias entradas;
// una entrada, como mucho una factura. Al borrar la factura se sueltan; una entrada con factura no se
// borra ni deja de ser una compra hasta que el administrador la quite.
export const facturasMovimientosComida = pgTable(
  'facturas_movimientos_comida',
  {
    id: id(),
    ...deExplotacion(),
    facturaId: uuid('factura_id').notNull(),
    movimientoId: uuid('movimiento_id').notNull(),
    ...auditoria(),
  },
  (t) => [
    foreignKey({
      name: 'facturas_movimientos_comida_factura_fk',
      columns: [t.explotacionId, t.facturaId],
      foreignColumns: [facturas.explotacionId, facturas.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'facturas_movimientos_comida_movimiento_fk',
      columns: [t.explotacionId, t.movimientoId],
      foreignColumns: [movimientosComida.explotacionId, movimientosComida.id],
    }).onDelete('restrict'),
    unique('facturas_movimientos_comida_movimiento_unico').on(t.movimientoId),
    index('facturas_movimientos_comida_explotacion_idx').on(t.explotacionId),
    index('facturas_movimientos_comida_factura_idx').on(t.facturaId),
    separacionPorExplotacion(),
  ],
)

// Otros ingresos y gastos (GH-37): los movimientos sin factura, como las subvenciones de la PAC, los
// seguros o los tickets. Se corrigen; uno registrado por error se anula con su motivo y sigue a la
// vista, sin contar en los totales.
export const TIPOS_APUNTE = ['ingreso', 'gasto'] as const

export const tipoApunte = pgEnum('tipo_apunte', TIPOS_APUNTE)

// Categorías fijas, para los informes (GH-39). Cada una es de ingreso o de gasto.
export const CATEGORIAS_INGRESO = ['subvencion', 'indemnizacion_seguro', 'otro_ingreso'] as const
export const CATEGORIAS_GASTO = [
  'seguro',
  'veterinario',
  'combustible',
  'reparaciones',
  'suministros',
  'impuestos',
  'otro_gasto',
] as const
export const CATEGORIAS_APUNTE = [...CATEGORIAS_INGRESO, ...CATEGORIAS_GASTO] as const

export const categoriaApunte = pgEnum('categoria_apunte', CATEGORIAS_APUNTE)

const lista = (valores: readonly string[]) => sql.raw(valores.map((v) => `'${v}'`).join(', '))

export const apuntes = pgTable(
  'apuntes',
  {
    id: id(),
    ...deExplotacion(),
    tipo: tipoApunte('tipo').notNull(),
    categoria: categoriaApunte('categoria').notNull(),
    fecha: date('fecha', { mode: 'string' }).notNull(),
    concepto: text('concepto').notNull(),
    importe: importe('importe').notNull(),
    observaciones: text('observaciones'),
    // Archivo adjunto opcional (el ticket, la resolución de la ayuda…), como en las facturas
    archivoRuta: text('archivo_ruta'),
    archivoNombre: text('archivo_nombre'),
    archivoTipo: text('archivo_tipo'),
    archivoTamano: integer('archivo_tamano'),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
    anuladoPor: uuid('anulado_por').references(() => user.id),
    motivoAnulacion: text('motivo_anulacion'),
    ...auditoria(),
  },
  (t) => [
    index('apuntes_explotacion_fecha_idx').on(t.explotacionId, t.fecha),
    check('apuntes_concepto_no_vacio', sql`btrim(${t.concepto}) <> ''`),
    check('apuntes_importe', sql`${t.importe} > 0`),
    check(
      'apuntes_categoria',
      sql`(${t.tipo} = 'ingreso' and ${t.categoria} in (${lista(CATEGORIAS_INGRESO)}))
        or (${t.tipo} = 'gasto' and ${t.categoria} in (${lista(CATEGORIAS_GASTO)}))`,
    ),
    check(
      'apuntes_archivo',
      sql`(${t.archivoRuta} is null) = (${t.archivoNombre} is null)
        and (${t.archivoRuta} is null) = (${t.archivoTipo} is null)
        and (${t.archivoRuta} is null) = (${t.archivoTamano} is null)`,
    ),
    check(
      'apuntes_anulacion',
      sql`(${t.anuladoEn} is null and ${t.anuladoPor} is null and ${t.motivoAnulacion} is null)
        or (${t.anuladoEn} is not null and ${t.anuladoPor} is not null
          and btrim(coalesce(${t.motivoAnulacion}, '')) <> '')`,
    ),
    separacionPorExplotacion(),
  ],
)
