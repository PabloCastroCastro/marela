import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { aplicaciones, historialCambios } from '../src/db/schema/index.js'
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

type Aplicacion = {
  id: string
  fincaId: string
  tipo: string
  tipoAbono: string | null
  superficie: number
  plaga: string | null
  diasSeguridad: number
  finSeguridad: string
  anulacion: { motivo: string } | null
}

// Fecha de hace n días (negativo: dentro de n días)
const haceDias = (n: number) =>
  new Date(Date.parse(`${hoyEnMadrid()}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10)

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

const abonar = (fincaIds: string[], datos: object = {}, explotacion = a, cookie = ana.cookie) =>
  pedir('POST', `/explotaciones/${explotacion}/aplicaciones`, cookie, {
    fincaIds,
    tipo: 'abono',
    fecha: '2026-03-01',
    producto: 'Purín de vacuno',
    tipoAbono: 'organico',
    dosis: 30,
    unidadDosis: 'm3_ha',
    ...datos,
  })

const fito = (fincaIds: string[], datos: object = {}) =>
  abonar(fincaIds, {
    tipo: 'fitosanitario',
    producto: 'Fluroxipir 20 %',
    tipoAbono: null,
    dosis: 1.5,
    unidadDosis: 'l_ha',
    plaga: 'Romaza',
    diasSeguridad: 28,
    ...datos,
  })

const deLaFinca = (fincaId: string, explotacion = a, cookie = ana.cookie) =>
  pedir('GET', `/explotaciones/${explotacion}/fincas/${fincaId}/aplicaciones`, cookie)

const anular = (id: string, motivo = 'Registrado en la finca equivocada') =>
  pedir('POST', `/explotaciones/${a}/aplicaciones/${id}/anulacion`, ana.cookie, { motivo })

beforeAll(async () => {
  a = (await nuevaExplotacion('A de aplicaciones')).id
  b = (await nuevaExplotacion('B de aplicaciones')).id
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

describe('abonos y fitosanitarios', () => {
  it('abona varias fincas a la vez, cada una con su superficie entera', async () => {
    const [x, y] = [await finca(2), await finca(3.5)]
    const res = await abonar([x, y], { aplicadoPorId: ana.id, lote: 'L1' })
    expect(res.status).toBe(201)
    const creadas = (await res.json()) as Aplicacion[]
    expect(creadas.map((c) => [c.fincaId, c.superficie]).sort()).toEqual(
      [
        [x, 2],
        [y, 3.5],
      ].sort(),
    )
    expect(creadas[0]).toMatchObject({ tipoAbono: 'organico', diasSeguridad: 0, plaga: null })
    expect(await campos(await abonar([x, y], { superficie: 1 }))).toContain('superficie')
  })

  it('un fitosanitario deja la finca en plazo de seguridad hasta su fin', async () => {
    const x = await finca(2)
    await fito([x], { fecha: '2026-01-10', diasSeguridad: 10 })
    const res = await fito([x], {
      fecha: haceDias(2),
      diasSeguridad: 28,
      superficie: 1.25,
      ropo: '3600012345678',
      equipo: 'Mochila',
    })
    const [creado] = (await res.json()) as Aplicacion[]
    expect(creado).toMatchObject({ superficie: 1.25, finSeguridad: haceDias(-26) })

    const ficha = await pedir('GET', `/explotaciones/${a}/fincas/${x}`, ana.cookie)
    expect(await ficha.json()).toMatchObject({ finSeguridad: haceDias(-26) })
    const enPlazo = await pedir('GET', `/explotaciones/${a}/fincas?seguridad=en_curso`, ana.cookie)
    const ids = ((await enPlazo.json()) as { id: string }[]).map((f) => f.id)
    expect(ids).toContain(x)

    // Al anularlo, el plazo deja de estar en curso
    await anular(creado?.id ?? '')
    const despues = await pedir('GET', `/explotaciones/${a}/fincas/${x}`, ana.cookie)
    expect(await despues.json()).toMatchObject({ finSeguridad: null })
  })

  it('valida los datos de cada tipo, la superficie y la fecha', async () => {
    const x = await finca(2)
    expect(await campos(await abonar([x], { tipoAbono: null }))).toEqual(['tipoAbono'])
    expect(await campos(await fito([x], { plaga: ' ' }))).toEqual(['plaga'])
    expect(await campos(await fito([x], { diasSeguridad: null }))).toEqual(['diasSeguridad'])
    expect(await campos(await abonar([x], { dosis: 0 }))).toContain('dosis')
    expect(await campos(await abonar([x], { superficie: 2.5 }))).toEqual(['superficie'])
    expect(await campos(await abonar([x], { fecha: '2999-01-01' }))).toContain('fecha')
    expect(await campos(await abonar([x], { aplicadoPorId: carla.id }))).toContain('aplicadoPorId')
    expect(await (await deLaFinca(x)).json()).toEqual([])
  })

  it('un abono no guarda los datos de fitosanitario', async () => {
    const x = await finca()
    const res = await abonar([x], { plaga: 'Romaza', diasSeguridad: 20, ropo: '123' })
    expect(((await res.json()) as Aplicacion[])[0]).toMatchObject({
      plaga: null,
      diasSeguridad: 0,
    })
  })

  it('no registra en fincas desactivadas ni de otra explotación', async () => {
    const [x, y] = [await finca(), await finca()]
    await pedir('PATCH', `/explotaciones/${a}/fincas/${y}/estado`, ana.cookie, { activa: false })
    expect(await campos(await abonar([x, y]))).toEqual(['fincaIds'])
    const deB = await finca(1, b, carla.cookie)
    expect(await campos(await abonar([x, deB]))).toEqual(['fincaIds'])
  })

  it('se anula una vez, con motivo, y queda en la lista y el historial', async () => {
    const x = await finca()
    const [c] = (await (await abonar([x])).json()) as Aplicacion[]
    const id = c?.id ?? ''
    expect(await campos(await anular(id, ' '))).toEqual(['motivo'])
    expect(await (await anular(id)).json()).toMatchObject({
      anulacion: { motivo: 'Registrado en la finca equivocada' },
    })
    expect(await codigo(await anular(id))).toBe('ya_anulado')
    expect(((await (await deLaFinca(x)).json()) as Aplicacion[]).map((l) => l.id)).toEqual([id])
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, id)),
    )
    expect(cambios.map((h) => h.operacion).sort()).toEqual(['alta', 'cambio'])
  })

  it('sugiere las personas del equipo y los productos, plagas y equipos usados', async () => {
    const x = await finca()
    await fito([x], { producto: 'Glifosato 36 %', plaga: 'Grama', equipo: 'Mochila' })
    await abonar([x], { producto: 'Estiércol', tipoAbono: 'organico' })
    const res = await pedir('GET', `/explotaciones/${a}/aplicaciones/opciones`, ana.cookie)
    const opciones = (await res.json()) as Record<string, string[]> & {
      personas: { id: string }[]
    }
    expect(opciones.personas.map((p) => p.id)).toEqual([ana.id])
    expect(opciones.fitosanitarios).toContain('Glifosato 36 %')
    expect(opciones.abonos).toContain('Estiércol')
    expect(opciones.abonos).not.toContain('Glifosato 36 %')
    expect(opciones.plagas).toContain('Grama')
    expect(opciones.equipos).toContain('Mochila')
  })

  it('otra explotación no ve ni anula las aplicaciones', async () => {
    const x = await finca()
    const [c] = (await (await abonar([x])).json()) as Aplicacion[]
    expect((await deLaFinca(x, b, carla.cookie)).status).toBe(404)
    const res = await pedir(
      'POST',
      `/explotaciones/${b}/aplicaciones/${c?.id}/anulacion`,
      carla.cookie,
      {
        motivo: 'No es mío',
      },
    )
    expect(res.status).toBe(404)
  })
})

describe('restricciones de la base de datos', () => {
  const insertar = (fincaId: string, valores: Partial<typeof aplicaciones.$inferInsert> = {}) =>
    enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .insert(aplicaciones)
        .values({
          fincaId,
          tipo: 'abono',
          fecha: '2026-03-01',
          producto: 'Urea',
          tipoAbono: 'mineral',
          dosis: 200,
          unidadDosis: 'kg_ha',
          superficie: 1,
          ...valores,
        })
        .returning(),
    )

  it('datos de cada tipo y quien lo aplica, del equipo', async () => {
    const x = await finca()
    await expect(insertar(x, { tipoAbono: null })).rejects.toMatchObject({
      cause: { constraint: 'aplicaciones_datos' },
    })
    await expect(insertar(x, { diasSeguridad: 5 })).rejects.toMatchObject({
      cause: { constraint: 'aplicaciones_datos' },
    })
    await expect(
      insertar(x, { tipo: 'fitosanitario', tipoAbono: null, plaga: null }),
    ).rejects.toMatchObject({ cause: { constraint: 'aplicaciones_datos' } })
    await expect(insertar(x, { aplicadoPorId: carla.id })).rejects.toMatchObject({
      cause: { constraint: 'aplicaciones_aplicado_por_miembro' },
    })
  })

  it('no se corrige ni se borra', async () => {
    const x = await finca()
    const [fila] = await insertar(x)
    const id = fila?.id ?? ''
    const contexto = { explotacionId: a, usuarioId: ana.id }
    await expect(
      enExplotacion(contexto, (tx) =>
        tx.update(aplicaciones).set({ dosis: 300 }).where(eq(aplicaciones.id, id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'aplicaciones_inmutable' } })
    await expect(
      enExplotacion(contexto, (tx) => tx.delete(aplicaciones).where(eq(aplicaciones.id, id))),
    ).rejects.toMatchObject({ cause: { constraint: 'aplicaciones_inmutable' } })
  })
})
