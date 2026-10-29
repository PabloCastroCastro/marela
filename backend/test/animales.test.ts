import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { animales, historialCambios } from '../src/db/schema/index.js'
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

// Crotal español único: la base de test se reutiliza entre ejecuciones
const crotal = () =>
  `ES${String(randomInt(1e6)).padStart(6, '0')}${String(randomInt(1e6)).padStart(6, '0')}`

const vaca = (cambios: object = {}) => ({
  crotal: crotal(),
  nombre: 'Marela',
  raza: 'Rubia Gallega',
  sexo: 'hembra',
  fechaNacimiento: '2019-03-14',
  ...cambios,
})

let a = ''
let b = ''
let ana = { id: '', cookie: '' }
let brais = { id: '', cookie: '' }
let carla = { id: '', cookie: '' }

const alta = async (cookie: string, explotacion: string, datos: object) => {
  const res = await pedir('POST', `/explotaciones/${explotacion}/animales`, cookie, datos)
  if (res.status !== 201) throw new Error(`Alta fallida (${res.status}): ${await res.text()}`)
  return (await res.json()) as { id: string; crotal: string }
}

beforeAll(async () => {
  a = (await nuevaExplotacion('A de animales')).id
  b = (await nuevaExplotacion('B de animales')).id
  for (const [persona, explotacion, rol] of [
    ['ana', a, 'administrador'],
    ['brais', a, 'empleado'],
    ['carla', b, 'administrador'],
  ] as const) {
    const u = await nuevoUsuario()
    await hacerMiembro(explotacion, u.id, rol)
    const datos = { id: u.id, cookie: await iniciarSesion(app, u) }
    if (persona === 'ana') ana = datos
    if (persona === 'brais') brais = datos
    if (persona === 'carla') carla = datos
  }
})

afterAll(async () => {
  await pool.end()
})

describe('alta y consulta', () => {
  it('da de alta un animal con el crotal normalizado y la auditoría', async () => {
    const c = crotal()
    const res = await pedir('POST', `/explotaciones/${a}/animales`, brais.cookie, {
      ...vaca(),
      crotal: ` ${c.slice(0, 2).toLowerCase()} ${c.slice(2, 8)} ${c.slice(8)} `,
      nombre: '  ',
    })
    expect(res.status).toBe(201)
    const animal = await res.json()
    expect(animal).toMatchObject({
      crotal: c,
      nombre: null,
      raza: 'Rubia Gallega',
      sexo: 'hembra',
      origen: 'nacido',
      estado: 'activo',
      madre: null,
      padre: null,
    })
    const [fila] = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.select().from(animales).where(eq(animales.id, animal.id)),
    )
    expect(fila?.creadoPor).toBe(brais.id)
  })

  it('lista con búsqueda y filtros, solo los de la explotación', async () => {
    const marca = `Raza${randomInt(1e6)}`
    await alta(ana.cookie, a, vaca({ raza: marca, nombre: 'Bonita' }))
    await alta(ana.cookie, a, vaca({ raza: marca, nombre: 'Moreno', sexo: 'macho' }))
    await alta(carla.cookie, b, vaca({ raza: marca, nombre: 'De B' }))

    const lista = async (consulta: string) =>
      (await (
        await pedir('GET', `/explotaciones/${a}/animales?${consulta}`, ana.cookie)
      ).json()) as {
        nombre: string
      }[]
    expect((await lista(`q=${marca}`)).map((x) => x.nombre).sort()).toEqual(['Bonita', 'Moreno'])
    expect((await lista(`q=${marca}&sexo=macho`)).map((x) => x.nombre)).toEqual(['Moreno'])
    expect((await lista(`q=bonit`)).map((x) => x.nombre)).toContain('Bonita')
    expect(await lista(`q=${marca}&estado=vendido`)).toEqual([])
  })

  it('no ve ni edita animales de otra explotación', async () => {
    const deB = await alta(carla.cookie, b, vaca())
    expect((await pedir('GET', `/explotaciones/${a}/animales/${deB.id}`, ana.cookie)).status).toBe(
      404,
    )
    expect(
      (await pedir('PATCH', `/explotaciones/${a}/animales/${deB.id}`, ana.cookie, { nombre: 'X' }))
        .status,
    ).toBe(404)
  })

  it('valida el crotal y no lo repite en toda la plataforma', async () => {
    const malo = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({ crotal: 'ES123' }),
    )
    expect(malo.status).toBe(400)
    expect(await campos(malo)).toContain('crotal')

    const enB = await alta(carla.cookie, b, vaca())
    const repetido = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({ crotal: enB.crotal }),
    )
    expect(repetido.status).toBe(409)
    expect(await codigo(repetido)).toBe('crotal_en_uso')

    // De otro país: su código y hasta 12 dígitos
    expect(
      (
        await pedir(
          'POST',
          `/explotaciones/${a}/animales`,
          ana.cookie,
          vaca({ crotal: `FR${randomInt(1e9)}` }),
        )
      ).status,
    ).toBe(201)
  })

  it('valida fechas y origen', async () => {
    const futura = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({ fechaNacimiento: '2999-01-01' }),
    )
    expect(await campos(futura)).toContain('fechaNacimiento')

    const sinDatos = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({ origen: 'comprado' }),
    )
    expect(sinDatos.status).toBe(400)
    expect(await campos(sinDatos)).toEqual(expect.arrayContaining(['fechaEntrada', 'regaOrigen']))

    const comprado = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({
        sexo: 'macho',
        origen: 'comprado',
        fechaEntrada: '2024-05-02',
        regaOrigen: 'es270280000099',
      }),
    )
    expect(comprado.status).toBe(201)
    expect(await comprado.json()).toMatchObject({
      origen: 'comprado',
      regaOrigen: 'ES270280000099',
    })
  })
})

