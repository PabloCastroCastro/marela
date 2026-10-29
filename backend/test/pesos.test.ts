import { randomInt, randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { historialCambios, pesos } from '../src/db/schema/index.js'
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

const crotal = () =>
  `ES${String(randomInt(1e6)).padStart(6, '0')}${String(randomInt(1e6)).padStart(6, '0')}`

type Pesada = { id: string; fecha: string; kg: number; momento: string }

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }

// Un ternero nacido el 1 de febrero de 2026 en la explotación A
const ternero = async (cambios: object = {}) => {
  const res = await pedir('POST', `/explotaciones/${a}/animales`, ana.cookie, {
    crotal: crotal(),
    raza: 'Rubia Gallega',
    sexo: 'macho',
    fechaNacimiento: '2026-02-01',
    ...cambios,
  })
  return ((await res.json()) as { id: string }).id
}

const rutaPesos = (animalId: string, explotacion = a) =>
  `/explotaciones/${explotacion}/animales/${animalId}/pesos`

const pesar = async (animalId: string, datos: object) =>
  pedir('POST', rutaPesos(animalId), ana.cookie, datos)

beforeAll(async () => {
  a = (await nuevaExplotacion('A de pesos')).id
  b = (await nuevaExplotacion('B de pesos')).id
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

describe('pesadas', () => {
  it('registra pesadas y las lista de la más antigua a la más reciente', async () => {
    const animal = await ternero()
    const nacer = await pesar(animal, { fecha: '2026-02-01', kg: 42, momento: 'nacimiento' })
    expect(nacer.status).toBe(201)
    expect(await nacer.json()).toMatchObject({ kg: 42, momento: 'nacimiento', animalId: animal })
    await pesar(animal, { fecha: '2026-06-01', kg: 180.46 })
    await pesar(animal, { fecha: '2026-04-01', kg: 110 })

    const lista = (await (await pedir('GET', rutaPesos(animal), ana.cookie)).json()) as Pesada[]
    expect(lista.map((p) => [p.fecha, p.kg, p.momento])).toEqual([
      ['2026-02-01', 42, 'nacimiento'],
      ['2026-04-01', 110, 'otro'],
      ['2026-06-01', 180.5, 'otro'],
    ])
  })

  it('valida el peso, la fecha y que el momento no se repita', async () => {
    const animal = await ternero()
    expect(await campos(await pesar(animal, { fecha: '2026-03-01', kg: 0 }))).toContain('kg')
    expect(await campos(await pesar(animal, { fecha: '2026-03-01', kg: 2500 }))).toContain('kg')
    expect(await campos(await pesar(animal, { fecha: '2999-01-01', kg: 90 }))).toContain('fecha')
    expect(await campos(await pesar(animal, { fecha: '2026-01-15', kg: 90 }))).toContain('fecha')

    await pesar(animal, { fecha: '2026-07-01', kg: 220, momento: 'destete' })
    const otraVez = await pesar(animal, { fecha: '2026-07-02', kg: 221, momento: 'destete' })
    expect(otraVez.status).toBe(409)
    expect(await codigo(otraVez)).toBe('momento_repetido')
  })

  it('no admite pesadas después de la baja del animal', async () => {
    const animal = await ternero()
    await pedir('POST', `/explotaciones/${a}/animales/${animal}/baja`, ana.cookie, {
      tipo: 'muerte',
      fecha: '2026-05-01',
    })
    expect(await campos(await pesar(animal, { fecha: '2026-06-01', kg: 150 }))).toContain('fecha')
    expect((await pesar(animal, { fecha: '2026-04-01', kg: 120 })).status).toBe(201)
  })

  it('corrige y borra una pesada, y queda en el historial', async () => {
    const animal = await ternero()
    const p = (await (await pesar(animal, { fecha: '2026-03-01', kg: 70 })).json()) as Pesada
    const corregida = await pedir('PUT', `${rutaPesos(animal)}/${p.id}`, ana.cookie, {
      fecha: '2026-03-02',
      kg: 77,
      momento: 'otro',
    })
    expect(corregida.status).toBe(200)
    expect(await corregida.json()).toMatchObject({ fecha: '2026-03-02', kg: 77 })

    const borrada = await pedir('DELETE', `${rutaPesos(animal)}/${p.id}`, ana.cookie)
    expect(borrada.status).toBe(200)
    expect(await borrada.json()).toMatchObject({ id: p.id, kg: 77 })
    expect(await (await pedir('GET', rutaPesos(animal), ana.cookie)).json()).toEqual([])

    const historial = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, p.id))
        .orderBy(historialCambios.fecha),
    )
    expect(historial.map((h) => [h.tabla, h.operacion, h.usuarioId])).toEqual([
      ['pesos', 'alta', ana.id],
      ['pesos', 'cambio', ana.id],
      ['pesos', 'borrado', ana.id],
    ])

    const otraVez = await pedir('DELETE', `${rutaPesos(animal)}/${p.id}`, ana.cookie)
    expect(await codigo(otraVez)).toBe('pesada_no_encontrada')
  })

  it('con el id del dispositivo, reenviarla no la duplica (sin conexión, GH-31)', async () => {
    const animal = await ternero()
    const id = randomUUID()
    const primera = await pesar(animal, { id, fecha: '2026-03-01', kg: 70 })
    expect(primera.status).toBe(201)
    expect(((await primera.json()) as Pesada).id).toBe(id)
    // El reenvío devuelve la misma, aunque llegue con otros datos
    const reenvio = await pesar(animal, { id, fecha: '2026-03-01', kg: 71 })
    expect(reenvio.status).toBe(201)
    expect(await reenvio.json()).toMatchObject({ id, kg: 70 })
    const lista = (await (await pedir('GET', rutaPesos(animal), ana.cookie)).json()) as Pesada[]
    expect(lista.filter((p) => p.id === id)).toHaveLength(1)

    // Con el id de una pesada de otro animal o de otra explotación, no
    const otro = await pesar(await ternero(), { id, fecha: '2026-03-01', kg: 70 })
    expect([otro.status, await codigo(otro)]).toEqual([409, 'id_en_uso'])
    const deB = await pedir('POST', `/explotaciones/${b}/animales`, carla.cookie, {
      crotal: crotal(),
      raza: 'Rubia Gallega',
      sexo: 'macho',
      fechaNacimiento: '2026-02-01',
    })
    const animalB = ((await deB.json()) as { id: string }).id
    const ajena = await pedir('POST', rutaPesos(animalB, b), carla.cookie, {
      id,
      fecha: '2026-03-01',
      kg: 70,
    })
    expect([ajena.status, await codigo(ajena)]).toEqual([409, 'id_en_uso'])
  })

  it('otra explotación no ve ni toca las pesadas', async () => {
    const animal = await ternero()
    const p = (await (await pesar(animal, { fecha: '2026-03-01', kg: 70 })).json()) as Pesada
    expect((await pedir('GET', rutaPesos(animal, b), carla.cookie)).status).toBe(404)
    expect((await pedir('DELETE', `${rutaPesos(animal, b)}/${p.id}`, carla.cookie)).status).toBe(
      404,
    )
    const vistas = await enExplotacion({ explotacionId: b, usuarioId: carla.id }, (tx) =>
      tx.select().from(pesos).where(eq(pesos.id, p.id)),
    )
    expect(vistas).toEqual([])
  })
})

