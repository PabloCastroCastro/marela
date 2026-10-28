import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'
import { A_VEIGA, type EstadoSimulado, estadoInicial, simularApi } from './simulacion'

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

const fincas = `/explotaciones/${A_VEIGA.id}/fincas`
const tarjetas = () => screen.findByRole('list', { name: 'Fincas' })

describe('fincas', () => {
  it('lista las activas con su superficie y filtra las desactivadas', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(fincas)
    const lista = await tarjetas()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1)
    expect(within(lista).getByText('3,4456 ha')).toBeInTheDocument()
    expect(screen.getByText(/1 finca · 3,4456 ha/)).toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Estado/ }), 'Desactivadas')
    expect(within(await tarjetas()).getByText('Leira vella')).toBeInTheDocument()
  })

  it('muestra la ficha con sus parcelas SIGPAC y la desactiva', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Agra de abaixo' }),
    ).toBeInTheDocument()
    const parcelas = screen.getByRole('list', { name: 'Parcelas' })
    expect(within(parcelas).getByText('SIGPAC 36:24:12:45:1')).toBeInTheDocument()
    expect(within(parcelas).getByText('2,3456 ha')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))
    await usuario.click(screen.getByRole('button', { name: 'Desactivar la finca' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    )
    expect(await screen.findByText('Agra de abaixo desactivada')).toBeInTheDocument()
    expect(estado.fincas[0]?.activa).toBe(false)
    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
  })

  it('da de alta una finca con dos parcelas', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    const router = abrir(fincas)
    await tarjetas()
    await usuario.click(screen.getAllByRole('button', { name: 'Añadir finca' })[0] as HTMLElement)
    const hoja = screen.getByRole('dialog', { name: 'Nueva finca' })
    await usuario.type(within(hoja).getByLabelText(/^Nombre/), 'Chousa do monte')
    await usuario.selectOptions(within(hoja).getByLabelText('Régimen'), 'Arrendamiento')
    await usuario.click(within(hoja).getByRole('button', { name: 'Añadir otra parcela' }))

    const [primera, segunda] = within(hoja).getAllByRole('group', { name: /^Parcela \d$/ })
    if (!primera || !segunda) throw new Error('Faltan las parcelas')
    for (const [campo, valor] of [
      ['Provincia', '36'],
      ['Municipio', '24'],
      ['Polígono', '15'],
      ['Parcela', '102'],
      ['Recinto', '2'],
    ] as const) {
      await usuario.type(within(primera).getByLabelText(campo), valor)
    }
    await usuario.type(within(primera).getByLabelText(/^Superficie/), '4,5')
    await usuario.type(
      within(segunda).getByLabelText('Referencia catastral'),
      '36024a012000950000ks',
    )
    await usuario.type(within(segunda).getByLabelText(/^Superficie/), '0,25')
    expect(within(hoja).getByText('Superficie total: 4,75 ha')).toBeInTheDocument()
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de alta' }))

    expect(await screen.findByText('Finca Chousa do monte dada de alta')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`${fincas}/f3`)
    expect(estado.fincas.at(-1)).toMatchObject({
      nombre: 'Chousa do monte',
      regimen: 'arrendamiento',
      parcelas: [
        expect.objectContaining({ poligono: '15', superficie: 4.5 }),
        expect.objectContaining({ referenciaCatastral: '36024A012000950000KS', superficie: 0.25 }),
      ],
    })
  })

  it('pide la superficie de cada parcela y muestra los errores de la API', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(fincas)
    await tarjetas()
    await usuario.click(screen.getAllByRole('button', { name: 'Añadir finca' })[0] as HTMLElement)
    const hoja = screen.getByRole('dialog', { name: 'Nueva finca' })
    await usuario.type(within(hoja).getByLabelText(/^Nombre/), 'agra de abaixo')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de alta' }))
    expect(within(hoja).getByText(/Indica la superficie en hectáreas/)).toBeInTheDocument()

    await usuario.type(within(hoja).getByLabelText(/^Superficie/), '1')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de alta' }))
    expect(await within(hoja).findByText('Ya hay una finca con este nombre')).toBeInTheDocument()
  })
})

