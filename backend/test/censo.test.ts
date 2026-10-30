import { eq, inArray } from 'drizzle-orm'
import { PDFDocument, type PDFFont, StandardFonts } from 'pdf-lib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { animales } from '../src/db/schema/index.js'
import {
  hacerMiembro,
  iniciarSesion,
  nuevaExplotacion,
  nuevoUsuario,
  ORIGEN,
} from './utilidades.js'

const app = crearApp()

const pedir = (ruta: string, cookie: string, cuerpo: FormData) =>
  Promise.resolve(
    app.request(`/api${ruta}`, {
      method: 'POST',
      headers: { cookie, origin: ORIGEN },
      body: cuerpo,
    }),
  )

const crotal = () => `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`

// Un censo a una fecha como el de la Xunta, con datos inventados: la cabecera de la explotación, la
// tabla de animales (en varias páginas, con su cabecera en cada una) y el resumen con el total. Las
// cabeceras de la tabla van centradas y las celdas a la izquierda, como en el PDF real.
type Fila = [
  crotal: string,
  sexo: string,
  raza: string,
  nacimiento: string,
  rega: string,
  madre: string,
]

const COLUMNAS: [titulo: string, x: number, ancho: number][] = [
  ['Crotal/NPU', 30, 110],
  ['Sexo', 140, 50],
  ['Raza', 190, 110],
  ['Nacemento', 300, 70],
  ['Expl. Nacem.', 370, 100],
  ['Crotal da nai', 470, 100],
]

async function pdfCenso(datos: { rega: string; fecha: string; paginas: Fila[][]; total: number }) {
  const pdf = await PDFDocument.create()
  const fuente = await pdf.embedFont(StandardFonts.Helvetica)
  const escribir = (pagina: ReturnType<typeof pdf.addPage>, texto: string, x: number, y: number) =>
    pagina.drawText(texto, { x, y, size: 8, font: fuente })
  const centrado = (f: PDFFont, texto: string, x: number, ancho: number) =>
    x + (ancho - f.widthOfTextAtSize(texto, 8)) / 2

  datos.paginas.forEach((filas, n) => {
    const pagina = pdf.addPage([595, 842])
    escribir(pagina, 'Censo a unha data', 30, 800)
    // Etiqueta y valor separados, como en el PDF real
    escribir(pagina, 'REGA', 30, 760)
    escribir(pagina, datos.rega, 80, 760)
    escribir(pagina, 'Cl. Zootécnica', 200, 760)
    escribir(pagina, 'Censo a', 450, 760)
    escribir(pagina, datos.fecha, 500, 760)
    let y = 720
    for (const [titulo, x, ancho] of COLUMNAS) {
      escribir(pagina, titulo, centrado(fuente, titulo, x, ancho), y)
    }
    for (const fila of filas) {
      y -= 15
      fila.forEach((celda, i) => {
        const columna = COLUMNAS[i]
        if (celda && columna) escribir(pagina, celda, columna[1] + 4, y)
      })
    }
    if (n === datos.paginas.length - 1) {
      escribir(pagina, 'RAZA', 30, y - 40)
      const totales = ['TOTAIS', '1', '0,40', '0', '0,00', String(datos.total), '9,99']
      totales.forEach((t, i) => {
        escribir(pagina, t, 30 + i * 60, y - 60)
      })
    }
  })
  return new File([new Uint8Array(await pdf.save())], 'censo.pdf', { type: 'application/pdf' })
}

const formulario = (archivo: File) => {
  const f = new FormData()
  f.set('archivo', archivo)
  return f
}

let explotacion: { id: string; rega: string }
let admin: { id: string; cookie: string }
let empleado: { cookie: string }
let otra: { id: string; adminId: string }

// Ya en la aplicación: una madre (en el censo, con otra raza), y un activo que no está en el censo
const madreEnApp = crotal()
const fueraDelCenso = crotal()
// Nuevos: una madre que está en la segunda página, sus crías en la primera, y un comprado
const madreEnCenso = crotal()
const cria = crotal()
const criaDeMadreApp = crotal()
const comprado = crotal()
const madreDesconocida = crotal()
const sinMadre = crotal()

const insertar = (
  explotacionId: string,
  usuarioId: string,
  datos: { crotal: string; sexo: 'hembra' | 'macho'; raza: string },
) =>
  enExplotacion({ explotacionId, usuarioId }, (tx) =>
    tx.insert(animales).values({ ...datos, fechaNacimiento: '2020-03-01' }),
  )