describe('madre y padre', () => {
  it('enlaza madre hembra y padre macho de la explotación, o un texto', async () => {
    const madre = await alta(ana.cookie, a, vaca({ nombre: 'Madre' }))
    const toro = await alta(ana.cookie, a, vaca({ nombre: 'Toro', sexo: 'macho' }))
    const res = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({
        nombre: 'Ternera',
        fechaNacimiento: '2026-02-11',
        madreId: madre.id,
        padreId: toro.id,
      }),
    )
    expect(res.status).toBe(201)
    const ternera = await res.json()
    expect(ternera).toMatchObject({
      madre: { id: madre.id, crotal: madre.crotal, nombre: 'Madre' },
      padre: { id: toro.id, nombre: 'Toro' },
    })

    // La ficha de la madre y la del padre muestran a su hija
    for (const progenitor of [madre, toro]) {
      const fichaProgenitor = await (
        await pedir('GET', `/explotaciones/${a}/animales/${progenitor.id}`, ana.cookie)
      ).json()
      expect(fichaProgenitor.hijos).toEqual([
        {
          id: ternera.id,
          crotal: ternera.crotal,
          nombre: 'Ternera',
          sexo: 'hembra',
          fechaNacimiento: '2026-02-11',
          estado: 'activo',
        },
      ])
    }

    const conTexto = await pedir(
      'POST',
      `/explotaciones/${a}/animales`,
      ana.cookie,
      vaca({
        madreTexto: 'Vaca comprada sin ficha',
        padreTexto: 'Dosis LIM-2041',
      }),
    )
    expect(await conTexto.json()).toMatchObject({
      madreTexto: 'Vaca comprada sin ficha',
      padre: null,
      padreTexto: 'Dosis LIM-2041',
    })
  })

  it('rechaza madre macho, padre hembra, progenitores de otra explotación y enlace más texto', async () => {
    const toro = await alta(ana.cookie, a, vaca({ sexo: 'macho' }))
    const vacaA = await alta(ana.cookie, a, vaca())
    const vacaB = await alta(carla.cookie, b, vaca())

    for (const [datos, campo] of [
      [{ madreId: toro.id }, 'madreId'],
      [{ padreId: vacaA.id }, 'padreId'],
      [{ madreId: vacaB.id }, 'madreId'],
      [{ madreId: vacaA.id, madreTexto: 'Otra' }, 'madreTexto'],
    ] as const) {
      const res = await pedir('POST', `/explotaciones/${a}/animales`, ana.cookie, vaca(datos))
      expect(res.status).toBe(400)
      expect(await campos(res)).toContain(campo)
    }
  })
})

