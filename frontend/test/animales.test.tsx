import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { edad } from '../src/formato'
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

const animales = `/explotaciones/${A_VEIGA.id}/animales`
const tarjetas = () => screen.findByRole('list', { name: 'Animales' })

describe('lista de animales', () => {
  it('muestra los activos y filtra por estado y sexo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animales)
    const lista = await tarjetas()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('3 animales')).toBeInTheDocument()
    expect(within(lista).queryByText(/Vendida/)).not.toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Sexo/ }), 'Machos')
    expect(screen.getByRole('combobox', { name: /^Sexo/ })).toHaveAccessibleName('Sexo: Machos')
    expect(await screen.findByText('1 animal')).toBeInTheDocument()
    expect(within(await tarjetas()).getByText('ES041503456812')).toBeInTheDocument()

    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Sexo/ }), 'Todos')
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Estado/ }), 'Vendidos')
    expect(within(await tarjetas()).getByText('ES041503457099')).toBeInTheDocument()
  })

  it('busca por nombre, y avisa si no hay coincidencias', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animales)
    await tarjetas()
    await usuario.type(screen.getByRole('searchbox'), 'marela')
    expect(await screen.findByText('1 animal')).toBeInTheDocument()
    await usuario.clear(screen.getByRole('searchbox'))
    await usuario.type(screen.getByRole('searchbox'), 'nada que coincida')
    expect(await screen.findByText('Ningún animal coincide')).toBeInTheDocument()
  })

  it('sin animales invita a dar de alta el primero', async () => {
    estado.animales = []
    simularApi(estado)
    abrir(animales)
    expect(await screen.findByText('Aún no hay animales')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Añadir animal' }).length).toBeGreaterThan(0)
  })

  it('el empleado también tiene acceso', async () => {
    simularApi(estado)
    abrir(`/explotaciones/${O_SOUTO.id}/animales`)
    expect(await screen.findByRole('heading', { name: 'Animales', level: 1 })).toBeInTheDocument()
  })
})

describe('ficha del animal', () => {
  it('muestra sus datos, su madre y su padre enlazados, y sus hijos', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${animales}/a1`)
    expect(await screen.findByRole('heading', { name: 'Marela', level: 1 })).toBeInTheDocument()
    expect(screen.getAllByText('ES041503456789').length).toBeGreaterThan(0)
    const hijo = screen.getByRole('link', { name: 'ES041503457001' })

    await usuario.click(hijo)
    expect(
      await screen.findByRole('heading', { name: 'ES041503457001', level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Marela · ES041503456789' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Moreno · ES041503456812' })).toBeInTheDocument()
  })

  it('avisa si el animal no está en la explotación', async () => {
    simularApi(estado)
    abrir(`${animales}/no-existe`)
    expect(await screen.findByText('Este animal no está en la explotación')).toBeInTheDocument()
  })
})

describe('alta y edición', () => {
  it('da de alta un animal con su madre de la explotación y abre su ficha', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animales)
    await tarjetas()
    await usuario.click(screen.getAllByRole('button', { name: 'Añadir animal' })[0] as HTMLElement)
    const hoja = screen.getByRole('dialog', { name: 'Nuevo animal' })

    await usuario.type(within(hoja).getByLabelText(/^Crotal/), 'es041503457010')
    expect(within(hoja).getByLabelText(/^Crotal/)).toHaveValue('ES041503457010')
    await usuario.type(within(hoja).getByLabelText(/^Nombre/), 'Estrela')
    await usuario.type(within(hoja).getByLabelText(/^Raza/), 'Rubia Gallega')
    await usuario.type(within(hoja).getByLabelText(/Fecha de nacimiento/), '2026-09-01')
    // Como madre solo se ofrecen hembras; como padre, machos
    const madre = within(hoja).getByLabelText('Madre')
    expect(within(madre).queryByRole('option', { name: /Moreno/ })).not.toBeInTheDocument()
    await usuario.selectOptions(madre, 'Marela · ES041503456789')
    await usuario.selectOptions(within(hoja).getByLabelText('Padre'), 'Dosis o toro de fuera')
    await usuario.type(within(hoja).getByLabelText(/Padre \(nombre/), 'Dosis RG-1187')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de alta' }))

    expect(await screen.findByRole('heading', { name: 'Estrela', level: 1 })).toBeInTheDocument()
    expect(estado.animales.at(-1)).toMatchObject({
      crotal: 'ES041503457010',
      madreId: 'a1',
      padreId: null,
      padreTexto: 'Dosis RG-1187',
    })
  })

  it('muestra los errores en su campo', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animales)
    await tarjetas()
    await usuario.click(screen.getAllByRole('button', { name: 'Añadir animal' })[0] as HTMLElement)
    const hoja = screen.getByRole('dialog', { name: 'Nuevo animal' })
    await usuario.type(within(hoja).getByLabelText(/^Crotal/), 'ES041503456789')
    await usuario.type(within(hoja).getByLabelText(/^Raza/), 'Cruzada')
    await usuario.type(within(hoja).getByLabelText(/Fecha de nacimiento/), '2025-01-01')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de alta' }))
    expect(await within(hoja).findByText('Ya hay un animal con este crotal')).toBeInTheDocument()
    expect(within(hoja).getByLabelText(/^Crotal/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('edita la ficha desde la propia ficha', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${animales}/a1`)
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    const hoja = screen.getByRole('dialog', { name: /Editar Marela/ })
    expect(within(hoja).getByLabelText(/^Raza/)).toHaveValue('Rubia Gallega')
    await usuario.type(within(hoja).getByLabelText('Observaciones'), 'Buena madre')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar la ficha' }))
    expect(await screen.findByText('Buena madre')).toBeInTheDocument()
    expect(estado.animales[0]?.observaciones).toBe('Buena madre')
  })
})

