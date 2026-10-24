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

const propietario = () => {
  estado.usuario.propietario = true
  estado.explotaciones = []
  estado.plataforma = [
    {
      id: '00000000-0000-7000-8009-000000000100',
      nombre: 'Casa Vella',
      rega: 'ES320540000100',
      municipio: 'Xinzo de Limia',
      provincia: 'Ourense',
      activa: true,
      miembros: 3,
      creadaEn: '2026-09-01T10:00:00.000Z',
    },
  ]
}

describe('gestión de la plataforma', () => {
  it('el propietario sin explotaciones entra en la gestión y ve todas', async () => {
    propietario()
    simularApi(estado)
    const router = abrir('/')
    expect(
      await screen.findByRole('heading', { name: 'Explotaciones de la plataforma' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/plataforma')
    const tabla = await screen.findByRole('table', { name: 'Explotaciones' })
    expect(within(tabla).getByText('Casa Vella')).toBeInTheDocument()
    expect(within(tabla).getByText('Xinzo de Limia, Ourense')).toBeInTheDocument()
  })

  it('crea una explotación con un administrador nuevo y muestra su contraseña temporal', async () => {
    propietario()
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/plataforma')
    await usuario.click(await screen.findByRole('button', { name: 'Nueva explotación' }))
    const hoja = screen.getByRole('dialog', { name: 'Nueva explotación' })

    await usuario.type(within(hoja).getByLabelText(/^Nombre \*/), 'A Braña')
    await usuario.type(within(hoja).getByLabelText(/Código REGA/), 'es150780000555')
    expect(within(hoja).getByLabelText(/Código REGA/)).toHaveValue('ES150780000555')
    await usuario.type(within(hoja).getByLabelText(/Municipio/), 'Silleda')
    await usuario.selectOptions(within(hoja).getByLabelText(/Provincia/), 'Pontevedra')
    await usuario.type(within(hoja).getByLabelText(/Nombre de usuario/), 'Xose')
    await usuario.type(within(hoja).getByLabelText(/Nombre y apellidos/), 'Xosé Lema')
    await usuario.type(within(hoja).getByLabelText(/Email/), 'xose@marela.test')
    await usuario.click(within(hoja).getByRole('button', { name: 'Crear explotación' }))

    const resumen = await screen.findByRole('dialog', { name: 'Explotación creada' })
    expect(resumen).toHaveTextContent('Xosé Lema (xose)')
    expect(within(resumen).getByText('Temporal2345')).toBeInTheDocument()
    expect(within(resumen).getByText(/no se volverá a mostrar/)).toBeInTheDocument()
    expect(estado.plataforma.at(-1)).toMatchObject({ nombre: 'A Braña', rega: 'ES150780000555' })
  })

  it('con un administrador que ya existe solo pide su usuario, y muestra los errores por campo', async () => {
    propietario()
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/plataforma')
    await usuario.click(await screen.findByRole('button', { name: 'Nueva explotación' }))
    const hoja = screen.getByRole('dialog', { name: 'Nueva explotación' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Usuario que ya existe' }))
    expect(within(hoja).queryByLabelText(/Email/)).not.toBeInTheDocument()

    await usuario.type(within(hoja).getByLabelText(/^Nombre \*/), 'Repetida')
    await usuario.type(within(hoja).getByLabelText(/Código REGA/), 'ES320540000100')
    await usuario.type(within(hoja).getByLabelText(/Municipio/), 'Xinzo')
    await usuario.selectOptions(within(hoja).getByLabelText(/Provincia/), 'Ourense')
    await usuario.type(within(hoja).getByLabelText(/Nombre de usuario/), 'ana')
    await usuario.click(within(hoja).getByRole('button', { name: 'Crear explotación' }))

    expect(
      await within(hoja).findByText('Ya hay una explotación con este código REGA'),
    ).toBeInTheDocument()
    expect(within(hoja).getByLabelText(/Código REGA/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('desactiva una explotación tras confirmarlo', async () => {
    propietario()
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/plataforma')
    const tabla = await screen.findByRole('table', { name: 'Explotaciones' })
    await usuario.click(within(tabla).getByRole('button', { name: 'Desactivar' }))
    const confirmacion = screen.getByRole('alertdialog', { name: '¿Desactivar Casa Vella?' })
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Desactivar' }))
    expect(await within(tabla).findByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
    expect(estado.plataforma[0]?.activa).toBe(false)
  })

  it('quien no es propietario no entra', async () => {
    simularApi(estado)
    const router = abrir('/plataforma')
    await screen.findByRole('heading', { name: /con qué explotación/i })
    expect(router.state.location.pathname).toBe('/explotaciones')
  })
})

describe('datos de la explotación', () => {
  it('el administrador los edita desde su cuenta', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`/explotaciones/${A_VEIGA.id}`)
    await usuario.click(await screen.findByRole('button', { name: 'Tu cuenta' }))
    await usuario.click(screen.getByRole('button', { name: 'Datos de la explotación' }))

    const campoMunicipio = await screen.findByLabelText(/Municipio/)
    expect(campoMunicipio).toHaveValue('Lalín')
    await usuario.clear(campoMunicipio)
    await usuario.type(campoMunicipio, 'Silleda')
    await usuario.click(screen.getByRole('button', { name: 'Guardar los datos' }))
    expect(await screen.findByText('Datos de la explotación guardados')).toBeInTheDocument()
    expect(estado.explotaciones[0]?.municipio).toBe('Silleda')
  })

  it('el empleado no tiene acceso', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`/explotaciones/${O_SOUTO.id}/datos`)
    expect(
      await screen.findByText('No tienes acceso a la administración de la explotación'),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Tu cuenta' }))
    expect(
      screen.queryByRole('button', { name: 'Datos de la explotación' }),
    ).not.toBeInTheDocument()
  })

  it('una explotación desactivada no deja entrar', async () => {
    estado.explotaciones = [{ ...A_VEIGA, activa: false }]
    simularApi(estado)
    abrir(`/explotaciones/${A_VEIGA.id}`)
    expect(await screen.findByText('Esta explotación está desactivada')).toBeInTheDocument()
  })
})
