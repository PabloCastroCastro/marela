import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { historialCambios, pastoreos } from '../src/db/schema/index.js'
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

type Pastoreo = {
  id: string
  fincaId: string
  fechaEntrada: string
  fechaSalida: string | null
  animales: number
}

type Finca = { id: string; pastoreo: { id: string; desde: string; animales: number } | null }

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }

const finca = async (explotacion = a, cookie = ana.cookie) => {
  const res = await pedir('POST', `/explotaciones/${explotacion}/fincas`, cookie, {
    nombre: `Finca ${randomInt(1e9)}`,
    parcelas: [{ referenciaCatastral: `X${randomInt(1e9)}`, superficie: 2 }],
  })
  return ((await res.json()) as { id: string }).id
}

const entrar = (fincaId: string, datos: object = {}, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/pastoreos`, cookie, {
    fincaId,
    fechaEntrada: '2026-06-01',
    animales: 12,
    ...datos,
  })

const salir = (id: string, fechaSalida: string) =>
  pedir('PATCH', `/explotaciones/${a}/pastoreos/${id}/salida`, ana.cookie, { fechaSalida })

const ficha = async (fincaId: string) =>
  (await (await pedir('GET', `/explotaciones/${a}/fincas/${fincaId}`, ana.cookie)).json()) as Finca

const deLaFinca = async (fincaId: string) =>
  (await (
    await pedir('GET', `/explotaciones/${a}/fincas/${fincaId}/pastoreos`, ana.cookie)
  ).json()) as Pastoreo[]

beforeAll(async () => {
  a = (await nuevaExplotacion('A de pastoreos')).id
  b = (await nuevaExplotacion('B de pastoreos')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'empleado')
  ana = { id: u.id, cookie: await iniciarSesion(app, u) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  carla = { id: v.id, cookie: await iniciarSesion(app, v) }
})

afterAll(async () => {
  await pool.end()
})

describe('pastoreos', () => {
  it('registra la entrada, la muestra en la finca y registra la salida', async () => {
    const x = await finca()
    const res = await entrar(x, { observaciones: 'Vacas con crías' })
    expect(res.status).toBe(201)
    const p = (await res.json()) as Pastoreo
    expect(p).toMatchObject({ fechaSalida: null, animales: 12 })
    expect((await ficha(x)).pastoreo).toEqual({ id: p.id, desde: '2026-06-01', animales: 12 })
    const enCurso = await pedir('GET', `/explotaciones/${a}/fincas?pastoreo=en_curso`, ana.cookie)
    expect(((await enCurso.json()) as Finca[]).map((f) => f.id)).toContain(x)

    expect(await campos(await salir(p.id, '2026-05-01'))).toEqual(['fechaSalida'])
    expect(await campos(await salir(p.id, '2999-01-01'))).toEqual(['fechaSalida'])
    expect(await (await salir(p.id, '2026-06-20')).json()).toMatchObject({
      fechaSalida: '2026-06-20',
    })
    expect(await codigo(await salir(p.id, '2026-06-21'))).toBe('ya_salieron')
    expect((await ficha(x)).pastoreo).toBeNull()
  })

  it('no admite dos pastoreos en curso en la misma finca', async () => {
    const x = await finca()
    await entrar(x)
    const res = await entrar(x, { fechaEntrada: '2026-07-01' })
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('pastoreo_en_curso')
    // Uno que ya terminó, sí
    expect(
      (await entrar(x, { fechaEntrada: '2026-03-01', fechaSalida: '2026-03-10' })).status,
    ).toBe(201)
    const lista = await deLaFinca(x)
    expect(lista.map((p) => p.fechaSalida)).toEqual([null, '2026-03-10'])
  })

  it('valida las fechas y el número de animales', async () => {
    const x = await finca()
    expect(await campos(await entrar(x, { animales: 0 }))).toEqual(['animales'])
    expect(await campos(await entrar(x, { animales: 1.5 }))).toEqual(['animales'])
    expect(await campos(await entrar(x, { fechaEntrada: '2999-01-01' }))).toEqual(['fechaEntrada'])
    expect(await campos(await entrar(x, { fechaSalida: '2026-05-01' }))).toEqual(['fechaSalida'])
    expect(await deLaFinca(x)).toEqual([])
  })

  it('no registra en fincas desactivadas ni de otra explotación', async () => {
    const x = await finca()
    await pedir('PATCH', `/explotaciones/${a}/fincas/${x}/estado`, ana.cookie, { activa: false })
    expect(await campos(await entrar(x))).toEqual(['fincaId'])
    const deB = await finca(b, carla.cookie)
    expect(await campos(await entrar(deB))).toEqual(['fincaId'])
  })

  it('corrige y borra un pastoreo, y queda en el historial', async () => {
    const x = await finca()
    const p = (await (await entrar(x)).json()) as Pastoreo
    const otro = (await (
      await entrar(x, { fechaEntrada: '2026-04-01', fechaSalida: '2026-04-15' })
    ).json()) as Pastoreo
    // Reabrir el antiguo dejaría dos en curso
    const reabrir = await pedir('PUT', `/explotaciones/${a}/pastoreos/${otro.id}`, ana.cookie, {
      fechaEntrada: '2026-04-01',
      animales: 12,
    })
    expect(await codigo(reabrir)).toBe('pastoreo_en_curso')
    const res = await pedir('PUT', `/explotaciones/${a}/pastoreos/${p.id}`, ana.cookie, {
      fechaEntrada: '2026-06-02',
      animales: 15,
    })
    expect(await res.json()).toMatchObject({ fechaEntrada: '2026-06-02', animales: 15 })
    const borrado = await pedir('DELETE', `/explotaciones/${a}/pastoreos/${p.id}`, ana.cookie)
    expect(await borrado.json()).toMatchObject({ id: p.id, animales: 15 })
    expect((await ficha(x)).pastoreo).toBeNull()
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, p.id)),
    )
    expect(cambios.map((c) => c.operacion).sort()).toEqual(['alta', 'borrado', 'cambio'])
  })

  it('otra explotación no ve ni toca los pastoreos', async () => {
    const x = await finca()
    const p = (await (await entrar(x)).json()) as Pastoreo
    expect(
      (await pedir('GET', `/explotaciones/${b}/fincas/${x}/pastoreos`, carla.cookie)).status,
    ).toBe(404)
    expect(
      (await pedir('DELETE', `/explotaciones/${b}/pastoreos/${p.id}`, carla.cookie)).status,
    ).toBe(404)
  })
})

describe('restricciones de la base de datos', () => {
  it('un solo pastoreo en curso por finca, fechas en orden y animales', async () => {
    const x = await finca()
    const insertar = (valores: Partial<typeof pastoreos.$inferInsert> = {}) =>
      enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
        tx
          .insert(pastoreos)
          .values({ fincaId: x, fechaEntrada: hoyEnMadrid(), animales: 5, ...valores }),
      )
    await insertar()
    await expect(insertar()).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'pastoreos_en_curso_unico' },
    })
    await expect(
      insertar({ fechaEntrada: '2026-05-10', fechaSalida: '2026-05-01' }),
    ).rejects.toMatchObject({ cause: { constraint: 'pastoreos_fechas' } })
    await expect(
      insertar({ fechaEntrada: '2026-05-01', fechaSalida: '2026-05-10', animales: 0 }),
    ).rejects.toMatchObject({ cause: { constraint: 'pastoreos_animales' } })
  })
})
