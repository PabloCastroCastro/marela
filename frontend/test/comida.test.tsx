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

const comida = (explotacionId = A_VEIGA.id) => `/explotaciones/${explotacionId}/comida`
const almacenes = () => screen.findByRole('list', { name: 'Almacenes' })

describe('almacenes de comida', () => {
  it('muestra el stock de cada almacén activo, en su unidad', async () => {
    Object.assign(estado.almacenes[0] ?? {}, { stock: 1 })
    Object.assign(estado.almacenes[3] ?? {}, { stock: 3500 })
    simularApi(estado)
    abrir(comida())
    const lista = await almacenes()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(4)
    const verde = within(lista).getByRole('region', { name: 'Pacas de hierba verde' })
    expect(within(verde).getByText('1 unidad')).toBeInTheDocument()
    expect(within(verde).getByText('Hierba verde')).toBeInTheDocument()
    const pienso = within(lista).getByRole('region', { name: 'Silo de pienso' })
    expect(within(pienso).getByText('3.500 kg')).toBeInTheDocument()
    // El desactivado, aparte
    const desactivados = screen.getByRole('region', { name: 'Desactivados' })
    expect(within(desactivados).getByText('Pacas de paja')).toBeInTheDocument()
  })

  it('el administrador crea un almacén con la unidad habitual de su comida', async () => {
    const api = simularApi(estado)
    const usuario = userEvent.setup()
    abrir(comida())
    await almacenes()
    await usuario.click(screen.getAllByRole('button', { name: 'Añadir almacén' })[0] as HTMLElement)
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo almacén' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText(/Indica el nombre/)).toBeInTheDocument()
    expect(within(hoja).getByText('Indica qué comida guarda')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', url: expect.stringContaining('/almacenes') }),
    )

    await usuario.type(within(hoja).getByRole('textbox', { name: /Nombre/ }), 'Pacas de alfalfa')
    await usuario.click(within(hoja).getByRole('button', { name: 'Hierba seca' }))
    // Las pacas se cuentan
    expect(within(hoja).getByRole('button', { name: 'Unidades (pacas)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Pacas de alfalfa creado')).toBeInTheDocument()
    expect(estado.almacenes.at(-1)).toMatchObject({
      nombre: 'Pacas de alfalfa',
      tipo: 'hierba_seca',
      unidad: 'unidades',
    })
    expect(
      within(await almacenes()).getByRole('region', { name: 'Pacas de alfalfa' }),
    ).toBeInTheDocument()
  })

  it('no repite nombres: muestra el error de la API en el campo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(comida())
    await usuario.click(
      (await screen.findAllByRole('button', { name: 'Añadir almacén' }))[0] as HTMLElement,
    )
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo almacén' })
    await usuario.type(within(hoja).getByRole('textbox', { name: /Nombre/ }), 'silo de maíz')
    await usuario.click(within(hoja).getByRole('button', { name: 'Maíz' }))
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('Ya hay un almacén con este nombre')).toBeInTheDocument()
  })

  it('edita un almacén, lo desactiva y lo reactiva', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(comida())
    await almacenes()
    await usuario.click(screen.getByRole('button', { name: 'Editar Silo de maíz' }))
    let hoja = await screen.findByRole('dialog', { name: 'Editar · Silo de maíz' })
    const nombre = within(hoja).getByRole('textbox', { name: /Nombre/ })
    await usuario.clear(nombre)
    await usuario.type(nombre, 'Silo de maíz grande')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Almacén guardado')).toBeInTheDocument()
    expect(estado.almacenes[2]?.nombre).toBe('Silo de maíz grande')

    await usuario.click(await screen.findByRole('button', { name: 'Editar Silo de maíz grande' }))
    hoja = await screen.findByRole('dialog', { name: 'Editar · Silo de maíz grande' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Desactivar' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    )
    expect(await screen.findByText('Silo de maíz grande desactivado')).toBeInTheDocument()
    expect(estado.almacenes[2]?.activo).toBe(false)

    await usuario.click(
      await screen.findByRole('button', { name: 'Reactivar Silo de maíz grande' }),
    )
    expect(await screen.findByText('Silo de maíz grande vuelve a estar activo')).toBeInTheDocument()
    expect(estado.almacenes[2]?.activo).toBe(true)
  })

  it('el empleado ve el stock, pero no gestiona los almacenes', async () => {
    simularApi(estado)
    abrir(comida(O_SOUTO.id))
    const lista = await almacenes()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Añadir almacén' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Desactivados' })).not.toBeInTheDocument()
  })
})
