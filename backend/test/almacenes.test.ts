import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { almacenes, historialCambios } from '../src/db/schema/index.js'
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

type Almacen = {
  id: string
  nombre: string
  tipo: string
  unidad: string
  activo: boolean
  stock: number
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

const nombre = () => `Almacén ${randomInt(1e9)}`

const alta = (datos: object = {}, cookie = admin.cookie, explotacion = a) =>
  pedir('POST', `/explotaciones/${explotacion}/almacenes`, cookie, {
    nombre: nombre(),
    tipo: 'pienso',
    unidad: 'kg',
    ...datos,
  })

const lista = async (cookie: string, explotacion: string, filtro = '') =>
  (await (
    await pedir('GET', `/explotaciones/${explotacion}/almacenes${filtro}`, cookie)
  ).json()) as Almacen[]

beforeAll(async () => {
  a = (await nuevaExplotacion('A de comida')).id
  b = (await nuevaExplotacion('B de comida')).id
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

describe('almacenes', () => {
  it('una explotación nueva tiene los almacenes por defecto', async () => {
    const propietario = await nuevoUsuario({ propietario: true })
    const cookie = await iniciarSesion(app, propietario)
    const rega = `ES${String(randomInt(1e12)).padStart(12, '0')}`
    const res = await pedir('POST', '/plataforma/explotaciones', cookie, {
      nombre: 'Con almacenes',
      municipio: 'Lalín',
      provincia: 'Pontevedra',
      rega,
      administrador: { tipo: 'existente', usuario: (await nuevoUsuario()).username },
    })
    expect(res.status).toBe(201)
    const { explotacion } = (await res.json()) as { explotacion: { id: string } }
    const creados = await enExplotacion(
      { explotacionId: explotacion.id, usuarioId: propietario.id },
      (tx) => tx.select().from(almacenes).orderBy(almacenes.id),
    )
    expect(creados.map((x) => [x.nombre, x.tipo, x.unidad])).toEqual([
      ['Pacas de hierba verde', 'hierba_verde', 'unidades'],
      ['Pacas de hierba seca', 'hierba_seca', 'unidades'],
      ['Silo de maíz', 'maiz', 'kg'],
      ['Silo de pienso', 'pienso', 'kg'],
    ])
    expect(creados.every((x) => x.creadoPor === propietario.id)).toBe(true)
  })

  it('el administrador crea, edita, desactiva y reactiva', async () => {
    const res = await alta({ nombre: '  Silo de cebada ', tipo: 'otro' })
    expect(res.status).toBe(201)
    const creado = (await res.json()) as Almacen
    expect(creado).toMatchObject({
      nombre: 'Silo de cebada',
      tipo: 'otro',
      unidad: 'kg',
      activo: true,
      stock: 0,
    })

    const editado = await pedir('PUT', `/explotaciones/${a}/almacenes/${creado.id}`, admin.cookie, {
      nombre: 'Pacas de paja',
      tipo: 'otro',
      unidad: 'unidades',
    })
    expect(((await editado.json()) as Almacen).unidad).toBe('unidades')

    const estado = (activo: boolean) =>
      pedir('PATCH', `/explotaciones/${a}/almacenes/${creado.id}/estado`, admin.cookie, {
        activo,
      })
    expect(((await (await estado(false)).json()) as Almacen).activo).toBe(false)
    expect((await lista(admin.cookie, a, '?activo=true')).map((x) => x.id)).not.toContain(creado.id)
    expect((await lista(admin.cookie, a, '?activo=false')).map((x) => x.id)).toContain(creado.id)
    expect(((await (await estado(true)).json()) as Almacen).activo).toBe(true)

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, creado.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'cambio', 'cambio', 'cambio'])
  })

  it('valida los datos y no repite nombres en la explotación', async () => {
    expect(await campos(await alta({ nombre: ' ' }))).toContain('nombre')
    expect(await campos(await alta({ tipo: 'paja' }))).toContain('tipo')
    expect(await campos(await alta({ unidad: 'litros' }))).toContain('unidad')

    const primero = (await (await alta()).json()) as Almacen
    const repetido = await alta({ nombre: primero.nombre.toUpperCase() })
    expect(repetido.status).toBe(409)
    expect(await codigo(repetido)).toBe('nombre_en_uso')
    // En otra explotación sí puede estar
    expect((await alta({ nombre: primero.nombre }, deB.cookie, b)).status).toBe(201)
  })

  it('el empleado ve el stock, pero no gestiona los almacenes', async () => {
    const creado = (await (await alta()).json()) as Almacen
    expect((await lista(empleado.cookie, a)).map((x) => x.id)).toContain(creado.id)
    const intentos = [
      await alta({}, empleado.cookie),
      await pedir('PUT', `/explotaciones/${a}/almacenes/${creado.id}`, empleado.cookie, {
        nombre: 'Otro',
        tipo: 'pienso',
        unidad: 'kg',
      }),
      await pedir('PATCH', `/explotaciones/${a}/almacenes/${creado.id}/estado`, empleado.cookie, {
        activo: false,
      }),
    ]
    expect(intentos.map((r) => r.status)).toEqual([403, 403, 403])
  })

  it('otra explotación no ve ni toca sus almacenes', async () => {
    const creado = (await (await alta()).json()) as Almacen
    expect((await lista(deB.cookie, b)).map((x) => x.id)).not.toContain(creado.id)
    const ajeno = await pedir(
      'PATCH',
      `/explotaciones/${b}/almacenes/${creado.id}/estado`,
      deB.cookie,
      {
        activo: false,
      },
    )
    expect(ajeno.status).toBe(404)
    expect(await codigo(ajeno)).toBe('almacen_no_encontrado')
  })
})
