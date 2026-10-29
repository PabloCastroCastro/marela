import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'
import { pool } from '../src/db/cliente.js'
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

let a = ''
let admin = { id: '', cookie: '' }
let empleado = { id: '', cookie: '' }

const exportar = (listado: string, filtros = '') =>
  pedir('GET', `/explotaciones/${a}/exportaciones/${listado}?${filtros}`, admin.cookie)

const leerExcel = async (res: Response) => {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await res.arrayBuffer())
  return libro
}

beforeAll(async () => {
  a = (await nuevaExplotacion('A exportaciones')).id
  const u = await nuevoUsuario()
  await hacerMiembro(a, u.id, 'administrador')
  admin = { id: u.id, cookie: await iniciarSesion(app, u) }
  const e = await nuevoUsuario()
  await hacerMiembro(a, e.id, 'empleado')
  empleado = { id: e.id, cookie: await iniciarSesion(app, e) }

  const recibida = (await (
    await pedir('POST', `/explotaciones/${a}/facturas`, admin.cookie, {
      tipo: 'recibida',
      numero: 'P-381',
      fecha: '2025-10-15',
      tercero: 'Piensos "do Norte"; S.L.',
      nif: 'B15000003',
      concepto: 'Pienso',
      lineas: [
        { base: 1840, porcentaje: 10, cuota: 184 },
        { base: 120, porcentaje: 21, cuota: 25.2 },
      ],
      total: 2169.2,
      pagadaEn: '2025-10-20',
    })
  ).json()) as { id: string }
  const formulario = new FormData()
  formulario.set('archivo', new File(['%PDF-1.4\n%%EOF'], 'x.pdf', { type: 'application/pdf' }))
  await pedir(
    'PUT',
    `/explotaciones/${a}/facturas/${recibida.id}/archivo`,
    admin.cookie,
    formulario,
  )
  await pedir('POST', `/explotaciones/${a}/facturas`, admin.cookie, {
    tipo: 'emitida',
    numero: '2025-0001',
    fecha: '2025-11-02',
    tercero: 'Carnes Galegas',
    nif: '12345678Z',
    concepto: 'Venta',
    impuesto: 'compensacion',
    lineas: [{ base: 1000, porcentaje: 10.5, cuota: 105 }],
    total: 1105,
  })
  await pedir('POST', `/explotaciones/${a}/apuntes`, admin.cookie, {
    tipo: 'ingreso',
    categoria: 'subvencion',
    fecha: '2025-10-25',
    concepto: 'Pago básico PAC',
    importe: 3250.4,
  })
})

afterAll(async () => {
  await pool.end()
})

describe('exportación para el gestor', () => {
  it('las facturas filtradas en Excel, con fechas e importes de verdad y su formato', async () => {
    const res = await exportar('facturas', 'tipo=recibida&desde=2025-10-01&hasta=2025-12-31')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('spreadsheetml')
    expect(res.headers.get('content-disposition')).toContain('facturas_2025-10-01_2025-12-31.xlsx')
    const hoja = (await leerExcel(res)).getWorksheet('Facturas')
    expect(hoja?.rowCount).toBe(2)
    expect(hoja?.getRow(1).getCell(1).value).toBe('Fecha')
    const fila = hoja?.getRow(2)
    expect(fila?.getCell(1).value).toEqual(new Date('2025-10-15T00:00:00Z'))
    expect(fila?.getCell(1).numFmt).toBe('dd/mm/yyyy')
    expect(fila?.getCell(3).value).toBe('P-381')
    expect(fila?.getCell(9).value).toBe('10 % · 21 %')
    expect(fila?.getCell(11).value).toBe(2169.2)
    expect(fila?.getCell(11).numFmt).toBe('#,##0.00 "€"')
    expect(fila?.getCell(12).value).toBe('Pagada')
  })

  it('en CSV como lo abre Excel en España: punto y coma, coma decimal, dd/mm/aaaa y BOM', async () => {
    const res = await exportar('facturas', 'formato=csv&tipo=recibida')
    expect(res.headers.get('content-type')).toContain('text/csv')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const [cabecera, fila] = new TextDecoder().decode(bytes.slice(3)).split('\r\n')
    expect(cabecera?.startsWith('Fecha;Tipo;Número;Proveedor o cliente;NIF')).toBe(true)
    expect(fila).toBe(
      '15/10/2025;Recibida;P-381;"Piensos ""do Norte""; S.L.";B15000003;Pienso;1960,00;IVA;10 % · 21 %;209,20;2169,20;Pagada;20/10/2025',
    )
  })

  it('un .zip con el Excel y los adjuntos, con nombres legibles', async () => {
    const res = await exportar('facturas', 'formato=zip')
    expect(res.headers.get('content-type')).toBe('application/zip')
    const contenido = Buffer.from(await res.arrayBuffer())
    // Los nombres de las entradas van en claro en el .zip: el Excel y el PDF, con la fecha, el número y
    // el proveedor, sin los caracteres que no valen en un nombre de archivo
    expect(contenido.subarray(0, 2).toString()).toBe('PK')
    expect(contenido.includes(Buffer.from('.xlsx'))).toBe(true)
    expect(
      contenido.includes(Buffer.from('facturas/2025-10-15 P-381 Piensos do Norte ; S.L..pdf')),
    ).toBe(true)
  })

  it('el periodo entero: el resumen y una hoja por listado', async () => {
    const res = await exportar('periodo', 'desde=2025-10-01&hasta=2025-12-31&periodo=mes')
    expect(res.headers.get('content-disposition')).toContain('finanzas_2025-10-01_2025-12-31.xlsx')
    const libro = await leerExcel(res)
    expect(libro.worksheets.map((h) => h.name)).toEqual([
      'Resumen',
      'Facturas',
      'Ventas',
      'Otros ingresos y gastos',
    ])
    const resumen = libro.getWorksheet('Resumen')
    expect(resumen?.getRow(2).getCell(1).value).toBe('oct 2025')
    // Octubre: la PAC de ingreso y la compra de gasto
    expect(resumen?.getRow(2).getCell(5).value).toBe(3250.4)
    expect(resumen?.getRow(2).getCell(9).value).toBe(1081.2)
    expect(libro.getWorksheet('Facturas')?.rowCount).toBe(3)
    expect(libro.getWorksheet('Otros ingresos y gastos')?.getRow(2).getCell(3).value).toBe(
      'Subvención (PAC u otra)',
    )
  })

  it('valida el formato y las fechas; solo el administrador', async () => {
    expect((await exportar('ventas', 'formato=zip')).status).toBe(400)
    expect((await exportar('periodo', 'desde=2025-01-01')).status).toBe(400)
    expect(
      (await pedir('GET', `/explotaciones/${a}/exportaciones/facturas`, empleado.cookie)).status,
    ).toBe(403)
  })
})