beforeAll(async () => {
  explotacion = await nuevaExplotacion('Censo')
  const u = await nuevoUsuario()
  await hacerMiembro(explotacion.id, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(explotacion.id, e.id, 'empleado')
  empleado = { cookie: await iniciarSesion(app, e) }
  await insertar(explotacion.id, admin.id, { crotal: madreEnApp, sexo: 'hembra', raza: 'Limusina' })
  await insertar(explotacion.id, admin.id, {
    crotal: fueraDelCenso,
    sexo: 'macho',
    raza: 'Cruzada',
  })
  const o = await nuevaExplotacion('Otra')
  const ou = await nuevoUsuario()
  await hacerMiembro(o.id, ou.id, 'administrador')
  otra = { id: o.id, adminId: ou.id }
})

afterAll(async () => {
  await pool.end()
})

const censo = (cambios: { rega?: string; total?: number; filas?: Fila[] } = {}) =>
  pdfCenso({
    rega: cambios.rega ?? explotacion.rega,
    fecha: '01/10/26',
    total: cambios.total ?? 6,
    paginas: cambios.filas
      ? [cambios.filas]
      : [
          [
            [cria, 'Femia', 'Conxunto Mestizo', '15/03/2026', explotacion.rega, madreEnCenso],
            [criaDeMadreApp, 'Macho', 'Rubia Galega', '02/04/2026', explotacion.rega, madreEnApp],
            [comprado, 'Femia', 'Frisona', '10/05/2024', 'ES150410193801', madreDesconocida],
          ],
          [
            [madreEnCenso, 'Femia', 'Rubia Galega', '19/08/2015', explotacion.rega, ''],
            [madreEnApp, 'Femia', 'Rubia Galega', '01/03/2020', explotacion.rega, ''],
            // Sin madre en la última fila de la tabla
            [sinMadre, 'Macho', 'Rubia Galega', '01/01/2025', explotacion.rega, ''],
          ],
        ],
  })

const ruta = (accion: string, id = explotacion.id) => `/explotaciones/${id}/censo/${accion}`

const cuantos = () =>
  enExplotacion({ explotacionId: explotacion.id, usuarioId: admin.id }, (tx) =>
    tx.select({ id: animales.id }).from(animales),
  ).then((filas) => filas.length)

type Vista = {
  fecha: string
  total: number
  nuevos: {
    crotal: string
    sexo: string
    raza: string
    fechaNacimiento: string
    origen: string
    fechaEntrada: string | null
    regaOrigen: string | null
    madre: { crotal: string; enCenso: boolean; id: string | null } | null
    madreTexto: string | null
    observaciones: string | null
  }[]
  existentes: {
    crotal: string
    diferencias: { campo: string; censo: string; aplicacion: string }[]
  }[]
  ausentes: { crotal: string }[]
}

describe('censo en PDF', () => {
  it('la vista previa dice qué se dará de alta, qué ya está y qué falta, sin cambiar nada', async () => {
    const antes = await cuantos()
    const res = await pedir(ruta('vista-previa'), admin.cookie, formulario(await censo()))
    expect(res.status).toBe(200)
    const vista = (await res.json()) as Vista
    expect(vista).toMatchObject({ fecha: '2026-10-01', total: 6 })
    expect(vista.nuevos).toHaveLength(5)
    const nuevo = (c: string) => vista.nuevos.find((n) => n.crotal === c)

    // Nacida aquí, con la raza traducida y su madre del censo (en otra página)
    expect(nuevo(cria)).toMatchObject({
      sexo: 'hembra',
      raza: 'Cruzada',
      fechaNacimiento: '2026-03-15',
      origen: 'nacido',
      fechaEntrada: null,
      madre: { crotal: madreEnCenso, enCenso: true, id: null },
      madreTexto: null,
    })
    expect(nuevo(criaDeMadreApp)?.madre).toMatchObject({ crotal: madreEnApp, enCenso: false })
    expect(nuevo(criaDeMadreApp)?.madre?.id).toBeTruthy()
    // De otra explotación: comprado, con la fecha del censo como entrada; la madre, como texto
    expect(nuevo(comprado)).toMatchObject({
      raza: 'Frisona',
      origen: 'comprado',
      fechaEntrada: '2026-10-01',
      regaOrigen: 'ES150410193801',
      madre: null,
      madreTexto: madreDesconocida,
    })
    expect(nuevo(comprado)?.observaciones).toContain('01/10/2026')

    // La que ya estaba: no se toca, pero se dice qué no coincide
    expect(vista.existentes).toEqual([
      {
        id: expect.any(String),
        crotal: madreEnApp,
        diferencias: [{ campo: 'raza', censo: 'Rubia Gallega', aplicacion: 'Limusina' }],
      },
    ])
    expect(vista.ausentes.map((a) => a.crotal)).toEqual([fueraDelCenso])
    expect(await cuantos()).toBe(antes)
  })

  it('solo el administrador', async () => {
    const res = await pedir(ruta('vista-previa'), empleado.cookie, formulario(await censo()))
    expect(res.status).toBe(403)
  })

  it('rechaza un censo de otra explotación, incompleto, sin tabla o que no es un PDF', async () => {
    const error = async (archivo: File) => {
      const res = await pedir(ruta('vista-previa'), admin.cookie, formulario(archivo))
      return [res.status, ((await res.json()) as { error: { codigo: string } }).error.codigo]
    }
    expect(await error(await censo({ rega: 'ES000000000001' }))).toEqual([
      422,
      'censo_de_otra_explotacion',
    ])
    expect(await error(await censo({ total: 7 }))).toEqual([422, 'censo_incompleto'])
    expect(await error(await censo({ filas: [] }))).toEqual([422, 'censo_no_reconocido'])
    const fechaMala: Fila = [crotal(), 'Femia', 'Rubia Galega', '31/02/2024', explotacion.rega, '']
    expect(await error(await censo({ filas: [fechaMala], total: 1 }))).toEqual([
      422,
      'censo_no_reconocido',
    ])
    expect(await error(new File(['hola'], 'censo.pdf', { type: 'application/pdf' }))).toEqual([
      415,
      'tipo_de_archivo',
    ])
  })

  it('si un crotal está en otra explotación, no importa nada', async () => {
    const ajeno = crotal()
    await insertar(otra.id, otra.adminId, { crotal: ajeno, sexo: 'hembra', raza: 'Cruzada' })
    const filas: Fila[] = [
      [crotal(), 'Femia', 'Rubia Galega', '01/01/2025', explotacion.rega, ''],
      [ajeno, 'Femia', 'Rubia Galega', '01/01/2025', explotacion.rega, ''],
    ]
    const antes = await cuantos()
    const res = await pedir(
      ruta('importacion'),
      admin.cookie,
      formulario(await censo({ filas, total: 2 })),
    )
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { mensaje: string } }).error.mensaje).toContain(ajeno)
    expect(await cuantos()).toBe(antes)
  })

  it('importa los nuevos con sus madres enlazadas; una segunda vez no añade nada', async () => {
    const antes = await cuantos()
    const res = await pedir(ruta('importacion'), admin.cookie, formulario(await censo()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ creados: 5, fecha: '2026-10-01' })
    expect(await cuantos()).toBe(antes + 5)

    const filas = await enExplotacion(
      { explotacionId: explotacion.id, usuarioId: admin.id },
      (tx) =>
        tx
          .select({
            id: animales.id,
            crotal: animales.crotal,
            raza: animales.raza,
            madreId: animales.madreId,
            madreTexto: animales.madreTexto,
            origen: animales.origen,
            fechaEntrada: animales.fechaEntrada,
          })
          .from(animales)
          .where(
            inArray(animales.crotal, [cria, criaDeMadreApp, comprado, madreEnCenso, madreEnApp]),
          ),
    )
    const fila = (c: string) => filas.find((f) => f.crotal === c)
    expect(fila(cria)?.madreId).toBe(fila(madreEnCenso)?.id)
    expect(fila(criaDeMadreApp)?.madreId).toBe(fila(madreEnApp)?.id)
    expect(fila(comprado)).toMatchObject({
      origen: 'comprado',
      fechaEntrada: '2026-10-01',
      madreId: null,
      madreTexto: madreDesconocida,
    })
    // La que ya estaba no se ha tocado
    expect(fila(madreEnApp)?.raza).toBe('Limusina')

    const otraVez = await pedir(ruta('importacion'), admin.cookie, formulario(await censo()))
    expect(await otraVez.json()).toEqual({ creados: 0, fecha: '2026-10-01' })
    expect(await cuantos()).toBe(antes + 5)
  })

  it('no ve ni toca los animales de otra explotación', async () => {
    const [ajeno] = await enExplotacion({ explotacionId: otra.id, usuarioId: otra.adminId }, (tx) =>
      tx.select({ id: animales.id }).from(animales).where(eq(animales.raza, 'Cruzada')),
    )
    expect(ajeno).toBeDefined()
    const res = await pedir(ruta('vista-previa'), admin.cookie, formulario(await censo()))
    const vista = (await res.json()) as Vista
    expect(vista.ausentes.map((a) => a.crotal)).toEqual([fueraDelCenso])
  })
})