describe('edad', () => {
  it('en días, semanas, meses o años', () => {
    const hoy = new Date('2026-10-27T12:00:00')
    expect(edad('2026-10-20', hoy)).toBe('7 días')
    expect(edad('2026-10-01', hoy)).toBe('3 semanas')
    expect(edad('2026-02-11', hoy)).toBe('8 meses')
    expect(edad('2019-03-14', hoy)).toBe('7 años')
  })
})

describe('bajas', () => {
  it('da de baja un animal desde su ficha y lo deshace desde el aviso', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${animales}/a1`)
    await usuario.click(await screen.findByRole('button', { name: 'Dar de baja' }))
    const hoja = screen.getByRole('dialog', { name: /Dar de baja Marela/ })
    await usuario.selectOptions(within(hoja).getByLabelText('Motivo'), 'Muerte')
    await usuario.type(within(hoja).getByLabelText(/^Detalle/), 'Neumonía')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de baja' }))

    expect(
      await screen.findByText('Baja de Marela · ES041503456789 registrada'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Baja' })).toBeInTheDocument()
    expect(estado.animales[0]).toMatchObject({
      estado: 'muerto',
      tipoBaja: 'muerte',
      causaBaja: 'Neumonía',
    })

    await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(await screen.findByText(/vuelve a estar activo/)).toBeInTheDocument()
    expect(estado.animales[0]?.estado).toBe('activo')
  })

  it('con otra causa pide explicarla', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${animales}/a1`)
    await usuario.click(await screen.findByRole('button', { name: 'Dar de baja' }))
    const hoja = screen.getByRole('dialog', { name: /Dar de baja/ })
    await usuario.selectOptions(within(hoja).getByLabelText('Motivo'), 'Otra causa')
    await usuario.click(within(hoja).getByRole('button', { name: 'Dar de baja' }))
    expect(await within(hoja).findByText('Explica la causa de la baja')).toBeInTheDocument()
  })

  it('deshace una baja desde la ficha, tras confirmarlo', async () => {
    estado.animales[0] = {
      ...(estado.animales[0] as (typeof estado.animales)[number]),
      estado: 'baja',
      tipoBaja: 'robo_extravio',
      fechaBaja: '2026-10-01',
    }
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${animales}/a1`)
    expect(await screen.findByText('Robo o extravío')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Deshacer la baja' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deshacer la baja' }),
    )
    expect(await screen.findByRole('button', { name: 'Dar de baja' })).toBeInTheDocument()
    expect(estado.animales[0]?.estado).toBe('activo')
  })

  it('una venta no se deshace desde la ficha', async () => {
    simularApi(estado)
    abrir(`${animales}/a4`)
    expect(await screen.findByText('Una venta se deshace desde Finanzas.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deshacer la baja' })).not.toBeInTheDocument()
  })

  it('las otras bajas se consultan con su filtro', async () => {
    estado.animales[1] = {
      ...(estado.animales[1] as (typeof estado.animales)[number]),
      estado: 'baja',
      tipoBaja: 'otra',
      fechaBaja: '2026-10-01',
      causaBaja: 'Cedido',
    }
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animales)
    expect(within(await tarjetas()).queryByText('ES041503456812')).not.toBeInTheDocument()
    await usuario.selectOptions(screen.getByRole('combobox', { name: /^Estado/ }), 'Otras bajas')
    expect(within(await tarjetas()).getByText('ES041503456812')).toBeInTheDocument()
  })
})
