import { z } from '@hono/zod-openapi'
import { and, gte, isNull, lte } from 'drizzle-orm'
import type { Transaccion } from './db/explotacion.js'
import { apuntes, facturas, ventas } from './db/schema/index.js'
import { ErrorApi } from './errores.js'

// Informes de finanzas (GH-39), solo para el administrador. El resumen de ingresos y gastos por
// periodo cuenta lo que de verdad entra y sale, con impuestos, en la fecha de cada factura o
// movimiento (devengo):
// - Ingresos: las facturas emitidas (su total), las ventas sin factura (su total, que no lleva
//   impuestos; las que tienen factura ya cuentan por ella) y los otros ingresos.
// - Gastos: las facturas recibidas (su total) y los otros gastos.
// Los anulados no cuentan. Lo pendiente de cobro y de pago (facturas sin fecha de pago) va aparte.

export const PERIODOS = ['mes', 'trimestre', 'anio'] as const
export type Periodo = (typeof PERIODOS)[number]

export const FiltrosResumen = z
  .object({
    periodo: z.enum(PERIODOS).default('mes'),
    desde: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
    hasta: z.iso.date('Fecha no válida (aaaa-mm-dd)'),
  })
  .refine((f) => f.desde <= f.hasta, { path: ['hasta'], message: 'Tiene que ser después de desde' })

export type FiltrosResumen = z.output<typeof FiltrosResumen>

// Como mucho 10 años de golpe (120 meses)
const ANIOS_MAXIMO = 10

type Cifras = {
  ingresos: { facturas: number; ventas: number; otros: number; total: number }
  gastos: { facturas: number; otros: number; total: number }
  resultado: number
}

// En céntimos mientras se suma, para que cuadre
const vacias = () => ({
  facturasEmitidas: 0,
  ventas: 0,
  otrosIngresos: 0,
  facturasRecibidas: 0,
  otrosGastos: 0,
})
type Sumas = ReturnType<typeof vacias>

const cifras = (s: Sumas): Cifras => {
  const ingresos = s.facturasEmitidas + s.ventas + s.otrosIngresos
  const gastos = s.facturasRecibidas + s.otrosGastos
  return {
    ingresos: {
      facturas: s.facturasEmitidas / 100,
      ventas: s.ventas / 100,
      otros: s.otrosIngresos / 100,
      total: ingresos / 100,
    },
    gastos: {
      facturas: s.facturasRecibidas / 100,
      otros: s.otrosGastos / 100,
      total: gastos / 100,
    },
    resultado: (ingresos - gastos) / 100,
  }
}

const dos = (n: number) => String(n).padStart(2, '0')
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

// La clave del periodo de una fecha: "2026-10", "2026-T4" o "2026"
export function clavePeriodo(fecha: string, periodo: Periodo) {
  const anio = fecha.slice(0, 4)
  const mes = Number(fecha.slice(5, 7))
  if (periodo === 'mes') return `${anio}-${dos(mes)}`
  if (periodo === 'trimestre') return `${anio}-T${Math.ceil(mes / 3)}`
  return anio
}

// Todos los periodos entre dos fechas, aunque no tengan movimientos, con su primer y último día
export function periodosEntre(desde: string, hasta: string, periodo: Periodo) {
  const meses = periodo === 'mes' ? 1 : periodo === 'trimestre' ? 3 : 12
  let anio = Number(desde.slice(0, 4))
  // El primer mes del periodo de "desde"
  let mes = Math.floor((Number(desde.slice(5, 7)) - 1) / meses) * meses + 1
  if (periodo === 'anio') mes = 1
  const lista: { clave: string; desde: string; hasta: string }[] = []
  while (`${anio}-${dos(mes)}-01` <= hasta) {
    const finMes = mes + meses - 1
    const inicio = `${anio}-${dos(mes)}-01`
    lista.push({
      clave: clavePeriodo(inicio, periodo),
      desde: inicio,
      hasta: `${anio}-${dos(finMes)}-${dos(ultimoDia(anio, finMes))}`,
    })
    mes += meses
    if (mes > 12) {
      mes -= 12
      anio += 1
    }
  }
  return lista
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// "oct 2026", "4.º trim. 2026", "2026"
export const nombrePeriodo = (clave: string) => {
  const [anio, parte] = clave.split('-')
  if (!parte) return anio ?? clave
  if (parte.startsWith('T')) return `${parte.slice(1)}.º trim. ${anio}`
  return `${MESES[Number(parte) - 1] ?? parte} ${anio}`
}

const centimos = (n: number) => Math.round(n * 100)

export async function resumen(tx: Transaccion, filtros: FiltrosResumen) {
  const { desde, hasta, periodo } = filtros
  if (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4)) >= ANIOS_MAXIMO) {
    const mensaje = `Como mucho ${ANIOS_MAXIMO} años`
    throw new ErrorApi(400, 'validacion', mensaje, [{ campo: 'hasta', mensaje }])
  }
  const [deFacturas, deVentas, deApuntes] = [
    await tx
      .select({
        fecha: facturas.fecha,
        tipo: facturas.tipo,
        total: facturas.total,
        pagadaEn: facturas.pagadaEn,
      })
      .from(facturas)
      .where(and(gte(facturas.fecha, desde), lte(facturas.fecha, hasta))),
    await tx
      .select({ fecha: ventas.fecha, total: ventas.total })
      .from(ventas)
      .where(and(gte(ventas.fecha, desde), lte(ventas.fecha, hasta), isNull(ventas.facturaId))),
    await tx
      .select({ fecha: apuntes.fecha, tipo: apuntes.tipo, importe: apuntes.importe })
      .from(apuntes)
      .where(and(gte(apuntes.fecha, desde), lte(apuntes.fecha, hasta), isNull(apuntes.anuladoEn))),
  ]

  const periodos = periodosEntre(desde, hasta, periodo)
  const sumas = new Map(periodos.map((p) => [p.clave, vacias()]))
  const total = vacias()
  const sumar = (fecha: string, campo: keyof Sumas, importe: number) => {
    const s = sumas.get(clavePeriodo(fecha, periodo))
    if (s) s[campo] += centimos(importe)
    total[campo] += centimos(importe)
  }
  const pendiente = { cobro: 0, pago: 0 }
  for (const f of deFacturas) {
    sumar(f.fecha, f.tipo === 'emitida' ? 'facturasEmitidas' : 'facturasRecibidas', f.total)
    if (!f.pagadaEn) pendiente[f.tipo === 'emitida' ? 'cobro' : 'pago'] += centimos(f.total)
  }
  for (const v of deVentas) sumar(v.fecha, 'ventas', v.total)
  for (const a of deApuntes)
    sumar(a.fecha, a.tipo === 'ingreso' ? 'otrosIngresos' : 'otrosGastos', a.importe)

  return {
    periodo,
    desde,
    hasta,
    filas: periodos.map((p) => ({ ...p, ...cifras(sumas.get(p.clave) ?? vacias()) })),
    total: cifras(total),
    pendiente: { cobro: pendiente.cobro / 100, pago: pendiente.pago / 100 },
  }
}
