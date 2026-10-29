import { QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_SESION } from '../src/auth/sesion'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'
import { encolar, type Pendiente, procesarCola, verCola } from '../src/sinConexion/cola'
import { hayConexion, marcarConConexion } from '../src/sinConexion/conexion'
import { guardarConsultas, restaurarConsultas } from '../src/sinConexion/persistencia'
import { A_VEIGA, type EstadoSimulado, estadoInicial, simularApi } from './simulacion'

function abrir(ruta: string, cliente = crearClienteConsultas()) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(
    <Proveedores cliente={cliente}>
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
  vi.useRealTimers()
})

const animal = `/explotaciones/${A_VEIGA.id}/animales/a3`

async function anadirPesada(usuario: ReturnType<typeof userEvent.setup>, kg: string) {
  await usuario.click(await screen.findByRole('button', { name: 'Registrar' }))
  await usuario.click(
    within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
      name: 'Pesada',
    }),
  )
  const hoja = screen.getByRole('dialog', { name: /Añadir pesada/ })
  await usuario.type(within(hoja).getByLabelText(/^Peso/), kg)
  await usuario.click(within(hoja).getByRole('button', { name: 'Guardar pesada' }))
}

// Un pendiente de prueba, para la cola sola
const pendiente = (cambios: Partial<Pendiente> = {}): Omit<Pendiente, 'estado' | 'creadoEn'> => ({
  id: crypto.randomUUID(),
  usuarioId: 'u1',
  explotacionId: A_VEIGA.id,
  tipo: 'pesada',
  metodo: 'POST',
  ruta: `/api/explotaciones/${A_VEIGA.id}/animales/a3/pesos`,
  cuerpo: { fecha: '2026-06-01', kg: 150, momento: 'otro' },
  descripcion: 'Pesada · ES36 0003 · 150 kg',
  contexto: { animalId: 'a3' },
  claves: [['animales']],
  ...cambios,
})

describe('cola de pendientes', () => {
  it('envía en orden: lo que llega se quita, lo rechazado queda con su motivo', async () => {
    simularApi(estado)
    const cliente = new QueryClient()
    const buena = pendiente()
    const repetida = pendiente({ cuerpo: { fecha: '2026-06-01', kg: 40, momento: 'nacimiento' } })
    const otra = pendiente({ cuerpo: { fecha: '2026-06-02', kg: 152, momento: 'otro' } })
    encolar({ ...buena, cuerpo: { ...(buena.cuerpo as object), id: buena.id } })
    encolar(repetida)
    encolar(otra)
    // De otro usuario: no se envía con esta sesión
    encolar(pendiente({ usuarioId: 'otro' }))

    expect(await procesarCola(cliente, 'u1')).toEqual({ enviados: 2, fallidos: 1, parado: false })
    expect(estado.pesadas.some((p) => p.id === buena.id)).toBe(true)
    expect(verCola().map((p) => [p.usuarioId, p.estado, p.error?.codigo])).toEqual([
      ['u1', 'fallido', 'momento_repetido'],
      ['otro', 'pendiente', undefined],
    ])
  })

  it('sin red, se queda pendiente y marca sin conexión; con la sesión caducada, también', async () => {
    estado.sinRed = true
    simularApi(estado)
    const cliente = new QueryClient()
    encolar(pendiente())
    expect(await procesarCola(cliente, 'u1')).toMatchObject({ enviados: 0, parado: true })
    expect(verCola()[0]?.estado).toBe('pendiente')
    expect(hayConexion()).toBe(false)

    marcarConConexion()
    estado.sinRed = false
    estado.conSesion = false
    cliente.setQueryData(CLAVE_SESION, { usuario: { id: 'u1' } })
    expect(await procesarCola(cliente, 'u1')).toMatchObject({ enviados: 0, parado: true })
    expect(verCola()[0]?.estado).toBe('pendiente')
    // Al inicio de sesión; después se envía
    expect(cliente.getQueryData(CLAVE_SESION)).toBeNull()
    estado.conSesion = true
    expect(await procesarCola(cliente, 'u1')).toMatchObject({ enviados: 1 })
    expect(verCola()).toEqual([])
  })

  it('reenviar con el mismo id no duplica', async () => {
    simularApi(estado)
    const cliente = new QueryClient()
    const p = pendiente()
    const cuerpo = { ...(p.cuerpo as object), id: p.id }
    encolar({ ...p, cuerpo })
    await procesarCola(cliente, 'u1')
    encolar({ ...p, cuerpo })
    await procesarCola(cliente, 'u1')
    expect(estado.pesadas.filter((x) => x.id === p.id)).toHaveLength(1)
  })
})

describe('consultas guardadas en el dispositivo', () => {
  it('guarda lo descargado de las secciones sin conexión y lo recupera al abrir', async () => {
    vi.useFakeTimers()
    const antes = new QueryClient()
    const parar = guardarConsultas(antes)
    antes.setQueryData(['animales', A_VEIGA.id, 'lista', {}], [{ id: 'a1' }])
    antes.setQueryData(['cartografia', 'recinto'], { superficie: 1 })
    await vi.advanceTimersByTimeAsync(1100)
    parar()

    const despues = new QueryClient()
    await restaurarConsultas(despues)
    expect(despues.getQueryData(['animales', A_VEIGA.id, 'lista', {}])).toEqual([{ id: 'a1' }])
    // Los servicios externos no se guardan
    expect(despues.getQueryData(['cartografia', 'recinto'])).toBeUndefined()
  })
})