describe('edición e historial', () => {
  it('edita la ficha y deja cada cambio en el historial, con quién y cuándo', async () => {
    const animal = await alta(ana.cookie, a, vaca({ nombre: 'Antes' }))
    const res = await pedir('PATCH', `/explotaciones/${a}/animales/${animal.id}`, brais.cookie, {
      nombre: 'Después',
      observaciones: 'Cojea de la pata trasera',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      nombre: 'Después',
      observaciones: 'Cojea de la pata trasera',
      crotal: animal.crotal,
    })

    const historial = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, animal.id))
        .orderBy(historialCambios.fecha),
    )
    expect(historial.map((h) => [h.operacion, h.usuarioId])).toEqual([
      ['alta', ana.id],
      ['cambio', brais.id],
    ])
    expect(historial[1]?.antes).toMatchObject({ nombre: 'Antes' })
    expect(historial[1]?.despues).toMatchObject({ nombre: 'Después', modificado_por: brais.id })
  })

  it('no deja cambiar el sexo de un animal con hijos', async () => {
    const madre = await alta(ana.cookie, a, vaca())
    await alta(ana.cookie, a, vaca({ fechaNacimiento: '2026-01-01', madreId: madre.id }))
    const res = await pedir('PATCH', `/explotaciones/${a}/animales/${madre.id}`, ana.cookie, {
      sexo: 'macho',
    })
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('sexo_con_hijos')
  })

  it('valida la ficha completa al editar', async () => {
    const animal = await alta(ana.cookie, a, vaca())
    const res = await pedir('PATCH', `/explotaciones/${a}/animales/${animal.id}`, ana.cookie, {
      origen: 'comprado',
    })
    expect(res.status).toBe(400)
    expect(await campos(res)).toContain('fechaEntrada')
  })
})

describe('razas', () => {
  it('sugiere las habituales y las que ya usa la explotación', async () => {
    await alta(ana.cookie, a, vaca({ raza: 'Vianesa' }))
    const lista = await (
      await pedir('GET', `/explotaciones/${a}/animales/razas`, ana.cookie)
    ).json()
    expect(lista).toEqual(expect.arrayContaining(['Rubia Gallega', 'Limusina', 'Vianesa']))
  })
})

describe('restricciones de la base de datos', () => {
  const insertar = (valores: Partial<typeof animales.$inferInsert>) =>
    enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.insert(animales).values({
        crotal: crotal(),
        raza: 'Rubia Gallega',
        sexo: 'hembra',
        fechaNacimiento: '2020-01-01',
        ...valores,
      }),
    )

  it('formato del crotal, origen y baja', async () => {
    await expect(insertar({ crotal: 'ES123' })).rejects.toMatchObject({ cause: { code: '23514' } })
    await expect(insertar({ crotal: 'ES12345678' })).rejects.toMatchObject({
      cause: { code: '23514' },
    })
    await expect(insertar({ origen: 'comprado' })).rejects.toMatchObject({
      cause: { constraint: 'animales_origen' },
    })
    await expect(insertar({ estado: 'vendido' })).rejects.toMatchObject({
      cause: { constraint: 'animales_baja' },
    })
  })

  it('madre de otra explotación, y madre macho o padre hembra', async () => {
    const vacaB = await alta(carla.cookie, b, vaca())
    await expect(insertar({ madreId: vacaB.id })).rejects.toMatchObject({
      cause: { code: '23503' },
    })

    const toro = await alta(ana.cookie, a, vaca({ sexo: 'macho' }))
    const vacaA = await alta(ana.cookie, a, vaca())
    await expect(insertar({ madreId: toro.id })).rejects.toMatchObject({
      cause: { constraint: 'animales_madre_hembra' },
    })
    await expect(insertar({ padreId: vacaA.id })).rejects.toMatchObject({
      cause: { constraint: 'animales_padre_macho' },
    })
  })
})

