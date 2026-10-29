import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { config } from '../src/config.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { animales, facturas, facturasAnimales, historialCambios } from '../src/db/schema/index.js'
import { nifValido, normalizarNif } from '../src/nif.js'
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

type Factura = {
  id: string
  tipo: string
  numero: string
  nif: string
  baseImponible: number
  cuota: number
  total: number
  pagadaEn: string | null
  archivo: { nombre: string; tipo: string; tamano: number } | null
  animales: { id: string; crotal: string | null }[]
}

let a = ''
let b = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }
let deB = { id: '', cookie: '' }
let vaca = ''
let vacaDeB = ''

const ruta = (explotacion = a) => `/explotaciones/${explotacion}/facturas`
const unico = () => Math.random().toString(36).slice(2, 10)
const crotal = () => `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`

// Una compra de pienso con IVA del 10 % y un servicio con el 21 %
const recibida = (datos: object = {}) => ({
  tipo: 'recibida',
  numero: `F-${unico()}`,
  fecha: '2026-03-10',
  tercero: 'Piensos do Norte',
  nif: 'b-15000003',
  concepto: 'Pienso y transporte',
  lineas: [
    { base: 1000, porcentaje: 10, cuota: 100 },
    { base: 50.5, porcentaje: 21, cuota: 10.61 },
  ],
  total: 1161.11,
  ...datos,
})

const nueva = async (datos: object = {}, explotacion = a, cookie = admin.cookie) => {
  const res = await pedir('POST', ruta(explotacion), cookie, recibida(datos))
  expect(res.status).toBe(201)
  return (await res.json()) as Factura
}

const nuevoAnimal = (explotacionId: string, usuarioId: string) =>
  enExplotacion({ explotacionId, usuarioId }, async (tx) => {
    const [animal] = await tx
      .insert(animales)
      .values({
        crotal: crotal(),
        raza: 'Rubia Gallega',
        sexo: 'macho',
        fechaNacimiento: '2024-01-01',
        origen: 'comprado',
        fechaEntrada: '2026-03-10',
        regaOrigen: 'ES150010000001',
      })
      .returning({ id: animales.id })
    return animal?.id ?? ''
  })

const pdf = (texto = 'factura') =>
  new File([`%PDF-1.4\n% ${texto}\n%%EOF`], 'Factura marzo.pdf', { type: 'application/pdf' })
const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], 'foto.png', {
    type: 'image/png',
  })
const conArchivo = (archivo: File) => {
  const formulario = new FormData()
  formulario.set('archivo', archivo)
  return formulario
}
const rutaEnDisco = async (facturaId: string) => {
  const [fila] = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
    tx.select({ ruta: facturas.archivoRuta }).from(facturas).where(eq(facturas.id, facturaId)),
  )
  return fila?.ruta ? join(config.directorioArchivos, fila.ruta) : null
}