describe('registrar sin conexión', () => {
  it('guarda la pesada en el móvil, la muestra pendiente y la envía al volver la conexión', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animal)
    const pesos = await screen.findByRole('region', { name: 'Pesos' })
    await within(pesos).findByRole('list', { name: 'Pesadas' })

    // Se va la cobertura: solo dejan de llegar las peticiones
    estado.sinRed = true
    await anadirPesada(usuario, '150,5')
    expect(
      await screen.findByText(
        'Sin conexión: la pesada se ha guardado en el móvil y se enviará al recuperarla',
      ),
    ).toBeInTheDocument()
    const sinEnviar = within(pesos).getByRole('list', { name: 'Pesadas sin enviar' })
    expect(within(sinEnviar).getByText('150,5 kg')).toBeInTheDocument()
    expect(within(sinEnviar).getByText('Sin enviar')).toBeInTheDocument()
    const indicador = screen.getByRole('button', {
      name: 'Sin conexión, 1 registro sin enviar',
    })

    // En la lista de pendientes
    await usuario.click(indicador)
    const lista = await screen.findByRole('dialog', { name: 'Registros sin enviar' })
    expect(within(lista).getByText(/Pesada · .* · 150,5 kg/)).toBeInTheDocument()
    expect(within(lista).getByText('Pendiente de enviar')).toBeInTheDocument()
    await usuario.click(within(lista).getByRole('button', { name: 'Cerrar' }))

    // Vuelve la cobertura
    estado.sinRed = false
    act(() => marcarConConexion())
    expect(await screen.findByText('Se ha enviado 1 registro pendiente')).toBeInTheDocument()
    expect(estado.pesadas.at(-1)).toMatchObject({ kg: 150.5, animalId: 'a3' })
    expect(
      within(pesos).queryByRole('list', { name: 'Pesadas sin enviar' }),
    ).not.toBeInTheDocument()
    expect(
      await within(within(pesos).getByRole('list', { name: 'Pesadas' })).findByText('150,5 kg'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sin enviar/ })).not.toBeInTheDocument()
  })

  it('si el servidor la rechaza al enviarla, se corrige desde la lista y se reenvía', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animal)
    await screen.findByRole('region', { name: 'Pesos' })
    estado.sinRed = true
    await usuario.click(await screen.findByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: 'Pesada',
      }),
    )
    let hoja = screen.getByRole('dialog', { name: /Añadir pesada/ })
    await usuario.type(within(hoja).getByLabelText(/^Peso/), '40')
    // Ya tiene la pesada al nacer: el servidor la rechazará
    await usuario.selectOptions(within(hoja).getByLabelText('Momento'), 'Al nacer')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar pesada' }))
    await screen.findByText(/la pesada se ha guardado en el móvil/)

    estado.sinRed = false
    act(() => marcarConConexion())
    expect(
      await screen.findByText('1 registro pendiente no se ha podido enviar'),
    ).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Ver' }))
    const lista = await screen.findByRole('dialog', { name: 'Registros sin enviar' })
    expect(within(lista).getByText('No se ha podido enviar: momento_repetido')).toBeInTheDocument()

    await usuario.click(within(lista).getByRole('button', { name: /^Corregir Pesada/ }))
    hoja = await screen.findByRole('dialog', { name: /Añadir pesada/ })
    expect(within(hoja).getByLabelText(/^Peso/)).toHaveValue('40')
    await usuario.selectOptions(within(hoja).getByLabelText('Momento'), 'Otra pesada')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar pesada' }))
    expect(await screen.findByText('Se ha enviado 1 registro pendiente')).toBeInTheDocument()
    expect(estado.pesadas.at(-1)).toMatchObject({ kg: 40, momento: 'otro' })
    expect(verCola()).toEqual([])
  })

  it('al cerrar sesión con registros sin enviar, avisa antes de borrarlos', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(animal)
    await screen.findByRole('region', { name: 'Pesos' })
    estado.sinRed = (ruta) => ruta.endsWith('/pesos')
    await anadirPesada(usuario, '150')
    await screen.findByText(/la pesada se ha guardado en el móvil/)

    await usuario.click(screen.getByRole('button', { name: 'Tu cuenta' }))
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    const aviso = await screen.findByRole('alertdialog')
    expect(aviso).toHaveTextContent('Hay 1 registro sin enviar')
    await usuario.click(within(aviso).getByRole('button', { name: 'Cancelar' }))
    expect(verCola()).toHaveLength(1)

    await usuario.click(screen.getByRole('button', { name: 'Tu cuenta' }))
    await usuario.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))
    await usuario.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cerrar sesión',
      }),
    )
    await waitFor(() => expect(verCola()).toEqual([]))
  })

  it('sin conexión y sin la ficha guardada, lo dice en lugar de cargar sin fin', async () => {
    simularApi(estado)
    const router = abrir(`/explotaciones/${A_VEIGA.id}/animales`)
    await screen.findByRole('list', { name: 'Animales' })
    // Se va la cobertura y se abre una ficha que no se ha abierto antes
    estado.sinRed = true
    await act(() => router.navigate(animal))
    expect(
      await screen.findByText(/Sin conexión\. Esto no está guardado en el dispositivo/),
    ).toBeInTheDocument()
  })
})
