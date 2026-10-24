import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'

function abrir(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(
    <Proveedores cliente={crearClienteConsultas()}>
      <RouterProvider router={router} />
    </Proveedores>,
  )
}

function respuestaSalud(estado: number, cuerpo: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(cuerpo, { status: estado })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('aplicación', () => {
  it('muestra las cuatro secciones en la navegación', () => {
    respuestaSalud(200, { estado: 'ok', api: 'ok', baseDeDatos: 'ok' })
    abrir('/')
    const navegacion = screen.getByRole('navigation', { name: 'Secciones' })
    for (const seccion of ['Animales', 'Comida', 'Fincas', 'Finanzas']) {
      expect(navegacion).toHaveTextContent(seccion)
    }
  })

  it('indica que el servidor funciona', async () => {
    respuestaSalud(200, { estado: 'ok', api: 'ok', baseDeDatos: 'ok' })
    abrir('/')
    expect(await screen.findByText('Servidor y base de datos funcionando')).toBeInTheDocument()
  })

  it('indica que el servidor no responde', async () => {
    respuestaSalud(503, { estado: 'error', api: 'ok', baseDeDatos: 'error' })
    abrir('/')
    // Un 503 se reintenta una vez antes de darlo por fallido
    expect(
      await screen.findByText('El servidor no responde', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('abre una sección', () => {
    respuestaSalud(200, { estado: 'ok', api: 'ok', baseDeDatos: 'ok' })
    abrir('/fincas')
    expect(screen.getByRole('heading', { name: 'Fincas' })).toBeInTheDocument()
  })

  it('muestra la página no encontrada en rutas inexistentes', () => {
    abrir('/no-existe')
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument()
  })
})
