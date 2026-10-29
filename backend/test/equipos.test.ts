import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { equipos, historialCambios } from '../src/db/schema/index.js'
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

type Equipo = {
  id: string
  nombre: string
  tipo: string
  descripcion: string | null
  necesitaMantenimiento: boolean
  activo: boolean
}

let a = ''
let b = ''
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

const nombre = () => `Tractor ${randomInt(1e9)}`

const alta = (datos: object = {}, cookie = empleado.cookie, explotacion = a) =>
  pedir('POST', `/explotaciones/${explotacion}/equipos`, cookie, {
    nombre: nombre(),
    tipo: 'maquinaria',
    ...datos,
  })

const lista = async (filtro = '', cookie = empleado.cookie, explotacion = a) =>
  (await (
    await pedir('GET', `/explotaciones/${explotacion}/equipos${filtro}`, cookie)
  ).json()) as Equipo[]

beforeAll(async () => {
  a = (await nuevaExplotacion('A de mantenimiento')).id
  b = (await nuevaExplotacion('B de mantenimiento')).id
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

describe('maquinaria e infraestructuras', () => {
  it('el empleado da de alta, edita, desactiva y reactiva; queda en el historial', async () => {
    const res = await alta({ nombre: '  Tractor John Deere ', descripcion: ' Matrícula E-1234 ' })
    expect(res.status).toBe(201)
    const creado = (await res.json()) as Equipo
    expect(creado).toMatchObject({
      nombre: 'Tractor John Deere',
      tipo: 'maquinaria',
      descripcion: 'Matrícula E-1234',
      necesitaMantenimiento: false,
      activo: true,
    })

    const editado = await pedir(
      'PUT',
      `/explotaciones/${a}/equipos/${creado.id}`,
      empleado.cookie,
      {
        nombre: 'Tractor John Deere',
        tipo: 'maquinaria',
        necesitaMantenimiento: true,
      },
    )
    expect(((await editado.json()) as Equipo).necesitaMantenimiento).toBe(true)

    const estado = (activo: boolean) =>
      pedir('PATCH', `/explotaciones/${a}/equipos/${creado.id}/estado`, empleado.cookie, { activo })
    expect(((await (await estado(false)).json()) as Equipo).activo).toBe(false)
    expect((await lista('?activo=true')).map((x) => x.id)).not.toContain(creado.id)
    expect(((await (await estado(true)).json()) as Equipo).activo).toBe(true)

    const cambios = await enExplotacion({ explotacionId: a, usuarioId: empleado.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, creado.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'cambio', 'cambio', 'cambio'])
  })

  it('lista primero lo que necesita mantenimiento, busca y filtra por tipo', async () => {
    const sufijo = randomInt(1e9)
    const nave = (await (
      await alta({ nombre: `A nave ${sufijo}`, tipo: 'infraestructura', descripcion: 'Cubierta' })
    ).json()) as Equipo
    const remolque = (await (
      await alta({ nombre: `B remolque ${sufijo}`, necesitaMantenimiento: true })
    ).json()) as Equipo
    const suyos = (await lista(`?q=${sufijo}`)).map((x) => x.id)
    expect(suyos).toEqual([remolque.id, nave.id])
    expect((await lista(`?q=${sufijo}&tipo=infraestructura`)).map((x) => x.id)).toEqual([nave.id])
    // También en la descripción
    expect((await lista('?q=Cubierta')).map((x) => x.id)).toContain(nave.id)
  })

  it('valida los datos y no repite nombres en la explotación', async () => {
    expect(await campos(await alta({ nombre: ' ' }))).toContain('nombre')
    expect(await campos(await alta({ tipo: 'vehiculo' }))).toContain('tipo')
    const primero = (await (await alta()).json()) as Equipo
    const repetido = await alta({ nombre: primero.nombre.toUpperCase() })
    expect([repetido.status, await codigo(repetido)]).toEqual([409, 'nombre_en_uso'])
    // En otra explotación sí puede estar
    expect((await alta({ nombre: primero.nombre }, deB.cookie, b)).status).toBe(201)
  })

  it('otra explotación no ve ni toca sus equipos', async () => {
    const creado = (await (await alta()).json()) as Equipo
    expect((await lista('', deB.cookie, b)).map((x) => x.id)).not.toContain(creado.id)
    const ajeno = await pedir('GET', `/explotaciones/${b}/equipos/${creado.id}`, deB.cookie)
    expect([ajeno.status, await codigo(ajeno)]).toEqual([404, 'equipo_no_encontrado'])
    const vistos = await enExplotacion({ explotacionId: b, usuarioId: deB.id }, (tx) =>
      tx.select().from(equipos).where(eq(equipos.id, creado.id)),
    )
    expect(vistos).toEqual([])
  })
})
