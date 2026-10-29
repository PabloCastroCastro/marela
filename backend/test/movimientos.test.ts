import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { almacenes, historialCambios } from '../src/db/schema/index.js'
import { hoyEnMadrid } from '../src/fechas.js'
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

const codigo = async (res: Response) =>
  ((await res.json()) as { error: { codigo: string } }).error.codigo

const campos = async (res: Response) =>
  ((await res.json()) as { error: { detalles?: { campo: string }[] } }).error.detalles?.map(
    (d) => d.campo,
  ) ?? []

type Movimiento = {
  id: string
  tipo: string
  fecha: string
  cantidad: number
  finca: { id: string; nombre: string } | null
  diferencia: number
  stock: number
}
type Almacen = { id: string; stock: number; unidad: string; conMovimientos: boolean }

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

// Fechas de los últimos días: no pueden ser futuras
const haceDias = (n: number) => {
  const d = new Date(`${hoyEnMadrid()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

const nuevoAlmacen = async (explotacion = a, cookie = admin.cookie, unidad = 'kg') =>
  (await (
    await pedir('POST', `/explotaciones/${explotacion}/almacenes`, cookie, {
      nombre: `Almacén ${randomInt(1e9)}`,
      tipo: 'pienso',
      unidad,
    })
  ).json()) as Almacen

const ruta = (almacenId: string, explotacion = a) =>
  `/explotaciones/${explotacion}/almacenes/${almacenId}/movimientos`

const registrar = (almacenId: string, datos: object, cookie = empleado.cookie, explotacion = a) =>
  pedir('POST', ruta(almacenId, explotacion), cookie, { fecha: haceDias(0), ...datos })

const entrada = (cantidad: number, fecha = haceDias(0)) => ({
  tipo: 'entrada',
  origen: 'compra',
  cantidad,
  fecha,
})
const salida = (cantidad: number, fecha = haceDias(0)) => ({ tipo: 'salida', cantidad, fecha })

const verAlmacen = async (id: string, cookie = empleado.cookie) =>
  (await (await pedir('GET', `/explotaciones/${a}/almacenes/${id}`, cookie)).json()) as Almacen

const movimientos = async (almacenId: string, filtro = '') =>
  (await (
    await pedir('GET', `${ruta(almacenId)}${filtro}`, empleado.cookie)
  ).json()) as Movimiento[]

beforeAll(async () => {
  a = (await nuevaExplotacion('A de movimientos')).id
  b = (await nuevaExplotacion('B de movimientos')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(a, e.id, 'empleado')
  empleado = { id: e.id, cookie: await iniciarSesion(app, e) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  deB = { id: v.id, cookie: await iniciarSesion(app, v) }
})

afterAll(async () => {
  await pool.end()
})

describe('movimientos de comida', () => {
  it('calcula el stock de las entradas, salidas y ajustes; un recuento lo fija', async () => {
    const almacen = await nuevoAlmacen()
    expect(almacen).toMatchObject({ stock: 0, conMovimientos: false })

    // El empleado registra
    expect((await registrar(almacen.id, entrada(1000.555, haceDias(5)))).status).toBe(201)
    await registrar(almacen.id, salida(300, haceDias(4)))
    await registrar(almacen.id, {
      tipo: 'ajuste',
      ajuste: 'merma',
      cantidad: 50,
      motivo: 'Pienso húmedo',
      fecha: haceDias(3),
    })
    expect(await verAlmacen(almacen.id)).toMatchObject({ stock: 650.56, conMovimientos: true })

    // El recuento deja el stock en lo contado; lo anterior ya no cuenta
    await registrar(almacen.id, {
      tipo: 'ajuste',
      ajuste: 'recuento',
      cantidad: 600,
      motivo: 'Recuento de fin de mes',
      fecha: haceDias(2),
    })
    await registrar(almacen.id, entrada(200, haceDias(1)))
    expect((await verAlmacen(almacen.id)).stock).toBe(800)
    // Una salida anterior al recuento no cambia el stock de después
    await registrar(almacen.id, salida(100, haceDias(5)))
    expect((await verAlmacen(almacen.id)).stock).toBe(800)

    const lista = await movimientos(almacen.id)
    expect(lista.map((m) => [m.tipo, m.fecha, m.diferencia, m.stock])).toEqual([
      ['entrada', haceDias(1), 200, 800],
      ['ajuste', haceDias(2), 49.44, 600],
      ['ajuste', haceDias(3), -50, 550.56],
      ['salida', haceDias(4), -300, 600.56],
      ['salida', haceDias(5), -100, 900.56],
      ['entrada', haceDias(5), 1000.56, 1000.56],
    ])
  })

  it('deja el stock en negativo, y una entrada lo corrige', async () => {
    const almacen = await nuevoAlmacen()
    expect((await registrar(almacen.id, salida(40))).status).toBe(201)
    expect((await verAlmacen(almacen.id)).stock).toBe(-40)
    await registrar(almacen.id, entrada(100))
    expect((await verAlmacen(almacen.id)).stock).toBe(60)
  })

  it('valida cada tipo con sus datos', async () => {
    const almacen = await nuevoAlmacen()
    const otraFinca = (await (
      await pedir('POST', `/explotaciones/${b}/fincas`, deB.cookie, {
        nombre: `Finca ${randomInt(1e9)}`,
        parcelas: [{ referenciaCatastral: `36024A${randomInt(1e9)}`, superficie: 1 }],
      })
    ).json()) as { id: string }
    const casos: [object, string][] = [
      [{ tipo: 'entrada', cantidad: 10 }, 'origen'],
      [{ ...salida(0) }, 'cantidad'],
      [{ ...salida(-5) }, 'cantidad'],
      [{ ...salida(5), fecha: '2999-01-01' }, 'fecha'],
      [{ ...salida(5), origen: 'compra' }, 'origen'],
      [{ ...entrada(5), fincaId: otraFinca.id }, 'fincaId'],
      [
        { tipo: 'entrada', origen: 'produccion_propia', cantidad: 5, fincaId: otraFinca.id },
        'fincaId',
      ],
      [{ tipo: 'ajuste', cantidad: 5, motivo: 'X' }, 'ajuste'],
      [{ tipo: 'ajuste', ajuste: 'merma', cantidad: 5 }, 'motivo'],
      [{ tipo: 'ajuste', ajuste: 'merma', cantidad: 0, motivo: 'X' }, 'cantidad'],
    ]
    for (const [datos, campo] of casos) {
      const res = await registrar(almacen.id, datos)
      expect([res.status, await campos(res)], JSON.stringify(datos)).toEqual([
        400,
        expect.arrayContaining([campo]),
      ])
    }
    // Un recuento puede dejarlo vacío
    const vacio = await registrar(almacen.id, {
      tipo: 'ajuste',
      ajuste: 'recuento',
      cantidad: 0,
      motivo: 'Silo vacío',
    })
    expect(vacio.status).toBe(201)
  })

  it('guarda la finca de la producción propia', async () => {
    const almacen = await nuevoAlmacen(a, admin.cookie, 'unidades')
    const finca = (await (
      await pedir('POST', `/explotaciones/${a}/fincas`, admin.cookie, {
        nombre: `Finca ${randomInt(1e9)}`,
        parcelas: [{ referenciaCatastral: `36024A${randomInt(1e9)}`, superficie: 1 }],
      })
    ).json()) as { id: string; nombre: string }
    const res = await registrar(almacen.id, {
      tipo: 'entrada',
      origen: 'produccion_propia',
      fincaId: finca.id,
      cantidad: 40,
    })
    expect(((await res.json()) as Movimiento).finca).toEqual({ id: finca.id, nombre: finca.nombre })
  })

  it('filtra el historial por fecha y tipo', async () => {
    const almacen = await nuevoAlmacen()
    await registrar(almacen.id, entrada(100, haceDias(10)))
    await registrar(almacen.id, salida(10, haceDias(6)))
    await registrar(almacen.id, salida(10, haceDias(2)))
    const tipos = async (filtro: string) =>
      (await movimientos(almacen.id, filtro)).map((m) => m.fecha)
    expect(await tipos('?tipo=salida')).toEqual([haceDias(2), haceDias(6)])
    expect(await tipos(`?desde=${haceDias(7)}&hasta=${haceDias(3)}`)).toEqual([haceDias(6)])
  })

  it('corrige y borra un movimiento, y queda en el historial', async () => {
    const almacen = await nuevoAlmacen()
    const creado = (await (await registrar(almacen.id, entrada(100))).json()) as Movimiento
    const corregido = await pedir('PUT', `${ruta(almacen.id)}/${creado.id}`, empleado.cookie, {
      ...entrada(120),
    })
    expect(((await corregido.json()) as Movimiento).cantidad).toBe(120)
    expect((await verAlmacen(almacen.id)).stock).toBe(120)

    const borrado = await pedir('DELETE', `${ruta(almacen.id)}/${creado.id}`, empleado.cookie)
    expect(((await borrado.json()) as Movimiento).id).toBe(creado.id)
    expect((await verAlmacen(almacen.id)).stock).toBe(0)

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, creado.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'cambio', 'borrado'])
  })

  it('con movimientos, la unidad del almacén no cambia', async () => {
    const almacen = await nuevoAlmacen()
    const cambiar = (unidad: string) =>
      pedir('PUT', `/explotaciones/${a}/almacenes/${almacen.id}`, admin.cookie, {
        nombre: `Almacén ${randomInt(1e9)}`,
        tipo: 'pienso',
        unidad,
      })
    expect((await cambiar('unidades')).status).toBe(200)
    expect((await cambiar('kg')).status).toBe(200)
    await registrar(almacen.id, entrada(5))
    const res = await cambiar('unidades')
    expect(res.status).toBe(409)
    expect(await campos(res)).toEqual(['unidad'])
    // El nombre sí
    expect((await cambiar('kg')).status).toBe(200)

    // La base de datos lo impide también
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx.update(almacenes).set({ unidad: 'unidades' }).where(eq(almacenes.id, almacen.id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'almacenes_unidad_con_movimientos' } })
  })

  it('no registra en un almacén desactivado', async () => {
    const almacen = await nuevoAlmacen()
    await pedir('PATCH', `/explotaciones/${a}/almacenes/${almacen.id}/estado`, admin.cookie, {
      activo: false,
    })
    const res = await registrar(almacen.id, entrada(5))
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('almacen_desactivado')
  })

  it('otra explotación no ve ni toca sus movimientos', async () => {
    const almacen = await nuevoAlmacen()
    const creado = (await (await registrar(almacen.id, entrada(5))).json()) as Movimiento
    const lista = await pedir('GET', ruta(almacen.id, b), deB.cookie)
    expect(lista.status).toBe(404)
    expect(await codigo(lista)).toBe('almacen_no_encontrado')
    expect((await registrar(almacen.id, entrada(5), deB.cookie, b)).status).toBe(404)
    const borrar = await pedir('DELETE', `${ruta(almacen.id, b)}/${creado.id}`, deB.cookie)
    expect(borrar.status).toBe(404)
    // Ni moverlo a un almacén suyo
    const suyo = await nuevoAlmacen(b, deB.cookie)
    expect(
      (await pedir('PUT', `${ruta(suyo.id, b)}/${creado.id}`, deB.cookie, entrada(1))).status,
    ).toBe(404)
  })
})
