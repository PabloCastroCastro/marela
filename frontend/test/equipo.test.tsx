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

const equipo = `/explotaciones/${A_VEIGA.id}/equipo`

// Abre la hoja de un miembro desde la lista de tarjetas (la vista del móvil)
async function abrirMiembro(usuario: ReturnType<typeof userEvent.setup>, nombre: RegExp) {
  const lista = await screen.findByRole('list', { name: 'Equipo' })
  await usuario.click(within(lista).getByRole('button', { name: nombre }))
  return screen.getByRole('dialog', { name: nombre })
}

describe('equipo de la explotación', () => {
  it('el administrador llega desde su cuenta y ve a su equipo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`/explotaciones/${A_VEIGA.id}`)
    await usuario.click(await screen.findByRole('button', { name: 'Tu cuenta' }))
    await usuario.click(screen.getByRole('button', { name: 'Equipo' }))

    const tabla = await screen.findByRole('table', { name: 'Equipo' })
    expect(within(tabla).getByText('Ana Varela (tú)')).toBeInTheDocument()
    expect(within(tabla).getByText('María Souto')).toBeInTheDocument()
  })

  it('añade a una persona nueva y muestra su contraseña temporal', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(equipo)
    await usuario.click(await screen.findByRole('button', { name: 'Añadir persona' }))
    const hoja = screen.getByRole('dialog', { name: 'Añadir persona' })
    await usuario.type(within(hoja).getByLabelText(/Nombre de usuario/), 'Lucia')
    await usuario.type(within(hoja).getByLabelText(/Nombre y apellidos/), 'Lucía Prieto')
    await usuario.type(within(hoja).getByLabelText(/Email/), 'lucia@marela.test')
    await usuario.click(within(hoja).getByRole('button', { name: 'Administrador' }))
    expect(within(hoja).getByText(/también a Finanzas/)).toBeInTheDocument()
    await usuario.click(within(hoja).getByRole('button', { name: 'Añadir al equipo' }))

    const resumen = await screen.findByRole('dialog', { name: 'Lucía Prieto ya está en el equipo' })
    expect(within(resumen).getByText('Temporal6789')).toBeInTheDocument()
    expect(estado.miembros.at(-1)).toMatchObject({ usuario: 'lucia', rol: 'administrador' })
  })

  it('añade a quien ya usa Marela, y avisa si no existe', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(equipo)
    await usuario.click(await screen.findByRole('button', { name: 'Añadir persona' }))
    const hoja = screen.getByRole('dialog', { name: 'Añadir persona' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Ya usa Marela' }))
    expect(within(hoja).queryByLabelText(/Email/)).not.toBeInTheDocument()

    await usuario.type(within(hoja).getByLabelText(/Nombre de usuario/), 'nadie')
    await usuario.click(within(hoja).getByRole('button', { name: 'Añadir al equipo' }))
    expect(
      await within(hoja).findByText('No hay ningún usuario activo con este nombre'),
    ).toBeInTheDocument()

    await usuario.clear(within(hoja).getByLabelText(/Nombre de usuario/))
    await usuario.type(within(hoja).getByLabelText(/Nombre de usuario/), 'dani')
    await usuario.click(within(hoja).getByRole('button', { name: 'Añadir al equipo' }))
    expect(await screen.findByText('Dani Rey ya está en el equipo')).toBeInTheDocument()
  })

  it('cambia el rol y desactiva tras confirmarlo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(equipo)
    const hoja = await abrirMiembro(usuario, /María Souto/)
    await usuario.click(within(hoja).getByRole('button', { name: 'Administrador' }))
    expect(await screen.findByText('Rol de María Souto: administrador')).toBeInTheDocument()
    expect(estado.miembros[1]?.rol).toBe('administrador')

    await usuario.click(within(hoja).getByRole('button', { name: 'Desactivar' }))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Desactivar a María Souto?' })
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Desactivar' }))
    expect(await screen.findByText('Se ha desactivado a María Souto')).toBeInTheDocument()
    expect(within(hoja).getByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
  })

  it('no deja la explotación sin administrador', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(equipo)
    const hoja = await abrirMiembro(usuario, /Ana Varela/)
    expect(
      within(hoja).queryByRole('button', { name: 'Dar contraseña nueva' }),
    ).not.toBeInTheDocument()
    await usuario.click(within(hoja).getByRole('button', { name: 'Empleado' }))
    expect(
      await screen.findByText('La explotación tiene que tener al menos un administrador activo'),
    ).toBeInTheDocument()
    expect(estado.miembros[0]?.rol).toBe('administrador')
  })

  it('da una contraseña nueva a quien solo es de esta explotación', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(equipo)
    const hoja = await abrirMiembro(usuario, /María Souto/)
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar contraseña nueva' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Dar contraseña nueva' }),
    )
    expect(await within(hoja).findByText('Nueva2345678')).toBeInTheDocument()
  })

  it('el empleado no tiene equipo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`/explotaciones/${O_SOUTO.id}/equipo`)
    expect(
      await screen.findByText('No tienes acceso a la administración de la explotación'),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tu cuenta' }))
    expect(screen.queryByRole('button', { name: 'Equipo' })).not.toBeInTheDocument()
  })

  it('quien está desactivado en una explotación no puede entrar en ella', async () => {
    estado.explotaciones = [{ ...A_VEIGA, miembroDesactivado: true }]
    simularApi(estado)
    abrir(`/explotaciones/${A_VEIGA.id}`)
    expect(
      await screen.findByText(/Tu acceso a esta explotación está desactivado/),
    ).toBeInTheDocument()
  })
})

describe('el propietario restablece una contraseña', () => {
  it('a cualquier usuario, por su nombre', async () => {
    estado.usuario.propietario = true
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/plataforma')
    await usuario.click(await screen.findByRole('button', { name: 'Restablecer una contraseña' }))
    const hoja = screen.getByRole('dialog', { name: 'Restablecer una contraseña' })
    await usuario.type(within(hoja).getByLabelText(/Nombre de usuario/), 'xose')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar contraseña nueva' }))
    expect(await within(hoja).findByText('Propia234567')).toBeInTheDocument()
    expect(hoja).toHaveTextContent('Xosé Lema (xose)')
  })
})