describe('labores', () => {
  it('muestra las labores en la ficha y registra una siega desde "Registrar"', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    const tarjeta = await screen.findByRole('region', { name: 'Labores' })
    const lista = await within(tarjeta).findByRole('list', { name: 'Labores' })
    expect(within(lista).getByText('Cosecha: Pradera de raigrás')).toBeInTheDocument()
    expect(within(lista).getByText(/42 rolos · por Contratista Hermanos Rey/)).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: 'Otra labor',
      }),
    )
    const hoja = screen.getByRole('dialog', { name: /Registrar · Agra de abaixo/ })
    // Por defecto, la finca entera y quien la registra
    expect(within(hoja).getByLabelText(/^Superficie/)).toHaveValue('3,4456')
    expect(within(hoja).getByLabelText('Quién la realiza')).toHaveValue('u1')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('Indica la labor')).toBeInTheDocument()

    await usuario.type(within(hoja).getByLabelText(/^Labor/), 'Siega')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Siega registrada')).toBeInTheDocument()
    expect(await within(tarjeta).findByText('Siega')).toBeInTheDocument()
  })

  it('corrige una labor y la borra con deshacer', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    const tarjeta = await screen.findByRole('region', { name: 'Labores' })
    await usuario.click(
      await within(tarjeta).findByRole('button', { name: /^Corregir cosecha: pradera/ }),
    )
    const hoja = screen.getByRole('dialog', { name: /Corregir/ })
    await usuario.clear(within(hoja).getByLabelText(/^Cantidad/))
    await usuario.type(within(hoja).getByLabelText(/^Cantidad/), '45')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Labor corregida')).toBeInTheDocument()
    expect(estado.labores[0]?.cantidad).toBe(45)

    await usuario.click(
      await within(tarjeta).findByRole('button', { name: /^Corregir cosecha: pradera/ }),
    )
    await usuario.click(
      within(screen.getByRole('dialog', { name: /Corregir/ })).getByRole('button', {
        name: 'Borrar',
      }),
    )
    expect(await screen.findByText(/borrada$/)).toBeInTheDocument()
    expect(estado.labores).toHaveLength(0)
    await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
    await within(tarjeta).findByText('Cosecha: Pradera de raigrás')
    expect(estado.labores).toHaveLength(1)
  })

  it('registra la misma labor en varias fincas marcadas en el listado', async () => {
    estado.fincas[1] = { ...(estado.fincas[1] as (typeof estado.fincas)[number]), activa: true }
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(fincas)
    await tarjetas()
    await usuario.click(
      within(screen.getByRole('table', { name: 'Fincas' })).getByRole('checkbox', {
        name: 'Seleccionar todos',
      }),
    )
    expect(screen.getByText('2 seleccionadas')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: 'Otra labor',
      }),
    )
    const hoja = screen.getByRole('dialog', { name: 'Registrar en 2 fincas' })
    expect(within(hoja).queryByLabelText(/^Superficie/)).not.toBeInTheDocument()
    await usuario.type(within(hoja).getByLabelText(/^Labor/), 'Encalado')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Encalado registrada en 2 fincas')).toBeInTheDocument()
    expect(estado.labores.slice(-2).map((l) => [l.fincaId, l.superficie])).toEqual([
      ['f1', 3.4456],
      ['f2', 0.35],
    ])
  })
})

