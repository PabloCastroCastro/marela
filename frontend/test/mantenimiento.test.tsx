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
const tareas = () => screen.findByRole('list', { name: 'Tareas' })

describe('tareas de mantenimiento (GH-112)', () => {
  it('es una sección más, también para el empleado, y abre en "Mis tareas"', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(mantenimiento(O_SOUTO.id))
    expect(
      within(await screen.findByRole('navigation', { name: 'Secciones' })).getByRole('link', {
        name: 'Mantenimiento',
      }),
    ).toBeInTheDocument()
    // Las mías y las sin asignar, pendientes: la del tractor sin asignar, no la de otra persona
    const lista = await tareas()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(1)
    expect(within(lista).getByText('Cambiar la rueda')).toBeInTheDocument()
    expect(within(lista).getByText(/Vencida el 10\/01\/2026/)).toBeInTheDocument()
    expect(within(lista).getByText('Prioridad alta')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Todas las pendientes' }))
    await vi.waitFor(async () =>
      expect(within(await tareas()).getAllByRole('listitem')).toHaveLength(2),
    )
    await usuario.click(screen.getByRole('button', { name: 'Hechas' }))
    expect(await within(await tareas()).findByText('Cambiar el aceite')).toBeInTheDocument()
  })

  it('da de alta una tarea de un equipo, y el administrador la asigna', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(mantenimiento())
    await tareas()
    await usuario.click(screen.getAllByRole('button', { name: 'Nueva tarea' })[0] as HTMLElement)
    const hoja = await screen.findByRole('dialog', { name: 'Nueva tarea' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText(/Indica la tarea/)).toBeInTheDocument()

    await usuario.type(within(hoja).getByRole('textbox', { name: /^Tarea/ }), 'Cambiar la boya')
    await usuario.selectOptions(
      within(hoja).getByRole('combobox', { name: /Máquina o infraestructura/ }),
      'Nave de las vacas',
    )
    await usuario.click(within(hoja).getByRole('button', { name: 'Alta' }))
    await usuario.selectOptions(within(hoja).getByRole('combobox', { name: /Asignada a/ }), 'u2')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Tarea creada: Cambiar la boya')).toBeInTheDocument()
    expect(estado.tareas.at(-1)).toMatchObject({
      titulo: 'Cambiar la boya',
      equipoId: 'eq2',
      prioridad: 'alta',
      asignadaAId: 'u2',
    })
  })

  it('el empleado no ve a quién asignar', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(mantenimiento(O_SOUTO.id))
    await tareas()
    await usuario.click(screen.getAllByRole('button', { name: 'Nueva tarea' })[0] as HTMLElement)
    const hoja = await screen.findByRole('dialog', { name: 'Nueva tarea' })
    expect(within(hoja).queryByRole('combobox', { name: /Asignada a/ })).not.toBeInTheDocument()
    expect(within(hoja).getByText(/el administrador la puede asignar/)).toBeInTheDocument()
  })

  it('se marca como hecha con un toque, y se deshace', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(mantenimiento())
    await usuario.click(await screen.findByRole('button', { name: 'Hecha: Cambiar la rueda' }))
    expect(await screen.findByText('Hecha: Cambiar la rueda')).toBeInTheDocument()
    expect(estado.tareas[0]?.hecha?.porId).toBe('u1')
    await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
    await vi.waitFor(() => expect(estado.tareas[0]?.hecha).toBeNull())
  })
})

describe('maquinaria e infraestructuras (GH-111)', () => {
  it('lista primero lo que tiene tareas pendientes', async () => {
    estado.tareas.push({
      id: 'ta9',
      titulo: 'Revisar el tejado',
      equipoId: 'eq2',
      descripcion: null,
      fechaLimite: null,
      prioridad: 'normal',
      asignadaAId: null,
      hecha: null,
    })
    simularApi(estado)
    abrir(`${mantenimiento()}?vista=equipos`)
    const [primero, segundo] = within(
      await screen.findByRole('list', { name: 'Equipos' }),
    ).getAllByRole('listitem')
    expect(primero).toHaveTextContent('Nave de las vacas')
    expect(primero).toHaveTextContent('2 tareas pendientes')
    expect(segundo).toHaveTextContent('Tractor John Deere')
    expect(segundo).toHaveTextContent('1 tarea pendiente')
  })

  it('da de alta una máquina y abre su ficha, con "Nueva tarea" ya en ella', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${mantenimiento()}?vista=equipos`)
    await screen.findByRole('list', { name: 'Equipos' })
    await usuario.click(
      screen.getAllByRole('button', { name: 'Añadir máquina o infraestructura' })[0] as HTMLElement,
    )
    const hoja = await screen.findByRole('dialog', { name: 'Nueva máquina o infraestructura' })
    await usuario.type(within(hoja).getByRole('textbox', { name: /Nombre/ }), 'Remolque')
    await usuario.click(within(hoja).getByRole('button', { name: 'Maquinaria' }))
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Remolque dado de alta')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Remolque' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Nueva tarea' }))
    const tarea = await screen.findByRole('dialog', { name: 'Nueva tarea' })
    expect(within(tarea).getByRole('combobox', { name: /Máquina o infraestructura/ })).toHaveValue(
      'eq3',
    )
    await usuario.type(within(tarea).getByRole('textbox', { name: /^Tarea/ }), 'Revisar las luces')
    await usuario.click(within(tarea).getByRole('button', { name: 'Guardar' }))
    expect(
      await within(await screen.findByRole('list', { name: 'Tareas pendientes' })).findByText(
        'Revisar las luces',
      ),
    ).toBeInTheDocument()
  })

  it('no repite nombres, y desde la ficha se desactiva y se reactiva', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${mantenimiento()}/eq1`)
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    const hoja = await screen.findByRole('dialog', { name: 'Editar · Tractor John Deere' })
    const nombre = within(hoja).getByRole('textbox', { name: /Nombre/ })
    await usuario.clear(nombre)
    await usuario.type(nombre, 'nave de las vacas')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await within(hoja).findByText('Ya hay un equipo con este nombre')).toBeInTheDocument()
    await usuario.click(within(hoja).getByRole('button', { name: 'Cancelar' }))

    await usuario.click(screen.getByRole('button', { name: 'Desactivar' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    )
    expect(await screen.findByText('Tractor John Deere desactivado')).toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Reactivar' }))
    expect(await screen.findByText('Tractor John Deere vuelve a estar activo')).toBeInTheDocument()
  })
})
