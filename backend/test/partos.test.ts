import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { animales, historialCambios, partos } from '../src/db/schema/index.js'
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

type Ternero = { id: string; crotal: string | null; sexo: string; estado: string }
type Parto = {
  id: string
  tipo: string
  padre: { id: string } | null
  padreTexto: string | null
  terneros: Ternero[]
  anulacion: { motivo: string } | null
}
type Animal = {
  id: string
  crotal: string | null
  madreId: string | null
  padreId: string | null
  padreTexto: string | null
  estado: string
  tipoBaja: string | null
  fechaNacimiento: string
  partoId: string | null
  gestacion: unknown
}

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }
let toro = ''

const animal = async (cambios: object = {}) => {
  const res = await pedir('POST', `/explotaciones/${a}/animales`, ana.cookie, {
    crotal: crotal(),
    raza: 'Rubia Gallega',
    sexo: 'hembra',
    fechaNacimiento: '2020-01-01',
    ...cambios,
  })
  return (await res.json()) as Animal
}

const ficha = async (id: string) =>
  (await (await pedir('GET', `/explotaciones/${a}/animales/${id}`, ana.cookie)).json()) as Animal

const parir = (madreId: string, datos: object, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/animales/${madreId}/partos`, cookie, {
    fecha: '2026-09-01',
    terneros: [{ sexo: 'macho', raza: 'Rubia Gallega' }],
    ...datos,
  })

const anular = (id: string, motivo: string, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/partos/${id}/anulacion`, cookie, { motivo })

beforeAll(async () => {
  a = (await nuevaExplotacion('A de partos')).id
  b = (await nuevaExplotacion('B de partos')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'empleado')
  ana = { id: u.id, cookie: await iniciarSesion(app, u) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  carla = { id: v.id, cookie: await iniciarSesion(app, v) }
  toro = (await animal({ sexo: 'macho', fechaNacimiento: '2018-01-01' })).id
})

afterAll(async () => {
  await pool.end()
})

describe('partos', () => {
  it('registra gemelos con el padre de la cubrición y cierra la gestación', async () => {
    const vaca = await animal()
    await pedir('POST', `/explotaciones/${a}/reproduccion`, ana.cookie, {
      animalIds: [vaca.id],
      tipo: 'cubricion',
      fecha: '2025-11-20',
      padreId: toro,
    })
    expect((await ficha(vaca.id)).gestacion).not.toBeNull()

    const c = crotal()
    const res = await parir(vaca.id, {
      tipo: 'con_ayuda',
      terneros: [
        { crotal: c, sexo: 'hembra', raza: 'Rubia Gallega', peso: 38.24 },
        { sexo: 'macho', raza: 'Rubia Gallega', estado: 'muerto' },
      ],
    })
    expect(res.status).toBe(201)
    const parto = (await res.json()) as Parto
    expect(parto).toMatchObject({ tipo: 'con_ayuda', padre: { id: toro } })
    expect(parto.terneros.map((t) => [t.crotal, t.sexo, t.estado])).toEqual([
      [c, 'hembra', 'activo'],
      [null, 'macho', 'muerto'],
    ])

    const [viva, muerto] = await Promise.all(parto.terneros.map((t) => ficha(t.id)))
    expect(viva).toMatchObject({
      madreId: vaca.id,
      padreId: toro,
      fechaNacimiento: '2026-09-01',
      partoId: parto.id,
    })
    expect(muerto).toMatchObject({ estado: 'muerto', tipoBaja: 'muerte' })
    const pesadas = (await (
      await pedir('GET', `/explotaciones/${a}/animales/${viva?.id}/pesos`, ana.cookie)
    ).json()) as { kg: number; momento: string }[]
    expect(pesadas).toEqual([expect.objectContaining({ kg: 38.2, momento: 'nacimiento' })])

    expect((await ficha(vaca.id)).gestacion).toBeNull()
    const lista = (await (
      await pedir('GET', `/explotaciones/${a}/animales/${vaca.id}/partos`, ana.cookie)
    ).json()) as Parto[]
    expect(lista.map((p) => p.id)).toEqual([parto.id])
  })

  it('sin gestación, toma el padre indicado', async () => {
    const vaca = await animal()
    const parto = (await (await parir(vaca.id, { padreTexto: 'Toro del vecino' })).json()) as Parto
    expect(parto.padreTexto).toBe('Toro del vecino')
    expect((await ficha(parto.terneros[0]?.id ?? '')).padreTexto).toBe('Toro del vecino')
  })

  it('el crotal se pone después, y no se puede quitar', async () => {
    const vaca = await animal()
    const parto = (await (await parir(vaca.id, {})).json()) as Parto
    const id = parto.terneros[0]?.id ?? ''
    const sinCrotal = async () =>
      (
        (await (
          await pedir('GET', `/explotaciones/${a}/animales?crotal=sin`, ana.cookie)
        ).json()) as Animal[]
      ).map((x) => x.id)
    expect(await sinCrotal()).toContain(id)
    expect(await sinCrotal()).not.toContain(vaca.id)
    const c = crotal()
    const res = await pedir('PATCH', `/explotaciones/${a}/animales/${id}`, ana.cookie, {
      crotal: c,
    })
    expect(((await res.json()) as Animal).crotal).toBe(c)
    expect(await sinCrotal()).not.toContain(id)
    const quitar = await pedir('PATCH', `/explotaciones/${a}/animales/${id}`, ana.cookie, {
      crotal: '',
    })
    expect(await campos(quitar)).toEqual(['crotal'])
  })

  it('valida la madre, la fecha y los terneros', async () => {
    const vaca = await animal()
    const c = crotal()
    await animal({ crotal: c })
    expect(await campos(await parir(toro, {}))).toEqual(['madreId'])
    expect(await campos(await parir(vaca.id, { fecha: '2999-01-01' }))).toContain('fecha')
    expect(await campos(await parir(vaca.id, { fecha: '2019-06-01' }))).toContain('fecha')
    expect(await campos(await parir(vaca.id, { terneros: [] }))).toContain('terneros')
    expect(
      await campos(await parir(vaca.id, { terneros: [{ sexo: 'macho', raza: ' ' }] })),
    ).toContain('terneros.0.raza')
    const repetido = await parir(vaca.id, {
      terneros: [
        { sexo: 'macho', raza: 'Limusina' },
        { crotal: c, sexo: 'hembra', raza: 'Limusina' },
      ],
    })
    expect(repetido.status).toBe(409)
    expect(await campos(repetido)).toEqual(['terneros.1.crotal'])
    // Todo o nada: ni el parto ni el primer ternero
    const lista = await (
      await pedir('GET', `/explotaciones/${a}/animales/${vaca.id}/partos`, ana.cookie)
    ).json()
    expect(lista).toEqual([])
  })

  it('anula el parto y borra las fichas de sus terneros', async () => {
    const vaca = await animal()
    const parto = (await (
      await parir(vaca.id, { terneros: [{ sexo: 'macho', raza: 'Limusina', peso: 40 }] })
    ).json()) as Parto
    const ternero = parto.terneros[0]?.id ?? ''
    const res = await anular(parto.id, 'Registrado en la vaca equivocada')
    expect(res.status).toBe(200)
    expect(((await res.json()) as Parto).anulacion?.motivo).toBe('Registrado en la vaca equivocada')
    expect((await pedir('GET', `/explotaciones/${a}/animales/${ternero}`, ana.cookie)).status).toBe(
      404,
    )
    expect(await codigo(await anular(parto.id, 'Otra vez'))).toBe('ya_anulado')

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, ternero)),
    )
    expect(cambios.map((c) => c.operacion).sort()).toEqual(['alta', 'borrado'])
  })

  it('no anula el parto si un ternero ya tiene otros datos', async () => {
    const vaca = await animal()
    const parto = (await (await parir(vaca.id, {})).json()) as Parto
    const ternero = parto.terneros[0]
    await pedir('POST', `/explotaciones/${a}/animales/${ternero?.id}/pesos`, ana.cookie, {
      fecha: '2026-10-01',
      kg: 80,
    })
    const res = await anular(parto.id, 'Error')
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('terneros_con_datos')
  })

  it('otra explotación no ve ni anula los partos', async () => {
    const vaca = await animal()
    const parto = (await (await parir(vaca.id, {})).json()) as Parto
    expect(
      (await pedir('GET', `/explotaciones/${b}/animales/${vaca.id}/partos`, carla.cookie)).status,
    ).toBe(404)
    expect(await codigo(await anular(parto.id, 'Desde B', b, carla.cookie))).toBe(
      'parto_no_encontrado',
    )
  })
})

