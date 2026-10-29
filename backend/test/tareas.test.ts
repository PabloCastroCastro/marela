import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { historialCambios, tareas } from '../src/db/schema/index.js'
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

type Tarea = {
  id: string
  titulo: string
  equipo: { id: string; nombre: string } | null
  prioridad: string
  fechaLimite: string | null
  asignadaA: { id: string; nombre: string } | null
  hecha: { en: string; por: { id: string } } | null
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let otro = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }
let bebedero = ''

const rutaTareas = (explotacion = a) => `/explotaciones/${explotacion}/tareas`
const nueva = (datos: object = {}, cookie = empleado.cookie, explotacion = a) =>
  pedir('POST', rutaTareas(explotacion), cookie, {
    titulo: `Cambiar la boya ${randomInt(1e9)}`,
    ...datos,
  })
const lista = async (filtro = '', cookie = empleado.cookie) =>
  (await (await pedir('GET', `${rutaTareas()}${filtro}`, cookie)).json()) as Tarea[]

beforeAll(async () => {
  a = (await nuevaExplotacion('A de tareas')).id
  b = (await nuevaExplotacion('B de tareas')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(a, e.id, 'empleado')
  empleado = { id: e.id, cookie: await iniciarSesion(app, e) }
  const o = await nuevoUsuario()
  await hacerMiembro(a, o.id, 'empleado')
  otro = { id: o.id, cookie: await iniciarSesion(app, o) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  deB = { id: v.id, cookie: await iniciarSesion(app, v) }
  const res = await pedir('POST', `/explotaciones/${a}/equipos`, empleado.cookie, {
    nombre: `Bebedero ${randomInt(1e9)}`,
    tipo: 'infraestructura',
  })
  bebedero = ((await res.json()) as { id: string }).id
})

afterAll(async () => {
  await pool.end()
})

describe('tareas de mantenimiento', () => {
  it('el empleado da de alta una tarea de un equipo; el administrador se la asigna a alguien', async () => {
    const res = await nueva({
      titulo: ' Cambiar la boya ',
      equipoId: bebedero,
      descripcion: 'Pierde agua',
      fechaLimite: '2026-11-15',
      prioridad: 'alta',
    })
    expect(res.status).toBe(201)
    const tarea = (await res.json()) as Tarea
    expect(tarea).toMatchObject({
      titulo: 'Cambiar la boya',
      equipo: { id: bebedero },
      prioridad: 'alta',
      fechaLimite: '2026-11-15',
      asignadaA: null,
      hecha: null,
    })

    // El empleado no asigna
    const sinPermiso = await nueva({ asignadaAId: otro.id })
    expect([sinPermiso.status, await codigo(sinPermiso)]).toEqual([403, 'sin_permiso'])
    const cambio = { titulo: 'Cambiar la boya', equipoId: bebedero, asignadaAId: otro.id }
    expect(
      (await pedir('PUT', `${rutaTareas()}/${tarea.id}`, empleado.cookie, cambio)).status,
    ).toBe(403)
    // El administrador sí
    const asignada = await pedir('PUT', `${rutaTareas()}/${tarea.id}`, admin.cookie, cambio)
    expect(((await asignada.json()) as Tarea).asignadaA?.id).toBe(otro.id)
    // Y el empleado la sigue corrigiendo sin tocar a quién está asignada
    const corregida = await pedir('PUT', `${rutaTareas()}/${tarea.id}`, empleado.cookie, {
      ...cambio,
      titulo: 'Cambiar la boya y la llave',
    })
    expect(((await corregida.json()) as Tarea).titulo).toBe('Cambiar la boya y la llave')

    // El equipo cuenta su tarea pendiente
    const equipo = (await (
      await pedir('GET', `/explotaciones/${a}/equipos/${bebedero}`, empleado.cookie)
    ).json()) as { tareasPendientes: number }
    expect(equipo.tareasPendientes).toBeGreaterThan(0)
  })

  it('"mis tareas": las mías y las sin asignar; se marcan como hechas y vuelven a pendientes', async () => {
    const mia = (await (await nueva({ asignadaAId: otro.id }, admin.cookie)).json()) as Tarea
    const suelta = (await (await nueva()).json()) as Tarea
    const deOtro = (await (await nueva({ asignadaAId: admin.id }, admin.cookie)).json()) as Tarea
    const mias = (await lista('?para=mi&estado=pendiente', otro.cookie)).map((t) => t.id)
    expect(mias).toEqual(expect.arrayContaining([mia.id, suelta.id]))
    expect(mias).not.toContain(deOtro.id)

    const hecha = await pedir('PATCH', `${rutaTareas()}/${mia.id}/hecha`, otro.cookie, {
      hecha: true,
    })
    expect(((await hecha.json()) as Tarea).hecha?.por.id).toBe(otro.id)
    expect((await lista('?estado=pendiente', otro.cookie)).map((t) => t.id)).not.toContain(mia.id)
    expect((await lista('?estado=hecha', otro.cookie)).map((t) => t.id)).toContain(mia.id)
    const deNuevo = await pedir('PATCH', `${rutaTareas()}/${mia.id}/hecha`, otro.cookie, {
      hecha: false,
    })
    expect(((await deNuevo.json()) as Tarea).hecha).toBeNull()
  })

  it('ordena las pendientes por fecha límite y prioridad, y filtra por equipo', async () => {
    const equipo = (
      (await (
        await pedir('POST', `/explotaciones/${a}/equipos`, empleado.cookie, {
          nombre: `Tractor ${randomInt(1e9)}`,
          tipo: 'maquinaria',
        })
      ).json()) as { id: string }
    ).id
    const sinFecha = (await (await nueva({ equipoId: equipo })).json()) as Tarea
    const tarde = (await (
      await nueva({ equipoId: equipo, fechaLimite: '2026-12-01' })
    ).json()) as Tarea
    const pronto = (await (
      await nueva({ equipoId: equipo, fechaLimite: '2026-11-01', prioridad: 'baja' })
    ).json()) as Tarea
    const prontoAlta = (await (
      await nueva({ equipoId: equipo, fechaLimite: '2026-11-01', prioridad: 'alta' })
    ).json()) as Tarea
    expect((await lista(`?equipoId=${equipo}`)).map((t) => t.id)).toEqual([
      prontoAlta.id,
      pronto.id,
      tarde.id,
      sinFecha.id,
    ])
  })

  it('valida, se borra y queda en el historial', async () => {
    expect(await campos(await nueva({ titulo: ' ' }))).toContain('titulo')
    expect(await campos(await nueva({ prioridad: 'urgente' }))).toContain('prioridad')
    const equipoDeB = (
      (await (
        await pedir('POST', `/explotaciones/${b}/equipos`, deB.cookie, {
          nombre: 'Tractor',
          tipo: 'maquinaria',
        })
      ).json()) as { id: string }
    ).id
    expect(await campos(await nueva({ equipoId: equipoDeB }))).toContain('equipoId')
    expect(await campos(await nueva({ asignadaAId: deB.id }, admin.cookie))).toContain(
      'asignadaAId',
    )

    const tarea = (await (await nueva()).json()) as Tarea
    const borrada = await pedir('DELETE', `${rutaTareas()}/${tarea.id}`, empleado.cookie)
    expect(((await borrada.json()) as Tarea).id).toBe(tarea.id)
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, tarea.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta', 'borrado'])
  })

  it('otra explotación no ve ni toca sus tareas, y la base de datos lo impide también', async () => {
    const tarea = (await (await nueva()).json()) as Tarea
    expect(
      (await pedir('PATCH', `${rutaTareas(b)}/${tarea.id}/hecha`, deB.cookie, { hecha: true }))
        .status,
    ).toBe(404)
    await expect(
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx.update(tareas).set({ asignadaAId: deB.id }).where(eq(tareas.id, tarea.id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'tareas_asignada_miembro' } })
  })

  it('da las personas del equipo para asignar', async () => {
    const personas = (await (
      await pedir('GET', `${rutaTareas()}/personas`, admin.cookie)
    ).json()) as { id: string }[]
    expect(personas.map((p) => p.id)).toEqual(
      expect.arrayContaining([admin.id, empleado.id, otro.id]),
    )
    expect(personas.map((p) => p.id)).not.toContain(deB.id)
  })
})
