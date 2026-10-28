import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { historialCambios, labores } from '../src/db/schema/index.js'
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

type Labor = {
  id: string
  fincaId: string
  tipo: string
  cultivo: string | null
  labor: string | null
  superficie: number
  cantidad: number | null
  unidad: string | null
  realizadaPor: { id: string | null; nombre: string } | null
}

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }

// Una finca de A con una parcela de la superficie indicada
const finca = async (superficie = 2, explotacion = a, cookie = ana.cookie) => {
  const res = await pedir('POST', `/explotaciones/${explotacion}/fincas`, cookie, {
    nombre: `Finca ${randomInt(1e9)}`,
    parcelas: [{ referenciaCatastral: `X${randomInt(1e9)}`, superficie }],
  })
  return ((await res.json()) as { id: string }).id
}

const registrar = (fincaIds: string[], datos: object, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/labores`, cookie, {
    fincaIds,
    tipo: 'otra',
    fecha: '2026-06-01',
    labor: 'Siega',
    ...datos,
  })

const deLaFinca = (fincaId: string, explotacion = a, cookie = ana.cookie) =>
  pedir('GET', `/explotaciones/${explotacion}/fincas/${fincaId}/labores`, cookie)

beforeAll(async () => {
  a = (await nuevaExplotacion('A de labores')).id
  b = (await nuevaExplotacion('B de labores')).id
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

describe('labores', () => {
  it('siega varias fincas a la vez, cada una con su superficie entera', async () => {
    const [x, y] = [await finca(2), await finca(3.5)]
    const res = await registrar([x, y], { realizadaPorId: ana.id })
    expect(res.status).toBe(201)
    const creadas = (await res.json()) as Labor[]
    expect(creadas.map((l) => [l.fincaId, l.superficie]).sort()).toEqual(
      [
        [x, 2],
        [y, 3.5],
      ].sort(),
    )
    expect(creadas[0]?.realizadaPor?.id).toBe(ana.id)
    expect(await campos(await registrar([x, y], { superficie: 1 }))).toContain('superficie')
  })

  it('siembra y cosecha con cultivo, cantidad y unidad, de la más reciente a la más antigua', async () => {
    const x = await finca(4)
    await registrar([x], {
      tipo: 'siembra',
      fecha: '2026-05-02',
      cultivo: 'Maíz forrajero',
      labor: null,
    })
    const res = await registrar([x], {
      tipo: 'cosecha',
      fecha: '2026-09-28',
      cultivo: 'Maíz forrajero',
      labor: null,
      superficie: 3.25,
      cantidad: 6,
      unidad: 'remolques',
      realizadaPorTexto: 'Contratista',
    })
    expect(((await res.json()) as Labor[])[0]).toMatchObject({
      superficie: 3.25,
      cantidad: 6,
      unidad: 'remolques',
      realizadaPor: { id: null, nombre: 'Contratista' },
    })
    const lista = (await (await deLaFinca(x)).json()) as Labor[]
    expect(lista.map((l) => l.tipo)).toEqual(['cosecha', 'siembra'])
  })

  it('valida los datos de cada tipo, la superficie y la fecha', async () => {
    const x = await finca(2)
    expect(await campos(await registrar([x], { labor: ' ' }))).toContain('labor')
    expect(
      await campos(await registrar([x], { tipo: 'siembra', labor: null, cultivo: '' })),
    ).toContain('cultivo')
    expect(
      await campos(
        await registrar([x], { tipo: 'cosecha', labor: null, cultivo: 'Trigo', cantidad: 5 }),
      ),
    ).toContain('unidad')
    expect(await campos(await registrar([x], { superficie: 2.5 }))).toEqual(['superficie'])
    expect(await campos(await registrar([x], { fecha: '2999-01-01' }))).toContain('fecha')
    expect(await campos(await registrar([x], { realizadaPorId: carla.id }))).toContain(
      'realizadaPorId',
    )
    expect(await (await deLaFinca(x)).json()).toEqual([])
  })

  it('no registra en fincas desactivadas ni de otra explotación', async () => {
    const [x, y] = [await finca(), await finca()]
    await pedir('PATCH', `/explotaciones/${a}/fincas/${y}/estado`, ana.cookie, { activa: false })
    expect(await campos(await registrar([x, y], {}))).toEqual(['fincaIds'])
    const deB = await finca(1, b, carla.cookie)
    expect(await campos(await registrar([x, deB], {}))).toEqual(['fincaIds'])
  })

  it('corrige y borra una labor, y queda en el historial', async () => {
    const x = await finca(2)
    const [l] = (await (await registrar([x], {})).json()) as Labor[]
    const id = l?.id ?? ''
    const res = await pedir('PUT', `/explotaciones/${a}/labores/${id}`, ana.cookie, {
      tipo: 'otra',
      fecha: '2026-06-02',
      labor: 'Riego',
      superficie: 1.5,
    })
    expect(await res.json()).toMatchObject({ labor: 'Riego', superficie: 1.5 })
    const borrada = await pedir('DELETE', `/explotaciones/${a}/labores/${id}`, ana.cookie)
    expect(await borrada.json()).toMatchObject({ id, labor: 'Riego' })
    expect(await (await deLaFinca(x)).json()).toEqual([])
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, id)),
    )
    expect(cambios.map((c) => c.operacion).sort()).toEqual(['alta', 'borrado', 'cambio'])
    expect(
      await codigo(await pedir('DELETE', `/explotaciones/${a}/labores/${id}`, ana.cookie)),
    ).toBe('labor_no_encontrada')
  })

  it('sugiere las personas del equipo y los cultivos y labores usados', async () => {
    const x = await finca()
    await registrar([x], { labor: 'Desbroce' })
    const res = await pedir('GET', `/explotaciones/${a}/labores/opciones`, ana.cookie)
    const opciones = (await res.json()) as { personas: { id: string }[]; labores: string[] }
    expect(opciones.personas.map((p) => p.id)).toEqual([ana.id])
    expect(opciones.labores).toContain('Desbroce')
  })

  it('otra explotación no ve ni toca las labores', async () => {
    const x = await finca()
    const [l] = (await (await registrar([x], {})).json()) as Labor[]
    expect((await deLaFinca(x, b, carla.cookie)).status).toBe(404)
    expect(
      (await pedir('DELETE', `/explotaciones/${b}/labores/${l?.id}`, carla.cookie)).status,
    ).toBe(404)
  })
})

describe('restricciones de la base de datos', () => {
  it('datos de cada tipo, cantidad con unidad y quien la realiza, del equipo', async () => {
    const x = await finca()
    const insertar = (valores: Partial<typeof labores.$inferInsert>) =>
      enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
        tx.insert(labores).values({
          fincaId: x,
          tipo: 'otra',
          fecha: '2026-06-01',
          labor: 'Siega',
          superficie: 1,
          ...valores,
        }),
      )
    await expect(insertar({ labor: null })).rejects.toMatchObject({
      cause: { constraint: 'labores_datos' },
    })
    await expect(insertar({ cantidad: 5, unidad: 'kg' })).rejects.toMatchObject({
      cause: { constraint: 'labores_cantidad' },
    })
    await expect(
      insertar({ tipo: 'cosecha', labor: null, cultivo: 'Trigo', cantidad: 5 }),
    ).rejects.toMatchObject({ cause: { constraint: 'labores_cantidad' } })
    await expect(insertar({ realizadaPorId: carla.id })).rejects.toMatchObject({
      cause: { constraint: 'labores_realizada_por_miembro' },
    })
  })
})
