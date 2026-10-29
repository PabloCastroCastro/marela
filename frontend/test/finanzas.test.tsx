import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'
import { A_VEIGA, type EstadoSimulado, estadoInicial, O_SOUTO, simularApi } from './simulacion'

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