beforeAll(async () => {
  a = (await nuevaExplotacion('A facturas')).id
  b = (await nuevaExplotacion('B facturas')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(a, e.id, 'empleado')
  empleado = { id: e.id, cookie: await iniciarSesion(app, e) }
  const v = await nuevoUsuario()
  await hacerMiembro(b, v.id, 'administrador')
  deB = { id: v.id, cookie: await iniciarSesion(app, v) }
  vaca = await nuevoAnimal(a, admin.id)
  vacaDeB = await nuevoAnimal(b, deB.id)
})

afterAll(async () => {
  await pool.end()
})

describe('NIF', () => {
  it('comprueba la letra o el dígito de control de DNI, NIE y entidades', () => {
    expect(normalizarNif(' 12.345.678-z ')).toBe('12345678Z')
    expect(nifValido('12345678Z')).toBe(true)
    expect(nifValido('12345678A')).toBe(false)
    expect(nifValido('X1234567L')).toBe(true)
    expect(nifValido('X1234567A')).toBe(false)
    expect(nifValido('B15000003')).toBe(true)
    expect(nifValido('B15000004')).toBe(false)
    // Los organismos, con letra de control
    expect(nifValido('Q2826000H')).toBe(true)
    expect(nifValido('Q28260008')).toBe(false)
    expect(nifValido('1234')).toBe(false)
  })
})

describe('facturas', () => {
  it('registra una factura recibida con varios tipos de IVA; queda en el historial', async () => {
    const factura = await nueva({ animalIds: [vaca] })
    expect(factura).toMatchObject({
      tipo: 'recibida',
      nif: 'B15000003',
      baseImponible: 1050.5,
      cuota: 110.61,
      total: 1161.11,
      pagadaEn: null,
      archivo: null,
      animales: [{ id: vaca }],
    })
    const cambios = await enExplotacion({ explotacionId: a, usuarioId: admin.id }, (tx) =>
      tx.select().from(historialCambios).where(eq(historialCambios.filaId, factura.id)),
    )
    expect(cambios.map((c) => c.operacion)).toEqual(['alta'])
  })

  it('valida el NIF y que los importes cuadren', async () => {
    const guardar = (datos: object) => pedir('POST', ruta(), admin.cookie, recibida(datos))
    expect(await campos(await guardar({ nif: '12345678A' }))).toContain('nif')
    // Un NIF de otro país no se comprueba
    expect((await guardar({ nif: 'PT 501 964 843', nifExtranjero: true })).status).toBe(201)
    expect(
      await campos(
        await guardar({ lineas: [{ base: 100, porcentaje: 21, cuota: 20 }], total: 120 }),
      ),
    ).toContain('lineas.0.cuota')
    // Un céntimo de margen en la cuota, por el redondeo del proveedor
    expect(
      (await guardar({ lineas: [{ base: 10.05, porcentaje: 21, cuota: 2.12 }], total: 12.17 }))
        .status,
    ).toBe(201)
    expect(await campos(await guardar({ total: 1161.1 }))).toContain('total')
    expect(await campos(await guardar({ lineas: [] }))).toContain('lineas')
    expect(await campos(await guardar({ tercero: ' ' }))).toContain('tercero')
    // Los animales, solo en las recibidas y de la explotación
    expect(await campos(await guardar({ tipo: 'emitida', animalIds: [vaca] }))).toContain(
      'animalIds',
    )
    expect(await campos(await guardar({ animalIds: [vacaDeB] }))).toContain('animalIds')
  })

  it('en las emitidas propone el siguiente número del año y no lo deja repetir', async () => {
    const siguiente = async (fecha: string) =>
      (
        (await (
          await pedir('GET', `${ruta()}/siguiente-numero?fecha=${fecha}`, admin.cookie)
        ).json()) as {
          numero: string
        }
      ).numero
    expect(await siguiente('2027-01-05')).toBe('2027-0001')
    const venta = {
      tipo: 'emitida',
      numero: '2027-0006',
      fecha: '2027-02-01',
      tercero: 'Carnes Galegas',
      nif: '12345678Z',
      impuesto: 'compensacion',
      lineas: [{ base: 2000, porcentaje: 10.5, cuota: 210 }],
      total: 2210,
    }
    await nueva(venta)
    await nueva({ ...venta, numero: 'otra-serie-9' })
    expect(await siguiente('2027-12-31')).toBe('2027-0007')
    expect(await siguiente('2028-01-01')).toBe('2028-0001')
    const repetida = await pedir('POST', ruta(), admin.cookie, recibida({ ...venta }))
    expect(repetida.status).toBe(409)
    expect(await campos(repetida)).toContain('numero')
    // Las recibidas no chocan con las emitidas, ni con las de otro proveedor
    await nueva({ numero: '2027-0006' })
    await nueva({ numero: '2027-0006', nif: '12345678Z' })
    expect(
      (await pedir('POST', ruta(), admin.cookie, recibida({ numero: '2027-0006' }))).status,
    ).toBe(409)
  })

  it('se corrige, se marca como pagada, se filtra y se borra', async () => {
    const tercero = `Veterinaria ${unico()}`
    const factura = await nueva({ tercero, animalIds: [vaca] })
    const corregida = await pedir('PUT', `${ruta()}/${factura.id}`, admin.cookie, {
      ...recibida({ tercero, numero: factura.numero }),
      lineas: [{ base: 80, porcentaje: 21, cuota: 16.8 }],
      total: 96.8,
    })
    expect(corregida.status).toBe(200)
    expect(await corregida.json()).toMatchObject({ total: 96.8, animales: [] })

    const pagada = await pedir('PATCH', `${ruta()}/${factura.id}/pago`, admin.cookie, {
      pagadaEn: '2026-03-20',
    })
    expect(((await pagada.json()) as Factura).pagadaEn).toBe('2026-03-20')
    const lista = async (filtros: string) =>
      ((await (await pedir('GET', `${ruta()}?${filtros}`, admin.cookie)).json()) as Factura[]).map(
        (f) => f.id,
      )
    expect(await lista(`q=${encodeURIComponent(tercero.toLowerCase())}`)).toEqual([factura.id])
    expect(await lista(`q=${encodeURIComponent(tercero)}&estado=pendiente`)).toEqual([])
    expect(await lista(`q=${encodeURIComponent(tercero)}&tipo=emitida`)).toEqual([])
    expect(await lista(`q=${encodeURIComponent(tercero)}&desde=2026-03-11`)).toEqual([])
    await pedir('PATCH', `${ruta()}/${factura.id}/pago`, admin.cookie, { pagadaEn: null })
    expect(await lista(`q=${encodeURIComponent(tercero)}&estado=pendiente`)).toEqual([factura.id])

    expect((await pedir('DELETE', `${ruta()}/${factura.id}`, admin.cookie)).status).toBe(204)
    expect((await pedir('GET', `${ruta()}/${factura.id}`, admin.cookie)).status).toBe(404)
  })

  it('lleva un archivo: PDF o foto de hasta 10 MB, que se cambia, se descarga y se quita', async () => {
    const factura = await nueva()
    const archivo = `${ruta()}/${factura.id}/archivo`
    const subida = await pedir('PUT', archivo, admin.cookie, conArchivo(pdf()))
    expect(subida.status).toBe(200)
    expect(((await subida.json()) as Factura).archivo).toMatchObject({
      nombre: 'Factura marzo.pdf',
      tipo: 'application/pdf',
    })
    const primero = await rutaEnDisco(factura.id)
    expect(primero && existsSync(primero)).toBe(true)

    const descarga = await pedir('GET', archivo, admin.cookie)
    expect(descarga.status).toBe(200)
    expect(descarga.headers.get('content-type')).toBe('application/pdf')
    expect(await descarga.text()).toContain('% factura')

    // Al cambiarlo, el anterior se borra
    const cambio = await pedir('PUT', archivo, admin.cookie, conArchivo(png()))
    expect(((await cambio.json()) as Factura).archivo?.tipo).toBe('image/png')
    expect(existsSync(primero ?? '')).toBe(false)

    // Se reconoce por el contenido, no por el nombre ni por lo que dice el navegador
    const falso = new File(['hola'], 'factura.pdf', { type: 'application/pdf' })
    expect((await pedir('PUT', archivo, admin.cookie, conArchivo(falso))).status).toBe(415)
    const grande = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf')
    expect((await pedir('PUT', archivo, admin.cookie, conArchivo(grande))).status).toBe(413)
    expect((await pedir('PUT', archivo, admin.cookie, new FormData())).status).toBe(400)

    const segundo = await rutaEnDisco(factura.id)
    const sinArchivo = await pedir('DELETE', archivo, admin.cookie)
    expect(((await sinArchivo.json()) as Factura).archivo).toBeNull()
    expect(existsSync(segundo ?? '')).toBe(false)
    expect((await pedir('GET', archivo, admin.cookie)).status).toBe(404)

    // Al borrar la factura, también su archivo
    await pedir('PUT', archivo, admin.cookie, conArchivo(pdf()))
    const tercero = await rutaEnDisco(factura.id)
    await pedir('DELETE', `${ruta()}/${factura.id}`, admin.cookie)
    expect(existsSync(tercero ?? '')).toBe(false)
  })

  it('solo el administrador las ve; otra explotación no ve ni toca las suyas', async () => {
    const factura = await nueva()
    expect((await pedir('GET', ruta(), empleado.cookie)).status).toBe(403)
    expect((await pedir('POST', ruta(), empleado.cookie, recibida())).status).toBe(403)
    expect((await pedir('GET', `${ruta()}/${factura.id}`, deB.cookie)).status).toBe(404)
    expect((await pedir('GET', `${ruta(b)}/${factura.id}`, deB.cookie)).status).toBe(404)
    expect((await pedir('DELETE', `${ruta(b)}/${factura.id}`, deB.cookie)).status).toBe(404)
    expect(
      (await (await pedir('GET', ruta(b), deB.cookie)).json()) as Factura[],
    ).not.toContainEqual(expect.objectContaining({ id: factura.id }))
    const actualizadas = await enExplotacion({ explotacionId: b, usuarioId: deB.id }, (tx) =>
      tx.update(facturas).set({ concepto: 'otro' }).where(eq(facturas.id, factura.id)).returning(),
    )
    expect(actualizadas).toHaveLength(0)
  })
})

describe('restricciones de la base de datos', () => {
  const comoAdmin = <T>(fn: Parameters<typeof enExplotacion<T>>[1]) =>
    enExplotacion({ explotacionId: a, usuarioId: admin.id }, fn)

  it('el total es la suma, el NIF tiene formato y las emitidas no llevan animales', async () => {
    const valores = {
      tipo: 'recibida' as const,
      numero: `F-${unico()}`,
      fecha: '2026-01-01',
      tercero: 'Proveedor',
      nif: '12345678Z',
      concepto: 'Algo',
      lineas: [{ base: 100, porcentaje: 21, cuota: 21 }],
      baseImponible: 100,
      cuota: 21,
      total: 121,
    }
    await expect(
      comoAdmin((tx) => tx.insert(facturas).values({ ...valores, total: 120 })),
    ).rejects.toMatchObject({ cause: { constraint: 'facturas_total' } })
    await expect(
      comoAdmin((tx) => tx.insert(facturas).values({ ...valores, nif: 'no vale' })),
    ).rejects.toMatchObject({ cause: { constraint: 'facturas_nif' } })

    const emitida = await nueva({
      tipo: 'emitida',
      numero: `E-${unico()}`,
      lineas: [{ base: 100, porcentaje: 21, cuota: 21 }],
      total: 121,
    })
    await expect(
      comoAdmin((tx) =>
        tx.insert(facturasAnimales).values({ facturaId: emitida.id, animalId: vaca }),
      ),
    ).rejects.toMatchObject({ cause: { code: '23514', constraint: 'facturas_animales_recibida' } })
    const compra = await nueva({ animalIds: [vaca] })
    await expect(
      comoAdmin((tx) =>
        tx.update(facturas).set({ tipo: 'emitida' }).where(eq(facturas.id, compra.id)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'facturas_animales_recibida' } })
    // Ni animales de otra explotación
    await expect(
      comoAdmin((tx) =>
        tx.insert(facturasAnimales).values({ facturaId: compra.id, animalId: vacaDeB }),
      ),
    ).rejects.toMatchObject({ cause: { code: '23503' } })
  })
})
