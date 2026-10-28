import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { historialCambios, tratamientos } from '../src/db/schema/index.js'
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

const error = async (res: Response) =>
  ((await res.json()) as { error: { detalles?: { campo: string; mensaje: string }[] } }).error
    .detalles ?? []

const campos = async (res: Response) => (await error(res)).map((d) => d.campo)

const crotal = () =>
  `ES${String(randomInt(1e6)).padStart(6, '0')}${String(randomInt(1e6)).padStart(6, '0')}`

// Fecha de hace n días (o dentro de -n días), en aaaa-mm-dd
const haceDias = (n: number) =>
  new Date(Date.parse(`${hoyEnMadrid()}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10)

type Tratamiento = {
  id: string
  animalId: string
  fecha: string
  producto: string
  diasSupresion: number
  finSupresion: string
  aplicadoPor: { id: string | null; nombre: string } | null
  anulacion: { en: string; por: string; motivo: string } | null
}

type Animal = { id: string; crotal: string; finSupresion: string | null }

let a = ''
let b = ''
let ana = { id: '', nombre: '', cookie: '' }
let carla = { id: '', cookie: '' }

// Un animal nacido el 1 de febrero de 2026 en la explotación A
const animal = async (cambios: object = {}) => {
  const res = await pedir('POST', `/explotaciones/${a}/animales`, ana.cookie, {
    crotal: crotal(),
    raza: 'Rubia Gallega',
    sexo: 'hembra',
    fechaNacimiento: '2026-02-01',
    ...cambios,
  })
  return (await res.json()) as Animal
}

const datos = (animalIds: string[], cambios: object = {}) => ({
  animalIds,
  fecha: '2026-05-10',
  producto: 'Ivermectina 1 %',
  dosis: '10 ml',
  via: 'subcutanea',
  motivo: 'desparasitacion',
  diasSupresion: 49,
  ...cambios,
})

const tratar = (animalIds: string[], cambios: object = {}, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/tratamientos`, cookie, datos(animalIds, cambios))

const delAnimal = async (animalId: string, explotacion = a, cookie = ana.cookie) =>
  pedir('GET', `/explotaciones/${explotacion}/animales/${animalId}/tratamientos`, cookie)

const anular = (id: string, motivo: unknown, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/tratamientos/${id}/anulacion`, cookie, { motivo })

beforeAll(async () => {
  a = (await nuevaExplotacion('A de tratamientos')).id
  b = (await nuevaExplotacion('B de tratamientos')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'empleado')
  ana = { id: u.id, nombre: `Usuario ${u.username.slice(2)}`, cookie: await iniciarSesion(app, u) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  carla = { id: v.id, cookie: await iniciarSesion(app, v) }
})

afterAll(async () => {
  await pool.end()
})

describe('tratamientos', () => {
  it('registra el mismo tratamiento a varios animales, uno por animal', async () => {
    const [x, y] = [await animal(), await animal()]
    const res = await tratar([x.id, y.id, x.id], { aplicadoPorId: ana.id, lote: 'L-24' })
    expect(res.status).toBe(201)
    const creados = (await res.json()) as Tratamiento[]
    expect(creados.map((t) => t.animalId).sort()).toEqual([x.id, y.id].sort())
    expect(creados[0]).toMatchObject({
      producto: 'Ivermectina 1 %',
      diasSupresion: 49,
      // 10 de mayo más 49 días
      finSupresion: '2026-06-28',
      aplicadoPor: { id: ana.id, nombre: ana.nombre },
      anulacion: null,
    })

    await tratar([x.id], { fecha: '2026-07-01', producto: 'Vacuna', motivo: 'vacuna' })
    const lista = (await (await delAnimal(x.id)).json()) as Tratamiento[]
    expect(lista.map((t) => [t.fecha, t.producto])).toEqual([
      ['2026-07-01', 'Vacuna'],
      ['2026-05-10', 'Ivermectina 1 %'],
    ])
  })

  it('quien lo administra puede ser un nombre escrito', async () => {
    const x = await animal()
    const res = await tratar([x.id], { aplicadoPorTexto: '  Veterinaria de la ADS ' })
    expect(((await res.json()) as Tratamiento[])[0]?.aplicadoPor).toEqual({
      id: null,
      nombre: 'Veterinaria de la ADS',
    })
  })

  it('valida los datos y dice en qué animal falla la fecha', async () => {
    const x = await animal()
    expect(await campos(await tratar([x.id], { producto: ' ' }))).toContain('producto')
    expect(await campos(await tratar([x.id], { diasSupresion: -1 }))).toContain('diasSupresion')
    expect(await campos(await tratar([x.id], { diasSupresion: 2.5 }))).toContain('diasSupresion')
    expect(await campos(await tratar([x.id], { fecha: '2999-01-01' }))).toContain('fecha')
    expect(await campos(await tratar([], {}))).toContain('animalIds')
    expect(
      await campos(await tratar([x.id], { aplicadoPorId: ana.id, aplicadoPorTexto: 'Otro' })),
    ).toContain('aplicadoPorTexto')

    const joven = await animal({ fechaNacimiento: '2026-06-01' })
    const res = await tratar([x.id, joven.id])
    expect(await error(res)).toEqual([
      { campo: 'fecha', mensaje: `La fecha es anterior al nacimiento de ${joven.crotal}` },
    ])
    // Nada se registra si falla un animal
    expect(await (await delAnimal(x.id)).json()).toEqual([])
  })

  it('no trata animales ni pone personas de otra explotación', async () => {
    const x = await animal()
    const res = await pedir('POST', `/explotaciones/${b}/animales`, carla.cookie, {
      crotal: crotal(),
      raza: 'Limusina',
      sexo: 'hembra',
      fechaNacimiento: '2025-01-01',
    })
    const deB = ((await res.json()) as Animal).id
    expect(await campos(await tratar([x.id, deB]))).toContain('animalIds')
    expect(await campos(await tratar([x.id], { aplicadoPorId: carla.id }))).toContain(
      'aplicadoPorId',
    )
  })

  it('no admite tratamientos después de la baja del animal', async () => {
    const x = await animal()
    await pedir('POST', `/explotaciones/${a}/animales/${x.id}/baja`, ana.cookie, {
      tipo: 'muerte',
      fecha: '2026-05-01',
    })
    expect(await campos(await tratar([x.id]))).toContain('fecha')
    expect((await tratar([x.id], { fecha: '2026-04-01' })).status).toBe(201)
  })

  it('muestra y filtra los animales con supresión en curso', async () => {
    const [en, pasada, anulada, sin] = [
      await animal(),
      await animal(),
      await animal(),
      await animal(),
    ]
    await tratar([en.id], { fecha: haceDias(3), diasSupresion: 28 })
    await tratar([en.id], { fecha: haceDias(1), diasSupresion: 5 })
    await tratar([pasada.id], { fecha: haceDias(10), diasSupresion: 10 })
    const [t] = (await (await tratar([anulada.id], { fecha: haceDias(1) })).json()) as Tratamiento[]
    await anular(t?.id ?? '', 'Error')
    await tratar([sin.id], { fecha: haceDias(1), diasSupresion: 0 })

    const ficha = (await (
      await pedir('GET', `/explotaciones/${a}/animales/${en.id}`, ana.cookie)
    ).json()) as Animal
    expect(ficha.finSupresion).toBe(haceDias(-25))

    const lista = (await (
      await pedir('GET', `/explotaciones/${a}/animales?supresion=en_curso`, ana.cookie)
    ).json()) as Animal[]
    const ids = lista.map((x) => x.id)
    expect(ids).toContain(en.id)
    expect(ids).not.toContain(pasada.id)
    expect(ids).not.toContain(anulada.id)
    expect(ids).not.toContain(sin.id)
    expect(lista.every((x) => x.finSupresion !== null)).toBe(true)
  })

  it('anula con motivo, una sola vez, y queda en el historial', async () => {
    const x = await animal()
    const [t] = (await (await tratar([x.id])).json()) as Tratamiento[]
    const id = t?.id ?? ''
    expect(await campos(await anular(id, '  '))).toContain('motivo')

    const res = await anular(id, 'Registrado en el animal equivocado')
    expect(res.status).toBe(200)
    expect(((await res.json()) as Tratamiento).anulacion).toMatchObject({
      por: ana.nombre,
      motivo: 'Registrado en el animal equivocado',
    })
    const otraVez = await anular(id, 'Otra vez')
    expect(otraVez.status).toBe(409)
    expect(await codigo(otraVez)).toBe('ya_anulado')

    // Sigue en la ficha, anulado
    const lista = (await (await delAnimal(x.id)).json()) as Tratamiento[]
    expect(lista.map((l) => l.anulacion?.motivo)).toEqual(['Registrado en el animal equivocado'])

    const historial = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, id))
        .orderBy(historialCambios.fecha),
    )
    expect(historial.map((h) => [h.tabla, h.operacion, h.usuarioId])).toEqual([
      ['tratamientos', 'alta', ana.id],
      ['tratamientos', 'cambio', ana.id],
    ])
  })

  it('sugiere las personas del equipo y los productos usados', async () => {
    const x = await animal()
    await tratar([x.id], { producto: 'Producto sugerido' })
    const res = await pedir('GET', `/explotaciones/${a}/tratamientos/opciones`, ana.cookie)
    const opciones = (await res.json()) as { personas: { id: string }[]; productos: string[] }
    expect(opciones.personas.map((p) => p.id)).toEqual([ana.id])
    expect(opciones.productos).toContain('Producto sugerido')
  })

  it('otra explotación no ve ni anula los tratamientos', async () => {
    const x = await animal()
    const [t] = (await (await tratar([x.id])).json()) as Tratamiento[]
    expect((await delAnimal(x.id, b, carla.cookie)).status).toBe(404)
    const res = await anular(t?.id ?? '', 'Desde B', b, carla.cookie)
    expect(await codigo(res)).toBe('tratamiento_no_encontrado')
  })
})

describe('restricciones de la base de datos', () => {
  const comoAna = <T>(fn: Parameters<typeof enExplotacion<T>>[1]) =>
    enExplotacion({ explotacionId: a, usuarioId: ana.id }, fn)

  it('fecha en la vida del animal y quien lo administra, del equipo', async () => {
    const x = await animal()
    const valores = {
      animalId: x.id,
      fecha: '2026-03-01',
      producto: 'P',
      motivo: 'otro' as const,
    }
    await expect(
      comoAna((tx) => tx.insert(tratamientos).values({ ...valores, fecha: '2026-01-01' })),
    ).rejects.toMatchObject({ cause: { constraint: 'tratamientos_fecha_en_vida' } })
    await expect(
      comoAna((tx) => tx.insert(tratamientos).values({ ...valores, aplicadoPorId: carla.id })),
    ).rejects.toMatchObject({ cause: { constraint: 'tratamientos_aplicado_por_miembro' } })
    await expect(
      comoAna((tx) => tx.insert(tratamientos).values({ ...valores, diasSupresion: -3 })),
    ).rejects.toMatchObject({ cause: { constraint: 'tratamientos_dias_supresion' } })
  })

  it('un tratamiento no se corrige ni se borra', async () => {
    const x = await animal()
    const [t] = (await (await tratar([x.id])).json()) as Tratamiento[]
    const id = t?.id ?? ''
    await expect(
      comoAna((tx) =>
        tx.update(tratamientos).set({ producto: 'Otro' }).where(eq(tratamientos.id, id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'tratamientos_inmutable' } })
    await expect(
      comoAna((tx) => tx.delete(tratamientos).where(eq(tratamientos.id, id))),
    ).rejects.toMatchObject({ cause: { constraint: 'tratamientos_inmutable' } })
    await anular(id, 'Error')
    await expect(
      comoAna((tx) =>
        tx.update(tratamientos).set({ motivoAnulacion: 'Otro' }).where(eq(tratamientos.id, id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'tratamientos_inmutable' } })
  })
})
