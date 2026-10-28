import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { eventosReproductivos, historialCambios } from '../src/db/schema/index.js'
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

const error = async (res: Response) =>
  ((await res.json()) as { error: { detalles?: { campo: string; mensaje: string }[] } }).error
    .detalles ?? []

const campos = async (res: Response) => (await error(res)).map((d) => d.campo)

const crotal = () =>
  `ES${String(randomInt(1e6)).padStart(6, '0')}${String(randomInt(1e6)).padStart(6, '0')}`

type Evento = {
  id: string
  tipo: string
  fecha: string
  animal: { id: string; crotal: string }
  padre: { id: string } | null
  padreTexto: string | null
  fechaPrevistaParto: string | null
  anulacion: { motivo: string } | null
}

type Gestacion = { desde: string | null; fechaPrevistaParto: string | null; confirmada: boolean }
type Animal = { id: string; crotal: string; gestacion: Gestacion | null }

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }

// Un animal de la explotación A, hembra nacida en 2020 salvo que se diga otra cosa
const animal = async (cambios: object = {}, explotacion = a, cookie = ana.cookie) => {
  const res = await pedir('POST', `/explotaciones/${explotacion}/animales`, cookie, {
    crotal: crotal(),
    raza: 'Rubia Gallega',
    sexo: 'hembra',
    fechaNacimiento: '2020-01-01',
    ...cambios,
  })
  return (await res.json()) as Animal
}

const registrar = (animalIds: string[], datos: object, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/reproduccion`, cookie, { animalIds, ...datos })

const historial = async (animalId: string, explotacion = a, cookie = ana.cookie) =>
  pedir('GET', `/explotaciones/${explotacion}/animales/${animalId}/reproduccion`, cookie)

const ficha = async (animalId: string) =>
  (await (
    await pedir('GET', `/explotaciones/${a}/animales/${animalId}`, ana.cookie)
  ).json()) as Animal

const anular = (id: string, motivo: unknown, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/reproduccion/${id}/anulacion`, cookie, { motivo })

let toro = ''

