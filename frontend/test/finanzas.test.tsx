import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'
import {
  A_VEIGA,
  type EstadoSimulado,
  estadoInicial,
  type FacturaSimulada,
  movimientoSimulado,
  O_SOUTO,
  simularApi,
} from './simulacion'

function abrir(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(
    <Proveedores cliente={crearClienteConsultas()}>
      <RouterProvider router={router} />
    </Proveedores>,
  )
  return router
}

let estado: EstadoSimulado

beforeEach(() => {
  localStorage.clear()
  estado = estadoInicial({ conSesion: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const finanzas = (explotacionId = A_VEIGA.id) => `/explotaciones/${explotacionId}/finanzas`

describe('régimen fiscal (GH-34)', () => {
  it('sin configurar, muestra REAGP con el 10,5 % y los tipos de IVA, como valores por defecto', async () => {
    simularApi(estado)
    abrir(finanzas())
    const tarjeta = await screen.findByRole('region', { name: 'Régimen fiscal' })
    expect(await within(tarjeta).findByText('Régimen especial agrario (REAGP)')).toBeInTheDocument()
    expect(within(tarjeta).getByText('10,5 %')).toBeInTheDocument()
    expect(within(tarjeta).getByText('21 % · 10 % · 4 %')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/Son los valores por defecto/)).toBeInTheDocument()
  })

  it('el administrador cambia el régimen, la compensación y los tipos de IVA', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(finanzas())
    const tarjeta = await screen.findByRole('region', { name: 'Régimen fiscal' })
    await usuario.click(await within(tarjeta).findByRole('button', { name: 'Editar' }))
    const hoja = await screen.findByRole('dialog', { name: 'Régimen fiscal' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Régimen general de IVA' }))
    const compensacion = within(hoja).getByRole('textbox', { name: /Compensación/ })
    await usuario.clear(compensacion)
    await usuario.type(compensacion, '12')
    await usuario.click(within(hoja).getByRole('button', { name: 'Quitar el 4 %' }))
    await usuario.type(within(hoja).getByRole('textbox', { name: /Otro tipo de IVA/ }), '5,5')
    await usuario.click(within(hoja).getByRole('button', { name: 'Añadir' }))
    expect(
      within(within(hoja).getByRole('list', { name: 'Tipos de IVA' })).getByText('5,5 %'),
    ).toBeInTheDocument()
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Régimen fiscal guardado')).toBeInTheDocument()
    expect(estado.fiscal).toEqual({
      regimen: 'general',
      compensacionReagp: 12,
      tiposIva: [21, 10, 5.5],
    })
    expect(await within(tarjeta).findByText('Régimen general de IVA')).toBeInTheDocument()
    expect(within(tarjeta).queryByText(/Son los valores por defecto/)).not.toBeInTheDocument()
  })

  it('no deja guardar sin ningún tipo de IVA ni una compensación fuera de 0 a 100', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(finanzas())
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    const hoja = await screen.findByRole('dialog', { name: 'Régimen fiscal' })
    for (const t of ['21 %', '10 %', '4 %'])
      await usuario.click(within(hoja).getByRole('button', { name: `Quitar el ${t}` }))
    const compensacion = within(hoja).getByRole('textbox', { name: /Compensación/ })
    await usuario.clear(compensacion)
    await usuario.type(compensacion, '150')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText('Deja al menos un tipo de IVA')).toBeInTheDocument()
    expect(within(hoja).getByText(/Indica un porcentaje entre 0 y 100/)).toBeInTheDocument()
    expect(estado.fiscal).toBeUndefined()
  })

  it('el empleado no entra en Finanzas', async () => {
    simularApi(estado)
    abrir(finanzas(O_SOUTO.id))
    expect(await screen.findByText('No tienes acceso a Finanzas')).toBeInTheDocument()
  })
})

describe('facturas (GH-35)', () => {
  it('lista las facturas y las filtra por pago y por tipo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(finanzas())
    const tabla = await screen.findByRole('table', { name: 'Facturas' })
    expect(within(tabla).getByText('Piensos do Norte')).toBeInTheDocument()
    expect(within(tabla).getByText('Carnes Galegas')).toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: /Pago/ }), 'pendiente')
    await waitFor(() => expect(within(tabla).queryByText('Carnes Galegas')).not.toBeInTheDocument())
    expect(within(tabla).getByText('Piensos do Norte')).toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: /Pago/ }), 'todas')
    await usuario.click(screen.getByRole('button', { name: 'Emitidas' }))
    await waitFor(() =>
      expect(within(tabla).queryByText('Piensos do Norte')).not.toBeInTheDocument(),
    )
  })

  it('registra una factura recibida con dos tipos de IVA, con los totales al momento', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    const router = abrir(finanzas())
    await usuario.click(await screen.findByRole('button', { name: 'Nueva factura' }))
    const hoja = await screen.findByRole('dialog', { name: 'Nueva factura' })
    await usuario.type(within(hoja).getByRole('textbox', { name: /Número/ }), 'A-77')
    await usuario.type(within(hoja).getByRole('textbox', { name: /Proveedor/ }), 'Veterinaria Deza')
    await usuario.type(within(hoja).getByRole('textbox', { name: /NIF/ }), 'b15000003')
    await usuario.type(within(hoja).getByRole('textbox', { name: /Concepto/ }), 'Vacunas')
    await usuario.type(within(hoja).getByRole('textbox', { name: 'Base imponible' }), '100')
    await usuario.click(within(hoja).getByRole('button', { name: 'Otro tipo de IVA' }))
    // La segunda línea, al 10 %: el primer tipo que aún no se usa
    await usuario.type(within(hoja).getByRole('textbox', { name: 'Base imponible 2' }), '50,50')
    const totales = within(within(hoja).getByLabelText('Totales'))
    expect(totales.getByText('150,50 €')).toBeInTheDocument()
    expect(totales.getByText('26,05 €')).toBeInTheDocument()
    expect(totales.getByText('176,55 €')).toBeInTheDocument()
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('heading', { name: 'Factura A-77' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`${finanzas()}/facturas/fa3`)
    expect(estado.facturas.at(-1)).toMatchObject({
      tipo: 'recibida',
      nif: 'B15000003',
      impuesto: 'iva',
      lineas: [
        { base: 100, porcentaje: 21, cuota: 21 },
        { base: 50.5, porcentaje: 10, cuota: 5.05 },
      ],
      pagadaEn: null,
    })
  })

  it('en una emitida propone el siguiente número y la compensación del REAGP', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(finanzas())
    await usuario.click(await screen.findByRole('button', { name: 'Nueva factura' }))
    const hoja = await screen.findByRole('dialog', { name: 'Nueva factura' })
    await usuario.click(within(hoja).getByRole('button', { name: /Emitida/ }))
    const fecha = within(hoja).getByLabelText(/^Fecha/, { selector: 'input[type="date"]' })
    await usuario.clear(fecha)
    await usuario.type(fecha, '2026-11-02')
    await waitFor(() =>
      expect(within(hoja).getByRole('textbox', { name: /Número/ })).toHaveValue('2026-0007'),
    )
    expect(within(hoja).getByRole('textbox', { name: /Cliente/ })).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Compensación REAGP' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(hoja).getByRole('combobox', { name: 'Compensación' })).toHaveDisplayValue(
      '10,5 %',
    )
    // Las ventas no llevan animales: van en Ventas
    expect(
      within(hoja).queryByRole('group', { name: 'Animales comprados' }),
    ).not.toBeInTheDocument()
  })

  it('muestra en su campo el NIF que no es válido', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(finanzas())
    await usuario.click(await screen.findByRole('button', { name: 'Nueva factura' }))
    const hoja = await screen.findByRole('dialog', { name: 'Nueva factura' })
    await usuario.type(within(hoja).getByRole('textbox', { name: /Número/ }), 'X-1')
    await usuario.type(within(hoja).getByRole('textbox', { name: /Proveedor/ }), 'Ferretería')
    await usuario.type(within(hoja).getByRole('textbox', { name: /NIF/ }), '12345678A')
    await usuario.type(within(hoja).getByRole('textbox', { name: /Concepto/ }), 'Tornillos')
    await usuario.type(within(hoja).getByRole('textbox', { name: 'Base imponible' }), '10')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('El NIF no es válido')).toBeInTheDocument()
    expect(within(hoja).getByRole('textbox', { name: /NIF/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('en la ficha se marca como pagada, se adjunta el archivo y se borra', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    const router = abrir(`${finanzas()}/facturas/fa1`)
    expect(await screen.findByRole('heading', { name: 'Factura P-381' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Marcar como pagada' }))
    expect(await screen.findByRole('button', { name: 'Dejar pendiente' })).toBeInTheDocument()
    expect(estado.facturas[0]?.pagadaEn).not.toBeNull()

    const pdf = new File(['%PDF-1.4'], 'albaran.pdf', { type: 'application/pdf' })
    await usuario.upload(screen.getByLabelText('Adjuntar archivo'), pdf)
    expect(await screen.findByRole('link', { name: /albaran\.pdf/ })).toHaveAttribute(
      'href',
      `/api/explotaciones/${A_VEIGA.id}/facturas/fa1/archivo`,
    )

    await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Borrar' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe(finanzas()))
    expect(estado.facturas.map((f) => f.id)).toEqual(['fa2'])
  })
})

describe('entradas de comida de una factura (GH-36)', () => {
  it('se asocian desde la factura, entre las compras sin factura', async () => {
    estado.movimientos = [
      movimientoSimulado({ id: 'm1', almacenId: 'al4', tipo: 'entrada', cantidad: 500 }),
      movimientoSimulado({ id: 'm2', almacenId: 'al4', tipo: 'entrada', cantidad: 300 }),
      movimientoSimulado({
        id: 'm3',
        almacenId: 'al4',
        tipo: 'entrada',
        cantidad: 200,
        origen: 'produccion_propia',
      }),
    ]
    // La de 300 kg ya es de otra factura
    estado.facturas.push({
      ...(estado.facturas[0] as FacturaSimulada),
      id: 'fa9',
      numero: 'P-900',
      movimientoIds: ['m2'],
    })
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${finanzas()}/facturas/fa1`)
    const tarjeta = await screen.findByRole('region', { name: 'Entradas de comida' })
    await usuario.click(within(tarjeta).getByRole('button', { name: 'Asociar entradas' }))
    const hoja = await screen.findByRole('dialog', { name: 'Entradas de comida' })
    const compras = await within(hoja).findByRole('list', { name: 'Compras de comida' })
    // Solo las compras sin factura
    expect(within(compras).getAllByRole('checkbox')).toHaveLength(1)
    await usuario.click(within(compras).getByRole('checkbox', { name: /500 kg/ }))
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('1 entrada de comida en la factura')).toBeInTheDocument()
    expect(estado.facturas[0]?.movimientoIds).toEqual(['m1'])
    expect(
      await within(tarjeta).findByRole('link', { name: /Silo de pienso · 01\/10\/2026 · 500 kg/ }),
    ).toHaveAttribute('href', `/explotaciones/${A_VEIGA.id}/comida/al4`)
  })

  it('las facturas emitidas no tienen entradas de comida', async () => {
    simularApi(estado)
    abrir(`${finanzas()}/facturas/fa2`)
    expect(await screen.findByRole('heading', { name: 'Factura 2026-0006' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Entradas de comida' })).not.toBeInTheDocument()
  })
})
