import { z } from '@hono/zod-openapi'
import type { Transaccion } from './db/explotacion.js'
import {
  configuracionFiscal,
  FISCAL_POR_DEFECTO,
  REGIMENES_FISCALES,
  TIPOS_IVA_MAXIMO,
} from './db/schema/index.js'

// Régimen fiscal de la explotación (GH-34), solo para el administrador (módulo finanzas). Mientras no
// se configura, vale el de por defecto: REAGP con el 10,5 % y los tipos de IVA 21, 10 y 4 %.

const porcentaje = (mensaje: string) =>
  z
    .number(mensaje)
    .min(0, 'No puede ser negativo')
    .max(100, 'Como mucho 100 %')
    // Dos decimales, como se guarda
    .transform((n) => Math.round(n * 100) / 100)

export const DatosFiscales = z
  .object({
    regimen: z.enum(REGIMENES_FISCALES, 'Indica el régimen'),
    compensacionReagp: porcentaje('Indica el porcentaje de compensación').openapi({
      example: 10.5,
    }),
    tiposIva: z
      .array(porcentaje('Indica el tipo de IVA'))
      .min(1, 'Indica al menos un tipo de IVA')
      .max(TIPOS_IVA_MAXIMO, `Como mucho ${TIPOS_IVA_MAXIMO} tipos de IVA`)
      // Sin repetir, de mayor a menor
      .transform((tipos) => [...new Set(tipos)].sort((a, b) => b - a))
      .openapi({ example: [21, 10, 4] }),
  })
  .openapi('DatosFiscales')

export type DatosFiscales = z.output<typeof DatosFiscales>

// La configurada o, si no la hay, la de por defecto
export async function verFiscal(tx: Transaccion) {
  const [fila] = await tx
    .select({
      regimen: configuracionFiscal.regimen,
      compensacionReagp: configuracionFiscal.compensacionReagp,
      tiposIva: configuracionFiscal.tiposIva,
      modificadoEn: configuracionFiscal.modificadoEn,
    })
    .from(configuracionFiscal)
  if (!fila) return { ...FISCAL_POR_DEFECTO, configurado: false, modificadoEn: null }
  return {
    regimen: fila.regimen,
    compensacionReagp: fila.compensacionReagp,
    tiposIva: fila.tiposIva.map(Number),
    configurado: true,
    modificadoEn: fila.modificadoEn.toISOString(),
  }
}

// Una sola fila por explotación: se crea la primera vez y después se cambia. Queda en el historial.
export async function guardarFiscal(tx: Transaccion, datos: DatosFiscales) {
  const valores = {
    regimen: datos.regimen,
    compensacionReagp: datos.compensacionReagp,
    tiposIva: datos.tiposIva.map(String),
  }
  await tx
    .insert(configuracionFiscal)
    .values(valores)
    .onConflictDoUpdate({ target: configuracionFiscal.explotacionId, set: valores })
  return verFiscal(tx)
}