beforeAll(async () => {
  a = (await nuevaExplotacion('A de reproducción')).id
  b = (await nuevaExplotacion('B de reproducción')).id
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

describe('eventos reproductivos', () => {
  it('cubre varias vacas con un toro y calcula la fecha prevista de parto', async () => {
    const [x, y] = [await animal(), await animal()]
    const res = await registrar([x.id, y.id], {
      tipo: 'cubricion',
      fecha: '2026-03-01',
      padreId: toro,
    })
    expect(res.status).toBe(201)
    const creados = (await res.json()) as Evento[]
    expect(creados).toHaveLength(2)
    // 1 de marzo más 283 días
    expect(creados[0]).toMatchObject({ padre: { id: toro }, fechaPrevistaParto: '2026-12-09' })
    expect((await ficha(x.id)).gestacion).toEqual({
      desde: '2026-03-01',
      fechaPrevistaParto: '2026-12-09',
      confirmada: false,
    })
  })

  it('insemina con una dosis externa y la confirma un diagnóstico positivo', async () => {
    const x = await animal()
    await registrar([x.id], { tipo: 'inseminacion', fecha: '2026-04-01', padreTexto: 'RG-1187' })
    await registrar([x.id], {
      tipo: 'diagnostico',
      fecha: '2026-05-15',
      metodo: 'ecografia',
      resultado: 'gestante',
    })
    expect((await ficha(x.id)).gestacion).toMatchObject({
      fechaPrevistaParto: '2027-01-09',
      confirmada: true,
    })
    const lista = (await (await historial(x.id)).json()) as Evento[]
    expect(lista.map((e) => e.tipo)).toEqual(['diagnostico', 'inseminacion'])
    expect(lista[1]?.padreTexto).toBe('RG-1187')
  })

  it('un diagnóstico negativo o un aborto anulan la fecha prevista de parto', async () => {
    const [x, y] = [await animal(), await animal()]
    await registrar([x.id, y.id], { tipo: 'cubricion', fecha: '2026-03-01', padreId: toro })
    await registrar([x.id], {
      tipo: 'diagnostico',
      fecha: '2026-04-15',
      metodo: 'palpacion',
      resultado: 'vacia',
    })
    await registrar([y.id], { tipo: 'aborto', fecha: '2026-06-01' })
    expect((await ficha(x.id)).gestacion).toBeNull()
    expect((await ficha(y.id)).gestacion).toBeNull()

    // Una cubrición posterior abre otra gestación
    await registrar([x.id], { tipo: 'cubricion', fecha: '2026-05-01', padreId: toro })
    expect((await ficha(x.id)).gestacion?.desde).toBe('2026-05-01')
  })

  it('filtra las gestantes por fecha prevista de parto', async () => {
    const [tarde, pronto, vacia] = [await animal(), await animal(), await animal()]
    await registrar([tarde.id], { tipo: 'cubricion', fecha: '2026-06-01', padreId: toro })
    await registrar([pronto.id], { tipo: 'cubricion', fecha: '2026-02-01', padreId: toro })
    const res = await pedir('GET', `/explotaciones/${a}/animales?gestacion=en_curso`, ana.cookie)
    const ids = ((await res.json()) as Animal[]).map((x) => x.id)
    expect(ids.indexOf(pronto.id)).toBeLessThan(ids.indexOf(tarde.id))
    expect(ids).not.toContain(vacia.id)
    expect(ids).not.toContain(toro)
  })

  it('solo hembras, con el padre indicado y un macho de la explotación', async () => {
    const x = await animal()
    const macho = await animal({ sexo: 'macho' })
    const cubrir = (ids: string[], datos: object = {}) =>
      registrar(ids, { tipo: 'cubricion', fecha: '2026-03-01', padreId: toro, ...datos })
    expect(await error(await cubrir([x.id, macho.id]))).toEqual([
      { campo: 'animalIds', mensaje: `Solo las hembras; no lo son ${macho.crotal}` },
    ])
    expect(await campos(await cubrir([x.id], { padreId: null }))).toContain('padreId')
    expect(await campos(await cubrir([x.id], { padreId: x.id }))).toContain('padreId')
    expect(await campos(await cubrir([x.id], { padreTexto: 'Otro' }))).toContain('padreTexto')
    expect(
      await campos(await registrar([x.id], { tipo: 'diagnostico', fecha: '2026-03-01' })),
    ).toEqual(expect.arrayContaining(['metodo', 'resultado']))
    expect(await campos(await cubrir([x.id], { fecha: '2999-01-01' }))).toContain('fecha')
    expect(await campos(await cubrir([x.id], { fecha: '2019-01-01' }))).toContain('fecha')
    // Nada se registra si falla un animal
    expect(await (await historial(x.id)).json()).toEqual([])
  })

  it('desteta un ternero con su peso, y sale en el historial de la madre', async () => {
    const madre = await animal()
    const ternero = await animal({
      sexo: 'macho',
      fechaNacimiento: '2026-02-01',
      madreId: madre.id,
    })
    const res = await registrar([ternero.id], {
      tipo: 'destete',
      fecha: '2026-08-01',
      pesoDestete: 231.44,
    })
    expect(res.status).toBe(201)
    const pesadas = (await (
      await pedir('GET', `/explotaciones/${a}/animales/${ternero.id}/pesos`, ana.cookie)
    ).json()) as { kg: number; momento: string }[]
    expect(pesadas).toEqual([expect.objectContaining({ kg: 231.4, momento: 'destete' })])

    const deLaMadre = (await (await historial(madre.id)).json()) as Evento[]
    expect(deLaMadre.map((e) => [e.tipo, e.animal.id])).toEqual([['destete', ternero.id]])

    const otraVez = await registrar([ternero.id], { tipo: 'destete', fecha: '2026-08-02' })
    expect(await error(otraVez)).toEqual([
      { campo: 'animalIds', mensaje: 'El animal ya está destetado' },
    ])
  })

  it('anula con motivo, una sola vez, deja de contar y queda en el historial', async () => {
    const x = await animal()
    const [e] = (await (
      await registrar([x.id], { tipo: 'cubricion', fecha: '2026-03-01', padreId: toro })
    ).json()) as Evento[]
    const id = e?.id ?? ''
    expect(await campos(await anular(id, ' '))).toContain('motivo')
    const res = await anular(id, 'Registrada en la vaca equivocada')
    expect(res.status).toBe(200)
    expect(((await res.json()) as Evento).anulacion?.motivo).toBe(
      'Registrada en la vaca equivocada',
    )
    expect(await codigo(await anular(id, 'Otra vez'))).toBe('ya_anulado')
    expect((await ficha(x.id)).gestacion).toBeNull()

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, id))
        .orderBy(historialCambios.fecha),
    )
    expect(cambios.map((h) => [h.tabla, h.operacion])).toEqual([
      ['eventos_reproductivos', 'alta'],
      ['eventos_reproductivos', 'cambio'],
    ])
  })

  it('otra explotación no ve ni anula los eventos, ni usa sus toros', async () => {
    const x = await animal()
    const [e] = (await (
      await registrar([x.id], { tipo: 'cubricion', fecha: '2026-03-01', padreId: toro })
    ).json()) as Evento[]
    expect((await historial(x.id, b, carla.cookie)).status).toBe(404)
    expect(await codigo(await anular(e?.id ?? '', 'Desde B', b, carla.cookie))).toBe(
      'evento_no_encontrado',
    )
    const deB = await animal({}, b, carla.cookie)
    const res = await registrar(
      [deB.id],
      { tipo: 'cubricion', fecha: '2026-03-01', padreId: toro },
      b,
      carla.cookie,
    )
    expect(await campos(res)).toContain('padreId')
  })
})