describe('bajas', () => {
  const darBaja = (animalId: string, datos: object, cookie = ana.cookie) =>
    pedir('POST', `/explotaciones/${a}/animales/${animalId}/baja`, cookie, datos)

  it('por muerte: sale del listado de activos y se ve con el filtro', async () => {
    const animal = await alta(ana.cookie, a, vaca({ raza: 'Para la baja' }))
    const res = await darBaja(
      animal.id,
      { tipo: 'muerte', fecha: '2026-10-20', causa: 'Neumonía' },
      brais.cookie,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      estado: 'muerto',
      tipoBaja: 'muerte',
      fechaBaja: '2026-10-20',
      causaBaja: 'Neumonía',
    })
    const ids = async (consulta: string) =>
      (
        (await (
          await pedir('GET', `/explotaciones/${a}/animales?${consulta}`, ana.cookie)
        ).json()) as { id: string }[]
      ).map((x) => x.id)
    expect(await ids('estado=activo&q=Para la baja')).not.toContain(animal.id)
    expect(await ids('estado=muerto&q=Para la baja')).toContain(animal.id)
  })

  it('por sacrificio queda muerto; por robo, extravío u otra causa, de baja', async () => {
    for (const [tipo, estado, causa] of [
      ['sacrificio', 'muerto', undefined],
      ['robo_extravio', 'baja', undefined],
      ['otra', 'baja', 'Cedida a una escuela agraria'],
    ] as const) {
      const animal = await alta(ana.cookie, a, vaca())
      const res = await darBaja(animal.id, { tipo, fecha: '2026-10-01', causa })
      expect(await res.json()).toMatchObject({ estado, tipoBaja: tipo })
    }
  })

  it('valida la causa, las fechas y que no esté ya de baja', async () => {
    const animal = await alta(ana.cookie, a, vaca({ fechaNacimiento: '2024-05-01' }))
    expect(await campos(await darBaja(animal.id, { tipo: 'otra', fecha: '2026-10-01' }))).toContain(
      'causa',
    )
    expect(
      await campos(await darBaja(animal.id, { tipo: 'muerte', fecha: '2999-01-01' })),
    ).toContain('fecha')
    expect(
      await campos(await darBaja(animal.id, { tipo: 'muerte', fecha: '2024-04-01' })),
    ).toContain('fecha')
    expect(
      await campos(await darBaja(animal.id, { tipo: 'venta', fecha: '2026-10-01' })),
    ).toContain('tipo')

    await darBaja(animal.id, { tipo: 'muerte', fecha: '2026-10-01' })
    const otraVez = await darBaja(animal.id, { tipo: 'muerte', fecha: '2026-10-02' })
    expect(otraVez.status).toBe(409)
    expect(await codigo(otraVez)).toBe('ya_de_baja')
  })

  it('se deshace una baja registrada por error, y queda en el historial', async () => {
    const animal = await alta(ana.cookie, a, vaca())
    await darBaja(animal.id, { tipo: 'robo_extravio', fecha: '2026-10-01' })
    const res = await pedir(
      'DELETE',
      `/explotaciones/${a}/animales/${animal.id}/baja`,
      brais.cookie,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      estado: 'activo',
      tipoBaja: null,
      fechaBaja: null,
      causaBaja: null,
    })

    const historial = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .select()
        .from(historialCambios)
        .where(eq(historialCambios.filaId, animal.id))
        .orderBy(historialCambios.fecha),
    )
    expect(historial.map((h) => [h.operacion, (h.despues as { estado: string }).estado])).toEqual([
      ['alta', 'activo'],
      ['cambio', 'baja'],
      ['cambio', 'activo'],
    ])

    const activo = await pedir(
      'DELETE',
      `/explotaciones/${a}/animales/${animal.id}/baja`,
      ana.cookie,
    )
    expect(await codigo(activo)).toBe('no_de_baja')
  })

  it('una venta no se deshace desde la ficha', async () => {
    const animal = await alta(ana.cookie, a, vaca())
    await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx
        .update(animales)
        .set({ estado: 'vendido', tipoBaja: 'venta', fechaBaja: '2026-10-01' })
        .where(eq(animales.id, animal.id)),
    )
    const res = await pedir('DELETE', `/explotaciones/${a}/animales/${animal.id}/baja`, ana.cookie)
    expect(res.status).toBe(409)
    expect(await codigo(res)).toBe('baja_por_venta')
  })

  it('la base de datos exige un estado coherente con el tipo, y la causa si es otra', async () => {
    const animal = await alta(ana.cookie, a, vaca())
    const cambiar = (valores: Partial<typeof animales.$inferInsert>) =>
      enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
        tx.update(animales).set(valores).where(eq(animales.id, animal.id)),
      )
    await expect(
      cambiar({ estado: 'baja', tipoBaja: 'muerte', fechaBaja: '2026-10-01' }),
    ).rejects.toMatchObject({
      cause: { constraint: 'animales_baja' },
    })
    await expect(
      cambiar({ estado: 'baja', tipoBaja: 'otra', fechaBaja: '2026-10-01' }),
    ).rejects.toMatchObject({
      cause: { constraint: 'animales_baja' },
    })
  })
})

