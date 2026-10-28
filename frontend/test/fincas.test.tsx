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

    await usuario.click(screen.getByRole('button', { name: 'Desactivar' }))
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
    await usuario.click(screen.getByRole('button', { name: 'Registrar labor' }))
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
