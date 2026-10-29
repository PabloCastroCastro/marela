import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { config } from '../src/config.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { apuntes, historialCambios } from '../src/db/schema/index.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()

const pedir = (metodo: string, ruta: string, cookie: string, cuerpo?: object | FormData) =>
  Promise.resolve(
    app.request(`/api${ruta}`, {
      method: metodo,
      headers: {
        cookie,
        origin: ORIGEN,
        ...(cuerpo && !(cuerpo instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      },
      body: cuerpo instanceof FormData ? cuerpo : cuerpo ? JSON.stringify(cuerpo) : undefined,
    }),
  )

const campos = async (res: Response) =>
  ((await res.json()) as { error: { detalles?: { campo: string }[] } }).error.detalles?.map(
    (d) => d.campo,
  ) ?? []

type Apunte = {
  id: string
  tipo: string
  categoria: string
  importe: number
  concepto: string
  archivo: { nombre: string } | null
  anulacion: { en: string; por: string; motivo: string } | null
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }

const ruta = (explotacion = a) => `/explotaciones/${explotacion}/apuntes`
const unico = () => Math.random().toString(36).slice(2, 10)

const pac = (datos: object = {}) => ({
  tipo: 'ingreso',
  categoria: 'subvencion',
  fecha: '2026-10-20',
  concepto: `Pago básico de la PAC ${unico()}`,
  importe: 3250.404,
  ...datos,
})

const nuevo = async (datos: object = {}) => {
  const res = await pedir('POST', ruta(), admin.cookie, pac(datos))
  expect(res.status).toBe(201)
  return (await res.json()) as Apunte
}

const conArchivo = (archivo: File) => {
  const formulario = new FormData()
  formulario.set('archivo', archivo)
  return formulario
}

beforeAll(async () => {
  a = (await nuevaExplotacion('A apuntes')).id
  b = (await nuevaExplotacion('B apuntes')).id
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

describe('otros ingresos y gastos', () => {
  it('registra un ingreso sin factura, con el importe al céntimo; queda en el historial', async () => {
    const apunte = await nuevo({ observaciones: '  Resolución de octubre  ' })
    expect(apunte).toMatchObject({
      tipo: 'ingreso',
      categoria: 'subvencion',
      importe: 3250.4,
      observaciones: 'Resolución de octubre',
      archivo: null,
      anulacion: null,
    })
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, apunte.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta'])
  })

  it('valida el tipo, la categoría de ese tipo, el concepto y el importe', async () => {
    const guardar = (datos: object) => pedir('POST', ruta(), admin.cookie, pac(datos))
    expect(await campos(await guardar({ tipo: 'gasto' }))).toContain('categoria')
    expect(await campos(await guardar({ categoria: 'combustible' }))).toContain('categoria')
    expect(await campos(await guardar({ concepto: ' ' }))).toContain('concepto')
    expect(await campos(await guardar({ importe: 0 }))).toContain('importe')
    expect(await campos(await guardar({ importe: -5 }))).toContain('importe')
    expect(
      (await guardar({ tipo: 'gasto', categoria: 'combustible', concepto: 'Gasóleo' })).status,
    ).toBe(201)
  })

  it('se corrige, se filtra y se anula con motivo; anulado, sigue a la vista y no cambia', async () => {
    const concepto = `Seguro del tractor ${unico()}`
    const apunte = await nuevo({ tipo: 'gasto', categoria: 'seguro', concepto, importe: 420 })
    const corregido = await pedir('PUT', `${ruta()}/${apunte.id}`, admin.cookie, {
      ...pac({ tipo: 'gasto', categoria: 'seguro', concepto, importe: 410.5 }),
    })
    expect(((await corregido.json()) as Apunte).importe).toBe(410.5)

    const lista = async (filtros: string) =>
      ((await (await pedir('GET', `${ruta()}?${filtros}`, admin.cookie)).json()) as Apunte[]).map(
        (x) => x.id,
      )
    const q = `q=${encodeURIComponent(concepto.toLowerCase())}`
    expect(await lista(q)).toEqual([apunte.id])
    expect(await lista(`${q}&tipo=ingreso`)).toEqual([])
    expect(await lista(`${q}&categoria=seguro&desde=2026-10-01&hasta=2026-10-31`)).toEqual([
      apunte.id,
    ])

    expect(
      await campos(
        await pedir('POST', `${ruta()}/${apunte.id}/anulacion`, admin.cookie, { motivo: ' ' }),
      ),
    ).toContain('motivo')
    const anulado = await pedir('POST', `${ruta()}/${apunte.id}/anulacion`, admin.cookie, {
      motivo: 'Estaba repetido',
    })
    expect(((await anulado.json()) as Apunte).anulacion).toMatchObject({
      motivo: 'Estaba repetido',
    })
    expect(await lista(`${q}&estado=vigente`)).toEqual([])
    expect(await lista(`${q}&estado=anulado`)).toEqual([apunte.id])
    expect(
      (await pedir('PUT', `${ruta()}/${apunte.id}`, admin.cookie, pac({ concepto }))).status,
    ).toBe(409)
    expect(
      (
        await pedir('POST', `${ruta()}/${apunte.id}/anulacion`, admin.cookie, {
          motivo: 'Otra vez',
        })
      ).status,
    ).toBe(409)
    // No se borra
    expect((await pedir('DELETE', `${ruta()}/${apunte.id}`, admin.cookie)).status).toBe(404)
  })

  it('lleva un archivo opcional, que se cambia, se descarga y se quita', async () => {
    const apunte = await nuevo()
    const archivo = `${ruta()}/${apunte.id}/archivo`
    const ticket = new File(['%PDF-1.4\n% ticket\n%%EOF'], 'ticket.pdf', {
      type: 'application/pdf',
    })
    const subida = await pedir('PUT', archivo, admin.cookie, conArchivo(ticket))
    expect(((await subida.json()) as Apunte).archivo).toMatchObject({ nombre: 'ticket.pdf' })
    const [fila] = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select({ ruta: apuntes.archivoRuta }).from(apuntes).where(eq(apuntes.id, apunte.id)),
    )
    const enDisco = join(config.directorioArchivos, fila?.ruta ?? '')
    expect(fila?.ruta).toMatch(new RegExp(`^${a}/apuntes/`))
    expect(existsSync(enDisco)).toBe(true)

    const descarga = await pedir('GET', archivo, admin.cookie)
    expect(descarga.headers.get('content-type')).toBe('application/pdf')
    expect(await descarga.text()).toContain('% ticket')
    const falso = new File(['hola'], 'ticket.pdf', { type: 'application/pdf' })
    expect((await pedir('PUT', archivo, admin.cookie, conArchivo(falso))).status).toBe(415)

    const sin = await pedir('DELETE', archivo, admin.cookie)
    expect(((await sin.json()) as Apunte).archivo).toBeNull()
    expect(existsSync(enDisco)).toBe(false)
  })

  it('solo el administrador; otra explotación no ve ni toca los suyos', async () => {
    const apunte = await nuevo()
    expect((await pedir('GET', ruta(), empleado.cookie)).status).toBe(403)
    expect((await pedir('POST', ruta(), empleado.cookie, pac())).status).toBe(403)
    expect((await pedir('GET', `${ruta()}/${apunte.id}`, deB.cookie)).status).toBe(404)
    expect((await pedir('GET', `${ruta(b)}/${apunte.id}`, deB.cookie)).status).toBe(404)
    expect(
      (await pedir('POST', `${ruta(b)}/${apunte.id}/anulacion`, deB.cookie, { motivo: 'x' }))
        .status,
    ).toBe(404)
    const cambiados = await enExplotacion({ explotacionId: b, usuarioId: deB.id }, (tx) =>
      tx.update(apuntes).set({ concepto: 'otro' }).where(eq(apuntes.id, apunte.id)).returning(),
    )
    expect(cambiados).toHaveLength(0)
  })

  it('la base de datos comprueba la categoría del tipo, el importe y la anulación', async () => {
    const insertar = (datos: Partial<typeof apuntes.$inferInsert>) =>
      enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
        tx.insert(apuntes).values({
          tipo: 'gasto',
          categoria: 'combustible',
          fecha: '2026-10-01',
          concepto: 'Gasóleo',
          importe: 80,
          ...datos,
        }),
      )
    await expect(insertar({ categoria: 'subvencion' })).rejects.toMatchObject({
      cause: { constraint: 'apuntes_categoria' },
    })
    await expect(insertar({ importe: 0 })).rejects.toMatchObject({
      cause: { constraint: 'apuntes_importe' },
    })
    await expect(insertar({ anuladoEn: new Date() })).rejects.toMatchObject({
      cause: { constraint: 'apuntes_anulacion' },
    })
  })
})