describe('restricciones de la base de datos', () => {
  const comoAna = <T>(fn: Parameters<typeof enExplotacion<T>>[1]) =>
    enExplotacion({ explotacionId: a, usuarioId: ana.id }, fn)

  it('madre hembra, padre macho, fecha en su vida, y no se corrige ni se borra', async () => {
    const vaca = await animal()
    const insertar = (cambios: Partial<typeof partos.$inferInsert>) =>
      comoAna((tx) =>
        tx.insert(partos).values({ madreId: vaca.id, fecha: '2026-05-01', ...cambios }),
      )
    await expect(insertar({ madreId: toro })).rejects.toMatchObject({
      cause: { constraint: 'partos_madre_hembra' },
    })
    await expect(insertar({ padreId: vaca.id })).rejects.toMatchObject({
      cause: { constraint: 'partos_padre_macho' },
    })
    await expect(insertar({ fecha: '2019-12-31' })).rejects.toMatchObject({
      cause: { constraint: 'partos_fecha_en_vida' },
    })
    const parto = (await (await parir(vaca.id, {})).json()) as Parto
    await expect(
      comoAna((tx) => tx.update(partos).set({ tipo: 'cesarea' }).where(eq(partos.id, parto.id))),
    ).rejects.toMatchObject({ cause: { constraint: 'partos_inmutable' } })
    // Sus terneros lo sujetan, y aun sin ellos, un parto no se borra
    await expect(
      comoAna((tx) => tx.delete(partos).where(eq(partos.id, parto.id))),
    ).rejects.toMatchObject({ cause: { constraint: 'partos_inmutable' } })
    // Un ternero de otra explotación no puede apuntar a este parto
    const deB = await enExplotacion({ explotacionId: b, usuarioId: carla.id }, (tx) =>
      tx
        .insert(animales)
        .values({
          raza: 'Limusina',
          sexo: 'macho',
          fechaNacimiento: '2026-05-01',
          partoId: parto.id,
        })
        .returning(),
    ).catch((e: { cause?: { code?: string } }) => e.cause?.code)
    expect(deB).toBe('23503')
  })
})
