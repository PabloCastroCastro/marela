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
  estado = estadoInicial()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function entrar(
  usuario: ReturnType<typeof userEvent.setup>,
  identificador: string,
  contrasena: string,
) {
  await usuario.type(await screen.findByLabelText(/Usuario o email/), identificador)
  await usuario.type(screen.getByLabelText(/^Contraseña/), contrasena)
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('inicio de sesión', () => {
  it('sin sesión lleva al inicio de sesión y, al entrar, de vuelta a donde se estaba', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    const router = abrir(`/explotaciones/${O_SOUTO.id}/comida`)
    expect(await screen.findByRole('heading', { name: 'Marela' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')

    await entrar(usuario, 'ana', estado.contrasena)
    expect(await screen.findByRole('heading', { name: 'Comida' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/explotaciones/${O_SOUTO.id}/comida`)
  })

  it('explica el error si el usuario o la contraseña no son correctos', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/entrar')
    await entrar(usuario, 'ana', 'otra-contraseña')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El usuario o la contraseña no son correctos',
    )
  })

  it('pide los campos vacíos sin llamar al servidor', async () => {
    const api = simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/entrar')
    await usuario.click(await screen.findByRole('button', { name: 'Entrar' }))
    expect(screen.getByText('Escribe tu usuario o tu email')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña')).toBeInTheDocument()
    expect(api.mock.calls.some(([e]) => String(e).includes('sign-in'))).toBe(false)
  })

  it('entra con el email', async () => {
    const api = simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/entrar')
    await entrar(usuario, 'ana@marela.test', estado.contrasena)
    expect(await screen.findByRole('heading', { name: /con qué explotación/i })).toBeInTheDocument()
    expect(api.mock.calls.some(([e]) => String(e).includes('/sign-in/email'))).toBe(true)
  })

  it('con la contraseña temporal obliga a cambiarla antes de seguir', async () => {
    estado.usuario.debeCambiarContrasena = true
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir('/entrar')
    await entrar(usuario, 'ana', estado.contrasena)

    expect(
      await screen.findByRole('heading', { name: 'Cambiar la contraseña' }),
    ).toBeInTheDocument()
    await usuario.type(screen.getByLabelText(/Contraseña temporal/), estado.contrasena)
    await usuario.type(screen.getByLabelText(/^Contraseña nueva/), 'corta')
    await usuario.type(screen.getByLabelText(/Repite/), 'corta')
    await usuario.click(screen.getByRole('button', { name: 'Cambiar la contraseña' }))
    expect(screen.getByText('Debe tener al menos 10 caracteres')).toBeInTheDocument()

    await usuario.clear(screen.getByLabelText(/^Contraseña nueva/))
    await usuario.clear(screen.getByLabelText(/Repite/))
    await usuario.type(screen.getByLabelText(/^Contraseña nueva/), 'mi-contraseña-nueva')
    await usuario.type(screen.getByLabelText(/Repite/), 'mi-contraseña-nueva')
    await usuario.click(screen.getByRole('button', { name: 'Cambiar la contraseña' }))
    expect(await screen.findByRole('heading', { name: /con qué explotación/i })).toBeInTheDocument()
    expect(estado.usuario.debeCambiarContrasena).toBe(false)
  })
})

describe('explotación activa', () => {
  it('con una sola explotación se entra directamente', async () => {
    simularApi({ ...estado, conSesion: true, explotaciones: [A_VEIGA] })
    const router = abrir('/')
    expect(await screen.findByRole('heading', { name: 'A Veiga', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/explotaciones/${A_VEIGA.id}`)
  })

  it('con varias se elige, y se recuerda la última usada', async () => {
    simularApi({ ...estado, conSesion: true })
    const usuario = userEvent.setup()
    abrir('/')
    await usuario.click(await screen.findByRole('link', { name: /O Souto/ }))
    expect(await screen.findByRole('heading', { name: 'O Souto', level: 1 })).toBeInTheDocument()
    expect(localStorage.getItem('marela.ultimaExplotacion')).toBe(O_SOUTO.id)
  })

  it('al volver a abrir la aplicación entra en la última usada', async () => {
    localStorage.setItem('marela.ultimaExplotacion', O_SOUTO.id)
    simularApi({ ...estado, conSesion: true })
    const router = abrir('/')
    expect(await screen.findByRole('heading', { name: 'O Souto', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/explotaciones/${O_SOUTO.id}`)
  })

  it('el selector cambia de explotación', async () => {
    simularApi({ ...estado, conSesion: true })
    const usuario = userEvent.setup()
    abrir(`/explotaciones/${A_VEIGA.id}`)
    const [selector] = await screen.findAllByRole('button', { name: /Explotación: A Veiga/ })
    await usuario.click(selector as HTMLElement)
    const hoja = screen.getByRole('dialog', { name: 'Cambiar de explotación' })
    await usuario.click(within(hoja).getByRole('link', { name: /O Souto/ }))
    expect(await screen.findByRole('heading', { name: 'O Souto', level: 1 })).toBeInTheDocument()
  })

  it('una explotación a la que no se pertenece no se muestra', async () => {
    simularApi({ ...estado, conSesion: true })
    abrir('/explotaciones/00000000-0000-7000-8003-000000000099')
    expect(await screen.findByText('No tienes acceso a esta explotación')).toBeInTheDocument()
  })
})

describe('secciones según el rol', () => {
  it('el administrador ve las cuatro secciones', async () => {
    simularApi({ ...estado, conSesion: true })
    abrir(`/explotaciones/${A_VEIGA.id}`)
    const navegacion = await screen.findByRole('navigation', { name: 'Secciones' })
    for (const seccion of ['Animales', 'Comida', 'Fincas', 'Finanzas']) {
      expect(within(navegacion).getByRole('link', { name: seccion })).toBeInTheDocument()
    }
  })

  it('al empleado no le aparece Finanzas, ni puede entrar por la dirección', async () => {
    simularApi({ ...estado, conSesion: true })
    abrir(`/explotaciones/${O_SOUTO.id}/finanzas`)
    const navegacion = await screen.findByRole('navigation', { name: 'Secciones' })
    expect(within(navegacion).queryByRole('link', { name: 'Finanzas' })).not.toBeInTheDocument()
    expect(within(navegacion).getByRole('link', { name: 'Animales' })).toBeInTheDocument()
    expect(screen.getByText('No tienes acceso a Finanzas')).toBeInTheDocument()
  })
})

describe('cuenta', () => {
  it('cierra la sesión y vuelve al inicio de sesión', async () => {
    simularApi({ ...estado, conSesion: true })
    const usuario = userEvent.setup()
    const router = abrir(`/explotaciones/${A_VEIGA.id}`)
    await usuario.click(await screen.findByRole('button', { name: 'Tu cuenta' }))
    await usuario.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/entrar')
    expect(estado.conSesion).toBe(false)
  })

  it('si la sesión caduca, una petición de datos lleva al inicio de sesión', async () => {
    simularApi({ ...estado, conSesion: true })
    const router = abrir(`/explotaciones/${A_VEIGA.id}`)
    expect(await screen.findByRole('heading', { name: 'A Veiga', level: 1 })).toBeInTheDocument()
    // La sesión caduca en el servidor y la siguiente consulta responde 401
    estado.conSesion = false
    simularApi(estado)
    router.navigate(`/explotaciones/${O_SOUTO.id}`)
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })
})
