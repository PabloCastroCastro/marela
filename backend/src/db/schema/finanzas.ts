import { sql } from 'drizzle-orm'
import { check, numeric, pgEnum, pgTable, unique } from 'drizzle-orm/pg-core'
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
