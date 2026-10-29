import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import {
  facturas,
  facturasMovimientosComida,
  historialCambios,
  movimientosComida,
} from '../src/db/schema/index.js'
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

const campos = async (res: Response) =>
  ((await res.json()) as { error: { detalles?: { campo: string }[] } }).error.detalles?.map(
    (d) => d.campo,
  ) ?? []

type Entrada = { id: string; factura?: { id: string; numero: string } | null }
type Factura = { id: string; numero: string; entradasComida: { id: string; cantidad: number }[] }

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }
let almacen = ''

const nuevoAlmacen = async (explotacion = a, cookie = admin.cookie) =>
  (
    (await (
      await pedir('POST', `/explotaciones/${explotacion}/almacenes`, cookie, {
        nombre: `Almacén ${randomInt(1e9)}`,
        tipo: 'pienso',
        unidad: 'kg',
      })
    ).json()) as { id: string }
  ).id

const movimientos = (almacenId = almacen, explotacion = a) =>
  `/explotaciones/${explotacion}/almacenes/${almacenId}/movimientos`

const registrar = async (
  datos: object,
  almacenId = almacen,
  explotacion = a,
  cookie = empleado.cookie,
) =>
  (await (
    await pedir('POST', movimientos(almacenId, explotacion), cookie, {
      fecha: '2026-10-01',
      ...datos,
    })
  ).json()) as Entrada

const compra = (cantidad = 500) => ({ tipo: 'entrada', origen: 'compra', cantidad })

const nuevaFactura = async (datos: object = {}) =>
  (await (
    await pedir('POST', `/explotaciones/${a}/facturas`, admin.cookie, {
      tipo: 'recibida',
      numero: `P-${randomInt(1e9)}`,
      fecha: '2026-10-02',
      tercero: 'Piensos do Norte',
      nif: 'B15000003',
      concepto: 'Pienso',
      lineas: [{ base: 100, porcentaje: 10, cuota: 10 }],
      total: 110,
      ...datos,
    })
  ).json()) as Factura

const asociar = (facturaId: string, movimientoIds: string[], cookie = admin.cookie) =>
  pedir('PUT', `/explotaciones/${a}/facturas/${facturaId}/entradas-comida`, cookie, {
    movimientoIds,
  })

