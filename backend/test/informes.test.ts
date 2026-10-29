import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { animales } from '../src/db/schema/index.js'
import { clavePeriodo, periodosEntre } from '../src/informes.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()

const pedir = (metodo: string, ruta: string, cookie: string, cuerpo?: object) =>
  Promise.resolve(
    app.request(`/api${ruta}`, {
      method: metodo,
      headers: {
        cookie,
        origin: ORIGEN,
        ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    }),
  )

type Cifras = {
  ingresos: { facturas: number; ventas: number; otros: number; total: number }
  gastos: { facturas: number; otros: number; total: number }
  resultado: number
}
type Resumen = {
  filas: (Cifras & { clave: string; desde: string; hasta: string })[]
  total: Cifras
  pendiente: { cobro: number; pago: number }
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

const unico = () => Math.random().toString(36).slice(2, 10)
const crotal = () => `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`

const factura = (datos: object) =>
  pedir('POST', `/explotaciones/${a}/facturas`, admin.cookie, {
    numero: `F-${unico()}`,
    tercero: 'Alguien',
    nif: '12345678Z',
    concepto: 'Algo',
    ...datos,
  })

const resumen = async (filtros: string, explotacion = a, cookie = admin.cookie) =>
  (await (
    await pedir('GET', `/explotaciones/${explotacion}/informes/resumen?${filtros}`, cookie)
  ).json()) as Resumen

beforeAll(async () => {
  a = (await nuevaExplotacion('A informes')).id
  b = (await nuevaExplotacion('B informes')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(a, e.id, 'empleado')
  empleado = { id: e.id, cookie: await iniciarSesion(app, e) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  deB = { id: v.id, cookie: await iniciarSesion(app, v) }

  // Enero: una venta con factura (cuenta la factura, 1.105 €) y una compra pagada de 121 €
  const emitida = (await (
    await factura({
      tipo: 'emitida',
      fecha: '2025-01-15',
      impuesto: 'compensacion',
      lineas: [{ base: 1000, porcentaje: 10.5, cuota: 105 }],
      total: 1105,
    })
  ).json()) as { id: string }
  await factura({
    tipo: 'recibida',
    fecha: '2025-01-20',
    lineas: [{ base: 100, porcentaje: 21, cuota: 21 }],
    total: 121,
    pagadaEn: '2025-01-25',
  })
  const [t1, t2] = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
    tx
      .insert(animales)
      .values(
        [1, 2].map(() => ({
          crotal: crotal(),
          raza: 'Rubia Gallega',
          sexo: 'macho' as const,
          fechaNacimiento: '2024-06-01',
        })),
      )
      .returning({ id: animales.id }),
  )
  await pedir('POST', `/explotaciones/${a}/ventas`, admin.cookie, {
    fecha: '2025-01-15',
    comprador: 'Carnes Galegas',
    modoPrecio: 'total',
    precio: 1000,
    animales: [{ animalId: t1?.id }],
    facturaId: emitida.id,
  })
  // Mayo: una venta sin factura (800 €), una ayuda de la PAC, un seguro y un gasto anulado
  await pedir('POST', `/explotaciones/${a}/ventas`, admin.cookie, {
    fecha: '2025-05-10',
    comprador: 'Tratante',
    modoPrecio: 'total',
    precio: 800,
    animales: [{ animalId: t2?.id }],
  })
  const apunte = (datos: object) =>
    pedir('POST', `/explotaciones/${a}/apuntes`, admin.cookie, { fecha: '2025-05-20', ...datos })
  await apunte({ tipo: 'ingreso', categoria: 'subvencion', concepto: 'PAC', importe: 3000 })
  await apunte({ tipo: 'gasto', categoria: 'seguro', concepto: 'Seguro', importe: 400.5 })
  const anulado = (await (
    await apunte({ tipo: 'gasto', categoria: 'combustible', concepto: 'Repetido', importe: 999 })
  ).json()) as { id: string }
  await pedir('POST', `/explotaciones/${a}/apuntes/${anulado.id}/anulacion`, admin.cookie, {
    motivo: 'Repetido',
  })
  // Noviembre: una compra pendiente de pago
  await factura({
    tipo: 'recibida',
    fecha: '2025-11-03',
    lineas: [{ base: 500, porcentaje: 10, cuota: 50 }],
    total: 550,
  })
})

afterAll(async () => {
  await pool.end()
})

describe('periodos', () => {
  it('meses, trimestres y años, también los vacíos', () => {
    expect(clavePeriodo('2026-10-29', 'mes')).toBe('2026-10')
    expect(clavePeriodo('2026-10-29', 'trimestre')).toBe('2026-T4')
    expect(clavePeriodo('2026-10-29', 'anio')).toBe('2026')
    expect(periodosEntre('2025-11-15', '2026-02-10', 'mes').map((p) => p.clave)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(periodosEntre('2024-02-01', '2024-12-31', 'trimestre')).toEqual([
      { clave: '2024-T1', desde: '2024-01-01', hasta: '2024-03-31' },
      { clave: '2024-T2', desde: '2024-04-01', hasta: '2024-06-30' },
      { clave: '2024-T3', desde: '2024-07-01', hasta: '2024-09-30' },
      { clave: '2024-T4', desde: '2024-10-01', hasta: '2024-12-31' },
    ])
    expect(periodosEntre('2024-02-29', '2024-02-29', 'mes')[0]?.hasta).toBe('2024-02-29')
    expect(periodosEntre('2023-05-01', '2025-01-01', 'anio').map((p) => p.clave)).toEqual([
      '2023',
      '2024',
      '2025',
    ])
  })
})

describe('resumen de ingresos y gastos', () => {
  it('por meses, con impuestos y por la fecha de cada factura o movimiento', async () => {
    const r = await resumen('periodo=mes&desde=2025-01-01&hasta=2025-12-31')
    expect(r.filas).toHaveLength(12)
    const mes = (n: number) => r.filas[n - 1]
    // La venta con factura cuenta por su factura, no dos veces
    expect(mes(1)).toMatchObject({
      clave: '2025-01',
      ingresos: { facturas: 1105, ventas: 0, otros: 0, total: 1105 },
      gastos: { facturas: 121, otros: 0, total: 121 },
      resultado: 984,
    })
    // El gasto anulado no cuenta
    expect(mes(5)).toMatchObject({
      ingresos: { ventas: 800, otros: 3000, total: 3800 },
      gastos: { otros: 400.5, total: 400.5 },
      resultado: 3399.5,
    })
    expect(mes(2)).toMatchObject({ ingresos: { total: 0 }, gastos: { total: 0 }, resultado: 0 })
    expect(r.total).toMatchObject({
      ingresos: { total: 4905 },
      gastos: { total: 1071.5 },
      resultado: 3833.5,
    })
    // Lo pendiente: la emitida sin cobrar y la compra de noviembre sin pagar
    expect(r.pendiente).toEqual({ cobro: 1105, pago: 550 })
  })

  it('por trimestres y por años, y solo en el rango', async () => {
    const t = await resumen('periodo=trimestre&desde=2025-01-01&hasta=2025-12-31')
    expect(t.filas.map((f) => [f.clave, f.resultado])).toEqual([
      ['2025-T1', 984],
      ['2025-T2', 3399.5],
      ['2025-T3', 0],
      ['2025-T4', -550],
    ])
    const anio = await resumen('periodo=anio&desde=2024-01-01&hasta=2025-12-31')
    expect(anio.filas.map((f) => [f.clave, f.resultado])).toEqual([
      ['2024', 0],
      ['2025', 3833.5],
    ])
    const mayo = await resumen('periodo=mes&desde=2025-05-01&hasta=2025-05-31')
    expect(mayo.total.resultado).toBe(3399.5)
    expect(mayo.pendiente).toEqual({ cobro: 0, pago: 0 })
  })

  it('valida las fechas; solo el administrador y cada explotación, lo suyo', async () => {
    const res = (filtros: string, explotacion = a, cookie = admin.cookie) =>
      pedir('GET', `/explotaciones/${explotacion}/informes/resumen?${filtros}`, cookie)
    expect((await res('desde=2025-12-01&hasta=2025-01-01')).status).toBe(400)
    expect((await res('desde=2000-01-01&hasta=2025-01-01')).status).toBe(400)
    expect((await res('hasta=2025-01-01')).status).toBe(400)
    expect((await res('desde=2025-01-01&hasta=2025-12-31', a, empleado.cookie)).status).toBe(403)
    const deOtra = await resumen('periodo=anio&desde=2025-01-01&hasta=2025-12-31', b, deB.cookie)
    expect(deOtra.total.resultado).toBe(0)
  })
})
