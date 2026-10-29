import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { configuracionFiscal, historialCambios } from '../src/db/schema/index.js'
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

type Fiscal = {
  regimen: string
  compensacionReagp: number
  tiposIva: number[]
  configurado: boolean
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

const ruta = (explotacion = a) => `/explotaciones/${explotacion}/fiscal`

beforeAll(async () => {
  a = (await nuevaExplotacion('A fiscal')).id
  b = (await nuevaExplotacion('B fiscal')).id
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

describe('régimen fiscal', () => {
  it('sin configurar, REAGP con el 10,5 % y los tipos de IVA 21, 10 y 4 %', async () => {
    const res = await pedir('GET', ruta(), admin.cookie)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      regimen: 'reagp',
      compensacionReagp: 10.5,
      tiposIva: [21, 10, 4],
      configurado: false,
    })
  })

  it('el administrador lo cambia; queda guardado y en el historial', async () => {
    const res = await pedir('PUT', ruta(), admin.cookie, {
      regimen: 'general',
      compensacionReagp: 12,
      tiposIva: [10, 21, 5.5, 10],
    })
    expect(res.status).toBe(200)
    // Sin repetir, de mayor a menor
    expect(await res.json()).toMatchObject({
      regimen: 'general',
      compensacionReagp: 12,
      tiposIva: [21, 10, 5.5],
      configurado: true,
    })
    expect(((await (await pedir('GET', ruta(), admin.cookie)).json()) as Fiscal).regimen).toBe(
      'general',
    )
    // Una segunda vez cambia la misma fila
    await pedir('PUT', ruta(), admin.cookie, {
      regimen: 'reagp',
      compensacionReagp: 10.5,
      tiposIva: [21, 10, 4],
    })
    const filas = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(configuracionFiscal),
    )
    expect(filas).toHaveLength(1)
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, filas[0]?.id ?? '')),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'cambio'])
  })

  it('valida los porcentajes y los tipos de IVA', async () => {
    const guardar = (datos: object) =>
      pedir('PUT', ruta(), admin.cookie, {
        regimen: 'reagp',
        compensacionReagp: 10.5,
        tiposIva: [21],
        ...datos,
      })
    expect(await campos(await guardar({ regimen: 'modulos' }))).toContain('regimen')
    expect(await campos(await guardar({ compensacionReagp: 120 }))).toContain('compensacionReagp')
    expect(await campos(await guardar({ tiposIva: [] }))).toContain('tiposIva')
    expect(await campos(await guardar({ tiposIva: [-1] }))).toContain('tiposIva.0')
  })

  it('solo el administrador lo ve y lo cambia; cada explotación, el suyo', async () => {
    expect((await pedir('GET', ruta(), empleado.cookie)).status).toBe(403)
    expect(
      (
        await pedir('PUT', ruta(), empleado.cookie, {
          regimen: 'general',
          compensacionReagp: 0,
          tiposIva: [21],
        })
      ).status,
    ).toBe(403)
    expect((await pedir('GET', ruta(), deB.cookie)).status).toBe(404)
    expect(((await (await pedir('GET', ruta(b), deB.cookie)).json()) as Fiscal).configurado).toBe(
      false,
    )
  })
})