describe('abonado y fitosanitarios', () => {
  it('registra un fitosanitario desde "Registrar" y avisa del plazo de seguridad', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    const tarjeta = await screen.findByRole('region', { name: 'Abonado y fitosanitarios' })
    const lista = await within(tarjeta).findByRole('list', { name: 'Abonado y fitosanitarios' })
    expect(within(lista).getByText('Abono: Purín de vacuno')).toBeInTheDocument()
    expect(within(lista).getByText(/Orgánico · 30 m³\/ha · 3,4456 ha/)).toBeInTheDocument()
    expect(screen.queryByText(/Plazo de seguridad hasta/)).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: 'Fitosanitario',
      }),
    )
    const hoja = screen.getByRole('dialog', { name: /Registrar · Agra de abaixo/ })
    expect(within(hoja).getByLabelText('Unidad')).toHaveValue('l_ha')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('Indica el producto')).toBeInTheDocument()
    expect(within(hoja).getByText('Indica la plaga o el motivo')).toBeInTheDocument()

    await usuario.type(within(hoja).getByLabelText(/^Producto fitosanitario/), 'Fluroxipir 20 %')
    await usuario.type(within(hoja).getByLabelText(/^Plaga o motivo/), 'Romaza')
    await usuario.type(within(hoja).getByLabelText(/^Dosis por hectárea/), '1,5')
    await usuario.type(within(hoja).getByLabelText(/^Plazo de seguridad/), '28')
    expect(within(hoja).getByText(/^Sin cosechar ni pastar hasta el/)).toBeInTheDocument()
    await usuario.type(within(hoja).getByLabelText(/^Número ROPO/), '3600012345678')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Tratamiento fitosanitario registrado')).toBeInTheDocument()
    expect(estado.aplicaciones.at(-1)).toMatchObject({
      dosis: 1.5,
      unidadDosis: 'l_ha',
      diasSeguridad: 28,
      ropo: '3600012345678',
      tipoAbono: null,
    })
    expect(await within(tarjeta).findByText('Fitosanitario: Fluroxipir 20 %')).toBeInTheDocument()
    expect(await screen.findAllByText(/^Plazo de seguridad hasta el/)).toHaveLength(2)
  })

  it('pide el tipo de abono y anula un abonado con su motivo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    const tarjeta = await screen.findByRole('region', { name: 'Abonado y fitosanitarios' })
    await usuario.click(
      await within(tarjeta).findByRole('button', { name: /^Anular abono: purín de vacuno/ }),
    )
    const hoja = screen.getByRole('dialog', { name: '¿Anular el abonado?' })
    await usuario.type(within(hoja).getByLabelText(/^Motivo/), 'Era en otra finca')
    await usuario.click(within(hoja).getByRole('button', { name: 'Anular' }))
    expect(await screen.findByText('Abono: Purín de vacuno anulado')).toBeInTheDocument()
    expect(estado.aplicaciones[0]?.anulacion?.motivo).toBe('Era en otra finca')
    expect(await within(tarjeta).findByText(/^Era en otra finca/)).toBeInTheDocument()
    expect(within(tarjeta).queryByRole('button', { name: /^Anular abono/ })).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: 'Abono',
      }),
    )
    const nuevo = screen.getByRole('dialog', { name: /Registrar · Agra de abaixo/ })
    await usuario.type(within(nuevo).getByLabelText(/^Abono/), 'Urea 46 %')
    await usuario.type(within(nuevo).getByLabelText(/^Dosis por hectárea/), '200')
    await usuario.click(within(nuevo).getByRole('button', { name: 'Guardar' }))
    expect(await within(nuevo).findByText('Indica si es mineral u orgánico')).toBeInTheDocument()
    await usuario.click(within(nuevo).getByRole('button', { name: 'Mineral' }))
    await usuario.click(within(nuevo).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Abonado registrado')).toBeInTheDocument()
    expect(estado.aplicaciones.at(-1)).toMatchObject({ tipoAbono: 'mineral', unidadDosis: 'kg_ha' })
  })

  it('abona varias fincas marcadas y filtra las que están en plazo de seguridad', async () => {
    estado.fincas[1] = { ...(estado.fincas[1] as (typeof estado.fincas)[number]), activa: true }
    estado.aplicaciones.push({
      ...(estado.aplicaciones[0] as (typeof estado.aplicaciones)[number]),
      id: 'ap2',
      fincaId: 'f2',
      tipo: 'fitosanitario',
      tipoAbono: null,
      plaga: 'Pulgón',
      diasSeguridad: 999,
      finSeguridad: '2099-01-01',
    })
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(fincas)
    const lista = await tarjetas()
    expect(within(lista).getByText('Plazo de seguridad hasta el 01/01/2099')).toBeInTheDocument()

    await usuario.selectOptions(
      screen.getByRole('combobox', { name: /^Estado/ }),
      'En plazo de seguridad',
    )
    expect(await screen.findByText(/^1 finca/)).toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Estado/ }), 'Activas')
    await screen.findByText(/^2 fincas/)

    await usuario.click(
      within(screen.getByRole('table', { name: 'Fincas' })).getByRole('checkbox', {
        name: 'Seleccionar todos',
      }),
    )
    await usuario.click(screen.getByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: 'Abono',
      }),
    )
    const hoja = screen.getByRole('dialog', { name: 'Registrar en 2 fincas' })
    expect(within(hoja).queryByLabelText(/^Superficie/)).not.toBeInTheDocument()
    await usuario.type(within(hoja).getByLabelText(/^Abono/), 'Purín de vacuno')
    await usuario.click(within(hoja).getByRole('button', { name: 'Orgánico' }))
    await usuario.type(within(hoja).getByLabelText(/^Dosis por hectárea/), '30')
    await usuario.selectOptions(within(hoja).getByLabelText('Unidad'), 'm³/ha')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Abonado registrado en 2 fincas')).toBeInTheDocument()
    expect(estado.aplicaciones.slice(-2).map((a) => [a.fincaId, a.superficie])).toEqual([
      ['f1', 3.4456],
      ['f2', 0.35],
    ])
  })
})