describe('restricciones de la base de datos', () => {
  const insertar = (valores: Partial<typeof pesos.$inferInsert> & { animalId: string }) =>
    enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.insert(pesos).values({ fecha: '2026-03-01', kg: 80, ...valores }),
    )

  it('peso positivo, fecha en la vida del animal y un solo destete', async () => {
    const animal = await ternero()
    await expect(insertar({ animalId: animal, kg: -1 })).rejects.toMatchObject({
      cause: { constraint: 'pesos_kg' },
    })
    await expect(insertar({ animalId: animal, fecha: '2025-12-31' })).rejects.toMatchObject({
      cause: { constraint: 'pesos_fecha_en_vida' },
    })
    await insertar({ animalId: animal, momento: 'destete' })
    await expect(insertar({ animalId: animal, momento: 'destete' })).rejects.toMatchObject({
      cause: { code: '23505' },
    })
  })

  it('no se pesa en una explotación un animal de otra', async () => {
    const res = await pedir('POST', `/explotaciones/${b}/animales`, carla.cookie, {
      crotal: crotal(),
      raza: 'Limusina',
      sexo: 'hembra',
      fechaNacimiento: '2025-01-01',
    })
    const deB = ((await res.json()) as { id: string }).id
    await expect(insertar({ animalId: deB })).rejects.toMatchObject({ cause: { code: '23503' } })
  })
})