beforeAll(async () => {
  a = (await nuevaExplotacion('A facturas de comida')).id
  b = (await nuevaExplotacion('B facturas de comida')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(a, e.id, 'empleado')
  empleado = { id: e.id, cookie: await iniciarSesion(app, e) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  deB = { id: v.id, cookie: await iniciarSesion(app, v) }
  almacen = await nuevoAlmacen()
})

afterAll(async () => {
  await pool.end()
})

describe('facturas de las entradas de comida', () => {
  it('el administrador asocia una factura a varias entradas compradas; queda en el historial', async () => {
    const [e1, e2] = [await registrar(compra(500)), await registrar(compra(300))]
    const factura = await nuevaFactura()
    const res = await asociar(factura.id, [e1?.id ?? '', e2?.id ?? ''])
    expect(res.status).toBe(200)
    expect(((await res.json()) as Factura).entradasComida.map((e) => e.cantidad).sort()).toEqual([
      300, 500,
    ])

    // Se cambian por otras: la lista sustituye a la anterior
    const quitada = await asociar(factura.id, [e1?.id ?? ''])
    expect(((await quitada.json()) as Factura).entradasComida.map((e) => e.id)).toEqual([e1?.id])
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.tabla, 'facturas_movimientos_comida')),
    )
    expect(cambios.map((c) => c.operacion).sort()).toEqual([
      'alta',
      'alta',
      'alta',
      'borrado',
      'borrado',
    ])
  })

  it('solo entradas compradas, solo facturas recibidas y cada entrada de una sola factura', async () => {
    const propia = await registrar({ tipo: 'entrada', origen: 'produccion_propia', cantidad: 50 })
    const salida = await registrar({ tipo: 'salida', cantidad: 5 })
    const comprada = await registrar(compra())
    const factura = await nuevaFactura()
    expect(await campos(await asociar(factura.id, [propia.id]))).toContain('movimientoIds')
    expect(await campos(await asociar(factura.id, [salida.id]))).toContain('movimientoIds')

    const emitida = await nuevaFactura({ tipo: 'emitida', nif: '12345678Z' })
    expect(await campos(await asociar(emitida.id, [comprada.id]))).toContain('movimientoIds')

    await asociar(factura.id, [comprada.id])
    const otra = await nuevaFactura()
    const repetida = await asociar(otra.id, [comprada.id])
    expect(repetida.status).toBe(409)
    expect(await campos(repetida)).toContain('movimientoIds')

    // Una factura con entradas no pasa a emitida
    const cambio = await pedir('PUT', `/explotaciones/${a}/facturas/${factura.id}`, admin.cookie, {
      tipo: 'emitida',
      numero: factura.numero,
      fecha: '2026-10-02',
      tercero: 'Piensos do Norte',
      nif: 'B15000003',
      concepto: 'Pienso',
      lineas: [{ base: 100, porcentaje: 10, cuota: 10 }],
      total: 110,
    })
    expect(await campos(cambio)).toContain('tipo')

    // Al borrar la factura, la entrada se queda sin factura
    await pedir('DELETE', `/explotaciones/${a}/facturas/${factura.id}`, admin.cookie)
    expect((await asociar(otra.id, [comprada.id])).status).toBe(200)
  })

  it('la entrada con factura sigue siendo una compra y no se borra', async () => {
    const comprada = await registrar(compra(200))
    const factura = await nuevaFactura()
    await asociar(factura.id, [comprada.id])
    const corregir = (datos: object) =>
      pedir('PUT', `${movimientos()}/${comprada.id}`, empleado.cookie, {
        fecha: '2026-10-01',
        ...datos,
      })
    // Se corrige la cantidad, pero no deja de ser una compra
    expect((await corregir(compra(250))).status).toBe(200)
    const cambio = await corregir({ tipo: 'entrada', origen: 'produccion_propia', cantidad: 250 })
    expect(cambio.status).toBe(409)
    expect(((await cambio.json()) as { error: { codigo: string } }).error.codigo).toBe(
      'entrada_con_factura',
    )
    expect((await pedir('DELETE', `${movimientos()}/${comprada.id}`, empleado.cookie)).status).toBe(
      409,
    )
    // Quitada de la factura, ya se borra
    await asociar(factura.id, [])
    expect((await pedir('DELETE', `${movimientos()}/${comprada.id}`, empleado.cookie)).status).toBe(
      200,
    )
  })

  it('filtra las entradas por origen y por tener o no factura; el empleado no ve las facturas', async () => {
    const otroAlmacen = await nuevoAlmacen()
    const conFactura = await registrar(compra(10), otroAlmacen)
    const sinFactura = await registrar(compra(20), otroAlmacen)
    const propia = await registrar(
      { tipo: 'entrada', origen: 'produccion_propia', cantidad: 30 },
      otroAlmacen,
    )
    const factura = await nuevaFactura()
    await asociar(factura.id, [conFactura.id])

    const ids = async (ruta: string, cookie = admin.cookie) =>
      ((await (await pedir('GET', ruta, cookie)).json()) as Entrada[]).map((e) => e.id)
    expect(await ids(`${movimientos(otroAlmacen)}?factura=con`)).toEqual([conFactura.id])
    expect((await ids(`${movimientos(otroAlmacen)}?factura=sin&origen=compra`)).sort()).toEqual(
      [sinFactura.id].sort(),
    )
    expect(await ids(`${movimientos(otroAlmacen)}?origen=produccion_propia`)).toEqual([propia.id])

    // El administrador ve la factura de cada entrada
    const lista = (await (
      await pedir('GET', movimientos(otroAlmacen), admin.cookie)
    ).json()) as Entrada[]
    expect(lista.find((e) => e.id === conFactura.id)?.factura).toMatchObject({
      id: factura.id,
      numero: factura.numero,
    })
    expect(lista.find((e) => e.id === sinFactura.id)?.factura).toBeNull()

    // El empleado filtra por origen, pero no ve las facturas
    const delEmpleado = (await (
      await pedir('GET', movimientos(otroAlmacen), empleado.cookie)
    ).json()) as Entrada[]
    expect(delEmpleado.every((e) => !('factura' in e))).toBe(true)
    expect(await ids(`${movimientos(otroAlmacen)}?origen=compra`, empleado.cookie)).toHaveLength(2)
    expect(
      (await pedir('GET', `${movimientos(otroAlmacen)}?factura=sin`, empleado.cookie)).status,
    ).toBe(403)
    expect(
      (await pedir('GET', `/explotaciones/${a}/entradas-comida`, empleado.cookie)).status,
    ).toBe(403)
    expect((await asociar(factura.id, [], empleado.cookie)).status).toBe(403)

    // Las de todos los almacenes, para elegirlas desde la factura
    const sinFacturaTodas = await ids(
      `/explotaciones/${a}/entradas-comida?origen=compra&factura=sin&almacenId=${otroAlmacen}`,
    )
    expect(sinFacturaTodas).toEqual([sinFactura.id])
  })

  it('otra explotación no ve ni asocia las entradas, y la base de datos lo impide también', async () => {
    const comprada = await registrar(compra())
    const almacenB = await nuevoAlmacen(b, deB.cookie)
    const deOtra = await registrar(compra(), almacenB, b, deB.cookie)
    const factura = await nuevaFactura()
    expect(await campos(await asociar(factura.id, [deOtra.id]))).toContain('movimientoIds')
    expect(
      (await (
        await pedir('GET', `/explotaciones/${b}/entradas-comida`, deB.cookie)
      ).json()) as Entrada[],
    ).not.toContainEqual(expect.objectContaining({ id: comprada.id }))
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx
          .insert(facturasMovimientosComida)
          .values({ facturaId: factura.id, movimientoId: deOtra.id }),
      ),
    ).rejects.toMatchObject({
      // El trigger no ve la entrada de la otra explotación (RLS) y lo para antes que la clave foránea
      cause: { code: expect.stringMatching(/^235(03|14)$/) },
    })

    // La base de datos: solo compras, y una entrada con factura no deja de serlo
    const propia = await registrar({ tipo: 'entrada', origen: 'produccion_propia', cantidad: 5 })
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx
          .insert(facturasMovimientosComida)
          .values({ facturaId: factura.id, movimientoId: propia.id }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'facturas_movimientos_comida_compra' } })
    await asociar(factura.id, [comprada.id])
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx
          .update(movimientosComida)
          .set({ origen: 'produccion_propia' })
          .where(eq(movimientosComida.id, comprada.id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'facturas_movimientos_comida_compra' } })
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx.update(facturas).set({ tipo: 'emitida' }).where(eq(facturas.id, factura.id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'facturas_movimientos_comida_recibida' } })
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx.delete(movimientosComida).where(eq(movimientosComida.id, comprada.id)),
      ),
    ).rejects.toMatchObject({ cause: { code: '23001' } })
  })
})
