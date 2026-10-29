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

const mantenimiento = (explotacionId = A_VEIGA.id) =>
  `/explotaciones/${explotacionId}/mantenimiento`
const lista = () => screen.findByRole('list', { name: 'Equipos' })

describe('maquinaria e infraestructuras (GH-111)', () => {
  it('es una sección más, también para el empleado, y lista primero lo que necesita mantenimiento', async () => {
    simularApi(estado)
    abrir(mantenimiento(O_SOUTO.id))
    expect(
      within(await screen.findByRole('navigation', { name: 'Secciones' })).getByRole('link', {
        name: 'Mantenimiento',
      }),
    ).toBeInTheDocument()
    const [primero, segundo] = within(await lista()).getAllByRole('listitem')
    expect(primero).toHaveTextContent('Tractor John Deere')
    expect(primero).toHaveTextContent('Mantenimiento')
    expect(segundo).toHaveTextContent('Nave de las vacas')
    expect(segundo).toHaveTextContent('Al día')
    expect(screen.getByText('2 equipos · 1 necesita mantenimiento')).toBeInTheDocument()
  })

  it('da de alta una máquina y abre su ficha', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(mantenimiento())
    await lista()
    await usuario.click(
      screen.getAllByRole('button', { name: 'Añadir máquina o infraestructura' })[0] as HTMLElement,
    )
    const hoja = await screen.findByRole('dialog', { name: 'Nueva máquina o infraestructura' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText(/Indica el nombre/)).toBeInTheDocument()
    expect(
      within(hoja).getByText('Indica si es maquinaria o una infraestructura'),
    ).toBeInTheDocument()

    await usuario.type(within(hoja).getByRole('textbox', { name: /Nombre/ }), 'Remolque')
    await usuario.click(within(hoja).getByRole('button', { name: 'Maquinaria' }))
    await usuario.type(within(hoja).getByRole('textbox', { name: /Descripción/ }), '8 t')
    await usuario.click(within(hoja).getByRole('checkbox', { name: 'Necesita mantenimiento' }))
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Remolque dado de alta')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Remolque' })).toBeInTheDocument()
    expect(estado.equipos.at(-1)).toMatchObject({
      nombre: 'Remolque',
      tipo: 'maquinaria',
      descripcion: '8 t',
      necesitaMantenimiento: true,
    })
  })

  it('no repite nombres: muestra el error de la API en el campo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(mantenimiento())
    await lista()
    await usuario.click(
      screen.getAllByRole('button', { name: 'Añadir máquina o infraestructura' })[0] as HTMLElement,
    )
    const hoja = await screen.findByRole('dialog', { name: 'Nueva máquina o infraestructura' })
    await usuario.type(within(hoja).getByRole('textbox', { name: /Nombre/ }), 'nave de las vacas')
    await usuario.click(within(hoja).getByRole('button', { name: 'Infraestructura' }))
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('Ya hay un equipo con este nombre')).toBeInTheDocument()
  })

  it('desde la ficha se edita, se desactiva y se reactiva', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${mantenimiento()}/eq1`)
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    const hoja = await screen.findByRole('dialog', { name: 'Editar · Tractor John Deere' })
    await usuario.click(within(hoja).getByRole('checkbox', { name: 'Necesita mantenimiento' }))
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Tractor John Deere guardado')).toBeInTheDocument()
    expect(estado.equipos[0]?.necesitaMantenimiento).toBe(false)

    await usuario.click(screen.getByRole('button', { name: 'Desactivar' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    )
    expect(await screen.findByText('Tractor John Deere desactivado')).toBeInTheDocument()
    expect(estado.equipos[0]?.activo).toBe(false)
    await usuario.click(await screen.findByRole('button', { name: 'Reactivar' }))
    expect(await screen.findByText('Tractor John Deere vuelve a estar activo')).toBeInTheDocument()
    expect(estado.equipos[0]?.activo).toBe(true)
  })
})
