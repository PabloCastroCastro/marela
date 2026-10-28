import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { historialCambios, parcelas } from '../src/db/schema/index.js'
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

type Parcela = {
  id: string
  poligono: string | null
  recinto: string | null
  referenciaCatastral: string | null
  superficie: number
}
type Finca = {
  id: string
  nombre: string
  activa: boolean
  superficie: number
  numeroParcelas: number
  parcelas: Parcela[]
}

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }

// Un recinto SIGPAC distinto en cada llamada, para no chocar con los de otros tests
const recinto = (superficie = 1) => ({
  provincia: '36',
  municipio: '24',
  poligono: String(randomInt(1, 99_999)),
  parcela: String(randomInt(1, 99_999)),
  recinto: '1',
  superficie,
})

const nombre = () => `Finca ${randomInt(1e9)}`

const alta = (datos: object, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/fincas`, cookie, {
    nombre: nombre(),
    parcelas: [recinto()],
    ...datos,
  })

beforeAll(async () => {
  a = (await nuevaExplotacion('A de fincas')).id
  b = (await nuevaExplotacion('B de fincas')).id
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

describe('fincas', () => {
  it('da de alta una finca con varias parcelas y suma su superficie', async () => {
    const res = await alta({
      nombre: '  Agra de abaixo ',
      municipio: 'Lalín',
      regimen: 'arrendamiento',
      parcelas: [
        { ...recinto(1.23456), poligono: '012' },
        { referenciaCatastral: '36024a012 000450000xy', superficie: 0.5 },
      ],
    })
    expect(res.status).toBe(201)
    const finca = (await res.json()) as Finca
    expect(finca).toMatchObject({
      nombre: 'Agra de abaixo',
      regimen: 'arrendamiento',
      activa: true,
      superficie: 1.7346,
      numeroParcelas: 2,
    })
    expect(finca.parcelas.map((p) => [p.poligono, p.referenciaCatastral, p.superficie])).toEqual([
      ['12', null, 1.2346],
      [null, '36024A012000450000XY', 0.5],
    ])

    const lista = (await (
      await pedir('GET', `/explotaciones/${a}/fincas?q=agra`, ana.cookie)
    ).json()) as Finca[]
    expect(lista.map((f) => f.id)).toContain(finca.id)
  })

  it('guarda la referencia SIGPAC de siete partes, el uso y el contorno del mapa', async () => {
    const contorno = {
      type: 'Polygon',
      coordinates: [
        [
          [-8.096, 42.679],
          [-8.095, 42.679],
          [-8.095, 42.68],
          [-8.096, 42.679],
        ],
      ],
    }
    const res = await alta({
      parcelas: [{ ...recinto(), agregado: '1', zona: '2', uso: 'PS', contorno }, recinto()],
    })
    const finca = (await res.json()) as {
      id: string
      parcelas: { agregado: string; zona: string; uso: string | null; contorno: unknown }[]
    }
    expect(finca.parcelas.map((p) => [p.agregado, p.zona, p.uso])).toEqual([
      ['1', '2', 'PS'],
      // Sin agregado ni zona, 0
      ['0', '0', null],
    ])
    expect(finca.parcelas[0]?.contorno).toEqual(contorno)
    // Para el mapa de la explotación, solo las parcelas con contorno (GH-91)
    const todos = (await (
      await pedir('GET', `/explotaciones/${a}/fincas/contornos`, ana.cookie)
    ).json()) as { fincaId: string; contorno: unknown }[]
    const suyos = todos.filter((c) => c.fincaId === finca.id)
    expect(suyos).toEqual([expect.objectContaining({ contorno })])
    const deB = await pedir('GET', `/explotaciones/${b}/fincas/contornos`, carla.cookie)
    expect(((await deB.json()) as { fincaId: string }[]).some((c) => c.fincaId === finca.id)).toBe(
      false,
    )
    const malo = await alta({ parcelas: [{ ...recinto(), contorno: { type: 'Point' } }] })
    expect(await campos(malo)).toContain('parcelas.0.contorno.type')
  })

  it('valida el nombre, las referencias y la superficie', async () => {
    expect(await campos(await alta({ nombre: ' ' }))).toContain('nombre')
    expect(await campos(await alta({ parcelas: [] }))).toContain('parcelas')
    expect(await campos(await alta({ parcelas: [{ ...recinto(), recinto: null }] }))).toContain(
      'parcelas.0.recinto',
    )
    expect(await campos(await alta({ parcelas: [{ superficie: 1 }] }))).toContain(
      'parcelas.0.referenciaCatastral',
    )
    expect(await campos(await alta({ parcelas: [recinto(0)] }))).toContain('parcelas.0.superficie')
    expect(await campos(await alta({ parcelas: [{ ...recinto(), poligono: '12a' }] }))).toContain(
      'parcelas.0.poligono',
    )
  })

  it('no repite nombres ni recintos SIGPAC en la explotación', async () => {
    const r = recinto()
    const primera = (await (await alta({ parcelas: [r] })).json()) as Finca
    const mismoNombre = await alta({ nombre: primera.nombre.toUpperCase() })
    expect(mismoNombre.status).toBe(409)
    expect(await codigo(mismoNombre)).toBe('nombre_en_uso')

    const mismoRecinto = await alta({ parcelas: [recinto(), r] })
    expect(mismoRecinto.status).toBe(409)
    expect(await campos(mismoRecinto)).toEqual(['parcelas.1.recinto'])
    expect(await campos(await alta({ parcelas: [r, r] }))).toContain('parcelas.1.recinto')

    // En otra explotación sí puede estar
    expect((await alta({ parcelas: [r] }, b, carla.cookie)).status).toBe(201)
  })

  it('edita los datos y las parcelas: corrige, añade y quita', async () => {
    const finca = (await (await alta({ parcelas: [recinto(1), recinto(2)] })).json()) as Finca
    const [primera, segunda] = finca.parcelas
    const res = await pedir('PUT', `/explotaciones/${a}/fincas/${finca.id}`, ana.cookie, {
      nombre: finca.nombre,
      regimen: 'propiedad',
      parcelas: [
        { ...primera, superficie: 3 },
        { referenciaCatastral: '36024A012000990000AB', superficie: 0.25 },
      ],
    })
    expect(res.status).toBe(200)
    const editada = (await res.json()) as Finca
    expect(editada.superficie).toBe(3.25)
    expect(editada.parcelas.map((p) => p.id)).toContain(primera?.id)
    expect(editada.parcelas.map((p) => p.id)).not.toContain(segunda?.id)

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, segunda?.id ?? '')),
    )
    expect(cambios.map((c) => c.operacion).sort()).toEqual(['alta', 'borrado'])

    // Una parcela de otra finca no se puede tocar desde aquí
    const otra = (await (await alta({})).json()) as Finca
    const ajena = await pedir('PUT', `/explotaciones/${a}/fincas/${finca.id}`, ana.cookie, {
      nombre: finca.nombre,
      parcelas: [otra.parcelas[0]],
    })
    expect(await campos(ajena)).toEqual(['parcelas.0.id'])
  })

  it('desactiva y reactiva, y filtra por estado', async () => {
    const finca = (await (await alta({})).json()) as Finca
    const estado = (activa: boolean) =>
      pedir('PATCH', `/explotaciones/${a}/fincas/${finca.id}/estado`, ana.cookie, { activa })
    expect(((await (await estado(false)).json()) as Finca).activa).toBe(false)
    const ids = async (filtro: string) =>
      (
        (await (
          await pedir('GET', `/explotaciones/${a}/fincas?activa=${filtro}`, ana.cookie)
        ).json()) as Finca[]
      ).map((f) => f.id)
    expect(await ids('false')).toContain(finca.id)
    expect(await ids('true')).not.toContain(finca.id)
    expect(((await (await estado(true)).json()) as Finca).activa).toBe(true)
  })

  it('otra explotación no ve ni toca las fincas', async () => {
    const finca = (await (await alta({})).json()) as Finca
    expect(
      (await pedir('GET', `/explotaciones/${b}/fincas/${finca.id}`, carla.cookie)).status,
    ).toBe(404)
    const lista = (await (
      await pedir('GET', `/explotaciones/${b}/fincas`, carla.cookie)
    ).json()) as Finca[]
    expect(lista.map((f) => f.id)).not.toContain(finca.id)
    const vistas = await enExplotacion({ explotacionId: b, usuarioId: carla.id }, (tx) =>
      tx.select().from(parcelas).where(eq(parcelas.fincaId, finca.id)),
    )
    expect(vistas).toEqual([])
  })
})

describe('restricciones de la base de datos', () => {
  it('superficie positiva, SIGPAC completa y alguna referencia', async () => {
    const finca = (await (await alta({})).json()) as Finca
    const insertar = (valores: Partial<typeof parcelas.$inferInsert>) =>
      enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
        tx
          .insert(parcelas)
          .values({ fincaId: finca.id, superficie: 1, referenciaCatastral: 'X', ...valores }),
      )
    await expect(insertar({ superficie: 0 })).rejects.toMatchObject({
      cause: { constraint: 'parcelas_superficie' },
    })
    await expect(insertar({ provincia: '36' })).rejects.toMatchObject({
      cause: { constraint: 'parcelas_sigpac_completa' },
    })
    await expect(insertar({ referenciaCatastral: null })).rejects.toMatchObject({
      cause: { constraint: 'parcelas_con_referencia' },
    })
  })
})
