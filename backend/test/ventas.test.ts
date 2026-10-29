import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { animales, historialCambios, pesos, tratamientos, ventas } from '../src/db/schema/index.js'
import { calcularImportes } from '../src/ventas.js'
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

const error = async (res: Response) =>
  (
    (await res.json()) as {
      error: { codigo: string; mensaje: string; detalles?: { campo: string; hasta?: string }[] }
    }
  ).error

type Venta = {
  id: string
  total: number
  kg: number | null
  animales: { id: string; kg: number | null; importe: number }[]
  factura: { id: string; numero: string } | null
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

const ruta = (explotacion = a) => `/explotaciones/${explotacion}/ventas`
const crotal = () => `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`
const unico = () => Math.random().toString(36).slice(2, 10)

const nuevoTernero = (explotacionId = a, usuarioId = admin.id) =>
  enExplotacion({ explotacionId, usuarioId }, async (tx) => {
    const [animal] = await tx
      .insert(animales)
      .values({
        crotal: crotal(),
        raza: 'Rubia Gallega',
        sexo: 'macho',
        fechaNacimiento: '2025-11-01',
      })
      .returning({ id: animales.id })
    return animal?.id ?? ''
  })

const ficha = (animalId: string) =>
  enExplotacion({ explotacionId: a, usuarioId: admin.id }, async (tx) => {
    const [animal] = await tx.select().from(animales).where(eq(animales.id, animalId))
    const pesadas = await tx.select().from(pesos).where(eq(pesos.animalId, animalId))
    return { animal, pesadas }
  })

const venta = (animalIds: string[], datos: object = {}) => ({
  fecha: '2026-10-20',
  comprador: 'Carnes Galegas',
  modoPrecio: 'total',
  precio: 1000,
  animales: animalIds.map((animalId) => ({ animalId })),
  ...datos,
})

const emitida = async () =>
  (await (
    await pedir('POST', `/explotaciones/${a}/facturas`, admin.cookie, {
      tipo: 'emitida',
      numero: `V-${unico()}`,
      fecha: '2026-10-20',
      tercero: 'Carnes Galegas',
      nif: '12345678Z',
      concepto: 'Venta de terneros',
      impuesto: 'compensacion',
      lineas: [{ base: 1000, porcentaje: 10.5, cuota: 105 }],
      total: 1105,
    })
  ).json()) as { id: string; numero: string; ventaId: string | null }

beforeAll(async () => {
  a = (await nuevaExplotacion('A ventas')).id
  b = (await nuevaExplotacion('B ventas')).id
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

describe('precio de la venta', () => {
  it('se reparte el total, se multiplica por animal o por kg, y los céntimos cuadran', () => {
    expect(calcularImportes('total', 1000, [null, null, null])).toEqual({
      importes: [333.34, 333.33, 333.33],
      total: 1000,
    })
    expect(calcularImportes('por_animal', 450.5, [null, null])).toEqual({
      importes: [450.5, 450.5],
      total: 901,
    })
    expect(calcularImportes('por_kg', 4.125, [230.5, 251])).toEqual({
      importes: [950.81, 1035.38],
      total: 1986.19,
    })
  })
})

describe('ventas de animales', () => {
  it('al registrarla, los animales pasan a vendidos y su pesada de venta queda en la ficha', async () => {
    const [t1, t2] = [await nuevoTernero(), await nuevoTernero()]
    const res = await pedir(
      'POST',
      ruta(),
      admin.cookie,
      venta([], {
        modoPrecio: 'por_kg',
        precio: 4.125,
        animales: [
          { animalId: t1, kg: 230.5 },
          { animalId: t2, kg: 251 },
        ],
        observaciones: 'Con transporte',
      }),
    )
    expect(res.status).toBe(201)
    const v = (await res.json()) as Venta
    expect(v).toMatchObject({ total: 1986.19, kg: 481.5, factura: null })
    expect(v.animales.map((x) => x.importe)).toEqual([950.81, 1035.38])

    const { animal, pesadas } = await ficha(t1)
    expect(animal).toMatchObject({
      estado: 'vendido',
      tipoBaja: 'venta',
      fechaBaja: '2026-10-20',
      causaBaja: 'Venta a Carnes Galegas',
    })
    expect(pesadas).toMatchObject([{ momento: 'venta', kg: 230.5, fecha: '2026-10-20' }])
    // No se vende dos veces, ni se deshace la baja desde la ficha
    const otra = await pedir('POST', ruta(), admin.cookie, venta([t1]))
    expect((await error(otra)).detalles?.[0]?.campo).toBe('animales.0.animalId')
    expect(
      (await pedir('DELETE', `/explotaciones/${a}/animales/${t1}/baja`, admin.cookie)).status,
    ).toBe(409)
  })

  it('se bloquea, sin excepciones, si algún animal tiene la supresión en curso', async () => {
    const [sano, tratado] = [await nuevoTernero(), await nuevoTernero()]
    await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.insert(tratamientos).values({
        animalId: tratado,
        fecha: '2026-10-15',
        producto: 'Oxitetraciclina',
        motivo: 'enfermedad',
        // Termina el 12/11/2026 (fecha + días, columna generada)
        diasSupresion: 28,
      }),
    )
    const res = await pedir('POST', ruta(), admin.cookie, venta([sano, tratado]))
    expect(res.status).toBe(409)
    const e = await error(res)
    expect(e.codigo).toBe('supresion_en_curso')
    expect(e.mensaje).toContain('12/11/2026')
    expect(e.detalles).toMatchObject([{ campo: 'animales.1.animalId', hasta: '2026-11-12' }])
    // Nada cambia: ni el sano se vende
    expect((await ficha(sano)).animal?.estado).toBe('activo')
    // Sin el tratado, sí
    expect((await pedir('POST', ruta(), admin.cookie, venta([sano]))).status).toBe(201)
  })

  it('valida el precio por kg, la fecha y los animales repetidos', async () => {
    const t = await nuevoTernero()
    const campos = async (datos: object) =>
      (await error(await pedir('POST', ruta(), admin.cookie, venta([t], datos)))).detalles?.map(
        (d) => d.campo,
      )
    expect(await campos({ modoPrecio: 'por_kg' })).toContain('animales.0.kg')
    expect(await campos({ fecha: '2099-01-01' })).toContain('fecha')
    expect(await campos({ fecha: '2025-01-01' })).toContain('fecha')
    expect(await campos({ precio: 0 })).toContain('precio')
    expect(await campos({ comprador: ' ' })).toContain('comprador')
    expect(await campos({ animales: [{ animalId: t }, { animalId: t }] })).toContain(
      'animales.1.animalId',
    )
  })

  it('se asocia la factura emitida, una por venta; al borrar la factura, la venta se queda sin ella', async () => {
    const t = await nuevoTernero()
    const f = await emitida()
    const v = (await (
      await pedir('POST', ruta(), admin.cookie, venta([t], { facturaId: f.id }))
    ).json()) as Venta
    expect(v.factura).toMatchObject({ id: f.id, numero: f.numero })
    const vista = (await (
      await pedir('GET', `/explotaciones/${a}/facturas/${f.id}`, admin.cookie)
    ).json()) as {
      ventaId: string
    }
    expect(vista.ventaId).toBe(v.id)

    // La misma factura no es de otra venta
    const otra = (await (
      await pedir('POST', ruta(), admin.cookie, venta([await nuevoTernero()]))
    ).json()) as Venta
    const repetida = await pedir('PATCH', `${ruta()}/${otra.id}/factura`, admin.cookie, {
      facturaId: f.id,
    })
    expect(repetida.status).toBe(409)
    // Ni una recibida
    const recibida = (await (
      await pedir('POST', `/explotaciones/${a}/facturas`, admin.cookie, {
        tipo: 'recibida',
        numero: `R-${unico()}`,
        fecha: '2026-10-20',
        tercero: 'Piensos',
        nif: 'B15000003',
        concepto: 'Pienso',
        lineas: [{ base: 10, porcentaje: 10, cuota: 1 }],
        total: 11,
      })
    ).json()) as { id: string }
    expect(
      (
        await error(
          await pedir('PATCH', `${ruta()}/${otra.id}/factura`, admin.cookie, {
            facturaId: recibida.id,
          }),
        )
      ).detalles?.[0]?.campo,
    ).toBe('facturaId')

    await pedir('DELETE', `/explotaciones/${a}/facturas/${f.id}`, admin.cookie)
    const sinFactura = (await (
      await pedir('GET', `${ruta()}/${v.id}`, admin.cookie)
    ).json()) as Venta
    expect(sinFactura.factura).toBeNull()
  })

  it('se corrige (también los animales) y se deshace: vuelven a estar activos, sin la pesada', async () => {
    const [t1, t2] = [await nuevoTernero(), await nuevoTernero()]
    const v = (await (
      await pedir(
        'POST',
        ruta(),
        admin.cookie,
        venta([], { animales: [{ animalId: t1, kg: 240 }] }),
      )
    ).json()) as Venta
    const corregida = await pedir(
      'PUT',
      `${ruta()}/${v.id}`,
      admin.cookie,
      venta([], {
        modoPrecio: 'por_animal',
        precio: 900,
        animales: [{ animalId: t2, kg: 255 }],
      }),
    )
    expect(corregida.status).toBe(200)
    expect(((await corregida.json()) as Venta).total).toBe(900)
    expect(await ficha(t1)).toMatchObject({
      animal: { estado: 'activo', tipoBaja: null },
      pesadas: [],
    })
    expect((await ficha(t2)).animal?.estado).toBe('vendido')

    const lista = async (filtros: string) =>
      ((await (await pedir('GET', `${ruta()}?${filtros}`, admin.cookie)).json()) as Venta[]).map(
        (x) => x.id,
      )
    expect(await lista('q=galegas&factura=sin')).toContain(v.id)
    expect(await lista('factura=con')).not.toContain(v.id)

    expect((await pedir('DELETE', `${ruta()}/${v.id}`, admin.cookie)).status).toBe(204)
    expect(await ficha(t2)).toMatchObject({
      animal: { estado: 'activo', tipoBaja: null, fechaBaja: null },
      pesadas: [],
    })
    expect((await pedir('GET', `${ruta()}/${v.id}`, admin.cookie)).status).toBe(404)
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, v.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'cambio', 'borrado'])
  })

  it('solo el administrador; otra explotación no ve ni vende sus animales', async () => {
    const t = await nuevoTernero()
    expect((await pedir('POST', ruta(), empleado.cookie, venta([t]))).status).toBe(403)
    expect((await pedir('GET', ruta(), empleado.cookie)).status).toBe(403)
    const v = (await (await pedir('POST', ruta(), admin.cookie, venta([t]))).json()) as Venta
    expect((await pedir('GET', `${ruta(b)}/${v.id}`, deB.cookie)).status).toBe(404)
    expect((await pedir('DELETE', `${ruta(b)}/${v.id}`, deB.cookie)).status).toBe(404)
    const deOtra = await nuevoTernero(b, deB.id)
    expect(
      (await error(await pedir('POST', ruta(), admin.cookie, venta([deOtra])))).detalles?.[0]
        ?.campo,
    ).toBe('animales.0.animalId')
    const cambiadas = await enExplotacion({ explotacionId: b, usuarioId: deB.id }, (tx) =>
      tx.update(ventas).set({ comprador: 'otro' }).where(eq(ventas.id, v.id)).returning(),
    )
    expect(cambiadas).toHaveLength(0)
  })
})