describe('restricciones de la base de datos', () => {
  const comoAna = <T>(fn: Parameters<typeof enExplotacion<T>>[1]) =>
    enExplotacion({ explotacionId: a, usuarioId: ana.id }, fn)

  it('hembras, padre macho, datos de cada tipo y fecha en la vida del animal', async () => {
    const x = await animal()
    const macho = await animal({ sexo: 'macho' })
    const valores = { animalId: x.id, fecha: '2026-03-01', tipo: 'aborto' as const }
    const insertar = (cambios: Partial<typeof eventosReproductivos.$inferInsert>) =>
      comoAna((tx) => tx.insert(eventosReproductivos).values({ ...valores, ...cambios }))
    await expect(insertar({ animalId: macho.id })).rejects.toMatchObject({
      cause: { constraint: 'eventos_reproductivos_hembra' },
    })
    await expect(insertar({ tipo: 'cubricion', padreId: x.id })).rejects.toMatchObject({
      cause: { constraint: 'eventos_reproductivos_padre_macho' },
    })
    await expect(insertar({ tipo: 'cubricion' })).rejects.toMatchObject({
      cause: { constraint: 'eventos_reproductivos_datos' },
    })
    await expect(insertar({ metodo: 'ecografia' })).rejects.toMatchObject({
      cause: { constraint: 'eventos_reproductivos_datos' },
    })
    await expect(insertar({ fecha: '2019-12-31' })).rejects.toMatchObject({
      cause: { constraint: 'eventos_reproductivos_fecha_en_vida' },
    })
  })

  it('un evento no se corrige ni se borra', async () => {
    const x = await animal()
    const [e] = (await (
      await registrar([x.id], { tipo: 'aborto', fecha: '2026-03-01' })
    ).json()) as Evento[]
    const id = e?.id ?? ''
    await expect(
      comoAna((tx) =>
        tx
          .update(eventosReproductivos)
          .set({ fecha: '2026-03-02' })
          .where(eq(eventosReproductivos.id, id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'eventos_reproductivos_inmutable' } })
    await expect(
      comoAna((tx) => tx.delete(eventosReproductivos).where(eq(eventosReproductivos.id, id))),
    ).rejects.toMatchObject({ cause: { constraint: 'eventos_reproductivos_inmutable' } })
  })
})
