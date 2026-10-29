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

describe('fincas sin conexión (GH-32)', () => {
  const fincas = `/explotaciones/${A_VEIGA.id}/fincas`

  async function elegir(usuario: ReturnType<typeof userEvent.setup>, opcion: string) {
    await usuario.click(await screen.findByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: opcion,
      }),
    )
  }

  it('registra una labor en varias fincas sin conexión y la envía, una por finca y sin duplicar', async () => {
    estado.fincas[1] = { ...(estado.fincas[1] as (typeof estado.fincas)[number]), activa: true }
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(fincas)
    await screen.findByRole('list', { name: 'Fincas' })
    estado.sinRed = true
    await usuario.click(
      within(screen.getByRole('table', { name: 'Fincas' })).getByRole('checkbox', {
        name: 'Seleccionar todos',
      }),
    )
    await elegir(usuario, 'Otra labor')
    const hoja = screen.getByRole('dialog', { name: 'Registrar en 2 fincas' })
    await usuario.type(within(hoja).getByLabelText(/^Labor/), 'Encalado')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(
      await screen.findByText(
        'Sin conexión: se ha guardado en el móvil y se enviará al recuperarla',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(verCola()).toHaveLength(1))
    const [pendiente] = verCola()
    expect(pendiente).toMatchObject({
      tipo: 'labor',
      descripcion: expect.stringMatching(/^Encalado · .* · 2 fincas$/),
    })
    const ids = (pendiente?.cuerpo as { ids: string[] } | undefined)?.ids ?? []
    expect(ids).toHaveLength(2)

    estado.sinRed = false
    act(() => marcarConConexion())
    expect(await screen.findByText('Se ha enviado 1 registro pendiente')).toBeInTheDocument()
    expect(estado.labores.filter((l) => ids.includes(l.id)).map((l) => l.fincaId)).toEqual([
      'f1',
      'f2',
    ])
  })

  it('entrada y salida del pastoreo sin conexión: la salida se ofrece ya y se envían en orden', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    const tarjeta = await screen.findByRole('region', { name: 'Pastoreo' })
    await within(tarjeta).findByText('Sin pastoreos registrados')
    estado.sinRed = true

    await elegir(usuario, 'Entrada a pastar')
    let hoja = screen.getByRole('dialog', { name: 'Pastoreo · Agra de abaixo' })
    await usuario.type(within(hoja).getByLabelText(/^Número de animales/), '12')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    await screen.findByText(/se ha guardado en el móvil/)
    const sinEnviar = within(tarjeta).getByRole('list', { name: 'Pastoreos sin enviar' })
    expect(within(sinEnviar).getByText(/^Entrada a pastar · 12 animales/)).toBeInTheDocument()

    // La entrada aún no ha llegado, pero ya se puede registrar su salida
    await elegir(usuario, 'Salida del pastoreo')
    hoja = screen.getByRole('dialog', { name: 'Registrar la salida' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(verCola().map((p) => p.tipo)).toEqual(['pastoreo', 'salida']))

    estado.sinRed = false
    act(() => marcarConConexion())
    expect(await screen.findByText('Se han enviado 2 registros pendientes')).toBeInTheDocument()
    expect(estado.pastoreos).toMatchObject([{ fincaId: 'f1', animales: 12 }])
    expect(estado.pastoreos[0]?.fechaSalida).not.toBeNull()
  })

  it('un abonado rechazado al enviarlo se corrige desde la lista con su formulario', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${fincas}/f1`)
    await screen.findByRole('region', { name: 'Abonado y fitosanitarios' })
    estado.sinRed = true
    await elegir(usuario, 'Abono')
    let hoja = screen.getByRole('dialog', { name: /Registrar · Agra de abaixo/ })
    await usuario.type(within(hoja).getByLabelText(/^Abono/), 'Cal viva')
    await usuario.click(within(hoja).getByRole('button', { name: 'Mineral' }))
    await usuario.type(within(hoja).getByLabelText(/^Dosis/), '2')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    await screen.findByText(/se ha guardado en el móvil/)

    // Al volver, el servidor lo rechaza la primera vez
    estado.sinRed = false
    let rechazar = true
    const original = globalThis.fetch
    vi.stubGlobal('fetch', async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      if (rechazar && String(entrada).endsWith('/aplicaciones') && opciones?.method === 'POST') {
        rechazar = false
        return Response.json(
          { error: { codigo: 'validacion', mensaje: 'La dosis es demasiado alta' } },
          { status: 400 },
        )
      }
      return original(entrada, opciones)
    })
    act(() => marcarConConexion())
    await usuario.click(await screen.findByRole('button', { name: 'Ver' }))
    const lista = await screen.findByRole('dialog', { name: 'Registros sin enviar' })
    expect(within(lista).getByText(/La dosis es demasiado alta/)).toBeInTheDocument()
    await usuario.click(within(lista).getByRole('button', { name: /^Corregir Abono · Cal viva/ }))
    hoja = await screen.findByRole('dialog', { name: /Registrar · Agra de abaixo/ })
    expect(within(hoja).getByLabelText(/^Abono/)).toHaveValue('Cal viva')
    const dosis = within(hoja).getByLabelText(/^Dosis/)
    expect(dosis).toHaveValue('2')
    await usuario.clear(dosis)
    await usuario.type(dosis, '1,5')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Se ha enviado 1 registro pendiente')).toBeInTheDocument()
    expect(estado.aplicaciones.at(-1)).toMatchObject({ producto: 'Cal viva', dosis: 1.5 })
  })
})

describe('animales sin conexión (GH-33)', () => {
  const ficha = (id: string) => `/explotaciones/${A_VEIGA.id}/animales/${id}`

  async function elegir(usuario: ReturnType<typeof userEvent.setup>, opcion: string) {
    await usuario.click(await screen.findByRole('button', { name: 'Registrar' }))
    await usuario.click(
      within(screen.getByRole('dialog', { name: 'Registrar' })).getByRole('button', {
        name: opcion,
      }),
    )
  }

  it('registra un tratamiento sin conexión, lo muestra en la ficha y lo envía', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(ficha('a1'))
    const tarjeta = await screen.findByRole('region', { name: /Tratamientos/ })
    estado.sinRed = true
    await elegir(usuario, 'Tratamiento')
    const hoja = screen.getByRole('dialog', { name: /Registrar tratamiento · Marela/ })
    await usuario.selectOptions(within(hoja).getByLabelText(/^Motivo/), 'Enfermedad')
    await usuario.type(within(hoja).getByLabelText(/^Producto/), 'Meloxicam')
    await usuario.type(within(hoja).getByLabelText(/^Días de supresión/), '15')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar tratamiento' }))
    await screen.findByText(/se ha guardado en el móvil/)
    const sinEnviar = within(tarjeta).getByRole('list', { name: 'Tratamientos sin enviar' })
    expect(
      within(sinEnviar).getByText(/^Tratamiento · Meloxicam · .* · Marela/),
    ).toBeInTheDocument()
    const [id] = (verCola()[0]?.cuerpo as { ids: string[] } | undefined)?.ids ?? []

    estado.sinRed = false
    act(() => marcarConConexion())
    expect(await screen.findByText('Se ha enviado 1 registro pendiente')).toBeInTheDocument()
    expect(estado.tratamientos.find((t) => t.id === id)).toMatchObject({
      animalId: 'a1',
      producto: 'Meloxicam',
    })
  })

  it('un parto con el crotal repetido falla al enviarlo y se corrige desde la lista', async () => {
    const enUso = estado.animales[1]?.crotal ?? ''
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(ficha('a1'))
    const tarjeta = await screen.findByRole('region', { name: 'Reproducción' })
    estado.sinRed = true
    await elegir(usuario, 'Parto')
    let hoja = screen.getByRole('dialog', { name: /Registrar · Marela/ })
    const ternero = within(hoja).getByRole('group', { name: 'Ternero' })
    await usuario.click(within(ternero).getByRole('button', { name: 'Hembra' }))
    await usuario.type(within(ternero).getByLabelText(/^Crotal/), enUso)
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar parto' }))
    await screen.findByText(/se ha guardado en el móvil/)
    expect(
      within(within(tarjeta).getByRole('list', { name: 'Partos sin enviar' })).getByText(
        /^Parto · 1 ternero · .* · Marela/,
      ),
    ).toBeInTheDocument()
    const cuerpo = verCola()[0]?.cuerpo as { id: string; terneros: { id: string }[] }

    estado.sinRed = false
    act(() => marcarConConexion())
    await usuario.click(await screen.findByRole('button', { name: 'Ver' }))
    const lista = await screen.findByRole('dialog', { name: 'Registros sin enviar' })
    expect(within(lista).getByText(/No se ha podido enviar: crotal_en_uso/)).toBeInTheDocument()
    await usuario.click(within(lista).getByRole('button', { name: /^Corregir Parto/ }))
    hoja = await screen.findByRole('dialog', { name: /Registrar · Marela/ })
    const crotal = within(hoja).getByLabelText(/^Crotal/)
    expect(crotal).toHaveValue(enUso)
    await usuario.clear(crotal)
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar parto' }))
    expect(await screen.findByText('Se ha enviado 1 registro pendiente')).toBeInTheDocument()
    // Con los ids del dispositivo: el parto y la ficha del ternero
    expect(estado.partos.find((p) => p.id === cuerpo.id)).toMatchObject({ madreId: 'a1' })
    expect(estado.animales.find((a) => a.id === cuerpo.terneros[0]?.id)).toMatchObject({
      madreId: 'a1',
      sexo: 'hembra',
      crotal: null,
    })
  })
})