describe('reposición (GH-110)', () => {
  type ConReposicion = {
    id: string
    noAptaReposicion: { desde: string; motivo: string; alcance: string } | null
    madreNoAptaReposicion: { desde: string; motivo: string; alcance: string } | null
  }
  const marcar = (id: string, datos: object, cookie = brais.cookie) =>
    pedir('PATCH', `/explotaciones/${a}/animales/${id}/reposicion`, cookie, datos)
  const ficha = async (id: string) =>
    (await (
      await pedir('GET', `/explotaciones/${a}/animales/${id}`, ana.cookie)
    ).json()) as ConReposicion

  it('marca una vaca, y sus hijas (nacidas y por nacer) lo muestran; se quita igual', async () => {
    const madre = await alta(ana.cookie, a, vaca())
    const hija = await alta(
      ana.cookie,
      a,
      vaca({ fechaNacimiento: '2024-03-01', madreId: madre.id }),
    )

    // El empleado también la marca
    const res = await marcar(madre.id, {
      apta: false,
      motivo: ' Paratuberculosis ',
      fecha: '2026-05-02',
    })
    expect(res.status).toBe(200)
    expect(((await res.json()) as ConReposicion).noAptaReposicion).toEqual({
      desde: '2026-05-02',
      motivo: 'Paratuberculosis',
      alcance: 'hijas',
    })
    expect((await ficha(hija.id)).madreNoAptaReposicion).toEqual({
      desde: '2026-05-02',
      motivo: 'Paratuberculosis',
      alcance: 'hijas',
    })
    // Una hija que nace después, también
    const otra = await alta(
      ana.cookie,
      a,
      vaca({ fechaNacimiento: '2026-06-01', madreId: madre.id }),
    )
    expect((await ficha(otra.id)).madreNoAptaReposicion?.motivo).toBe('Paratuberculosis')
    // Un hijo, no: no se deja como madre
    const hijo = await alta(
      ana.cookie,
      a,
      vaca({ fechaNacimiento: '2025-03-01', madreId: madre.id, sexo: 'macho', nombre: null }),
    )
    expect((await ficha(hijo.id)).madreNoAptaReposicion).toBeNull()

    // En el listado, filtradas
    const lista = (await (
      await pedir('GET', `/explotaciones/${a}/animales?reposicion=no_apta`, ana.cookie)
    ).json()) as ConReposicion[]
    expect(lista.map((x) => x.id)).toEqual(expect.arrayContaining([hija.id, otra.id]))
    expect(lista.map((x) => x.id)).not.toContain(madre.id)
    expect(lista.map((x) => x.id)).not.toContain(hijo.id)

    expect((await marcar(madre.id, { apta: true })).status).toBe(200)
    expect((await ficha(hija.id)).madreNoAptaReposicion).toBeNull()

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, madre.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'cambio', 'cambio'])
  })

  it('si afecta a toda su descendencia, también los hijos lo muestran y se filtran', async () => {
    const madre = await alta(ana.cookie, a, vaca())
    const hijo = await alta(
      ana.cookie,
      a,
      vaca({ fechaNacimiento: '2025-03-01', madreId: madre.id, sexo: 'macho', nombre: null }),
    )
    await marcar(madre.id, { apta: false, motivo: 'Paratuberculosis', alcance: 'descendencia' })
    expect((await ficha(hijo.id)).madreNoAptaReposicion).toMatchObject({
      motivo: 'Paratuberculosis',
      alcance: 'descendencia',
    })
    const lista = (await (
      await pedir('GET', `/explotaciones/${a}/animales?reposicion=no_apta`, ana.cookie)
    ).json()) as ConReposicion[]
    expect(lista.map((x) => x.id)).toContain(hijo.id)
  })

  it('pide el motivo, solo en hembras, y una marcada no pasa a macho', async () => {
    const madre = await alta(ana.cookie, a, vaca())
    expect(await campos(await marcar(madre.id, { apta: false }))).toContain('motivo')
    expect(
      await campos(await marcar(madre.id, { apta: false, motivo: 'X', fecha: '2999-01-01' })),
    ).toContain('fecha')
    const toro = await alta(ana.cookie, a, vaca({ sexo: 'macho' }))
    expect(await campos(await marcar(toro.id, { apta: false, motivo: 'Leucosis' }))).toContain(
      'apta',
    )
    await marcar(madre.id, { apta: false, motivo: 'Leucosis' })
    const cambio = await pedir('PATCH', `/explotaciones/${a}/animales/${madre.id}`, ana.cookie, {
      sexo: 'macho',
    })
    expect(await campos(cambio)).toContain('sexo')
    // La base de datos lo impide también
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: ana.id }, (tx) =>
        tx.update(animales).set({ sexo: 'macho' }).where(eq(animales.id, madre.id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'animales_no_apta_reposicion' } })
  })

  it('otra explotación no la marca', async () => {
    const madre = await alta(ana.cookie, a, vaca())
    const res = await pedir(
      'PATCH',
      `/explotaciones/${b}/animales/${madre.id}/reposicion`,
      carla.cookie,
      {
        apta: false,
        motivo: 'Leucosis',
      },
    )
    expect(res.status).toBe(404)
  })
})
