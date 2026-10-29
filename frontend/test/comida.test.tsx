import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hoy } from '../src/formato'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'
import {
  A_VEIGA,
  type EstadoSimulado,
  estadoInicial,
  movimientoSimulado,
  O_SOUTO,
  simularApi,
} from './simulacion'

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
  it('muestra el stock de cada almacén activo, en su unidad, y en rojo si es negativo', async () => {
    estado.movimientos = [
      movimientoSimulado({ id: 'm1', almacenId: 'al1', tipo: 'entrada', cantidad: 1 }),
      movimientoSimulado({ id: 'm2', almacenId: 'al4', tipo: 'entrada', cantidad: 3500 }),
      movimientoSimulado({ id: 'm3', almacenId: 'al3', tipo: 'salida', cantidad: 40 }),
    ]
    simularApi(estado)
    abrir(comida())
    const lista = await almacenes()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(4)
    const verde = within(lista).getByRole('region', { name: 'Pacas de hierba verde' })
    expect(within(verde).getByText('1 unidad')).toBeInTheDocument()
    expect(within(verde).getByText('Hierba verde')).toBeInTheDocument()
    const pienso = within(lista).getByRole('region', { name: 'Silo de pienso' })
    expect(within(pienso).getByText('3.500 kg')).toBeInTheDocument()
    const maiz = within(lista).getByRole('region', { name: 'Silo de maíz' })
    expect(within(maiz).getByText('-40 kg')).toBeInTheDocument()
    expect(within(maiz).getByText('Stock negativo')).toBeInTheDocument()
    expect(within(pienso).queryByText('Stock negativo')).not.toBeInTheDocument()
    // El desactivado, aparte
    const desactivados = screen.getByRole('region', { name: 'Desactivados' })
    expect(within(desactivados).getByText('Pacas de paja')).toBeInTheDocument()
  })

  it('el administrador crea un almacén con la unidad habitual de su comida', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(comida())
    await almacenes()
    await usuario.click(screen.getAllByRole('button', { name: 'Añadir almacén' })[0] as HTMLElement)
    const hoja = await screen.findByRole('dialog', { name: 'Nuevo almacén' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText(/Indica el nombre/)).toBeInTheDocument()
    expect(within(hoja).getByText('Indica qué comida guarda')).toBeInTheDocument()

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

  it('desde su ficha, el administrador lo edita, lo desactiva y lo reactiva', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(comida())
    await usuario.click(within(await almacenes()).getByRole('link', { name: 'Silo de maíz' }))
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    let hoja = await screen.findByRole('dialog', { name: 'Editar · Silo de maíz' })
    const nombre = within(hoja).getByRole('textbox', { name: /Nombre/ })
    await usuario.clear(nombre)
    await usuario.type(nombre, 'Silo de maíz grande')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Almacén guardado')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Silo de maíz grande' }),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Editar' }))
    hoja = await screen.findByRole('dialog', { name: 'Editar · Silo de maíz grande' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Desactivar' }))
    await usuario.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }),
    )
    expect(await screen.findByText('Silo de maíz grande desactivado')).toBeInTheDocument()
    expect(estado.almacenes[2]?.activo).toBe(false)
    // Desactivado, ya no se registra en él
    expect(screen.queryByRole('button', { name: /^Registrar/ })).not.toBeInTheDocument()

    await usuario.click(within(screen.getByRole('main')).getByRole('link', { name: 'Comida' }))
    await usuario.click(
      await screen.findByRole('button', { name: 'Reactivar Silo de maíz grande' }),
    )
    expect(await screen.findByText('Silo de maíz grande vuelve a estar activo')).toBeInTheDocument()
    expect(estado.almacenes[2]?.activo).toBe(true)
  })

  it('el empleado ve el stock y registra, pero no gestiona los almacenes', async () => {
    simularApi(estado)
    abrir(comida(O_SOUTO.id))
    const lista = await almacenes()
    expect(within(lista).getAllByRole('listitem')).toHaveLength(4)
    expect(
      within(lista).getByRole('button', { name: 'Registrar en Silo de pienso' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Añadir almacén' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Desactivados' })).not.toBeInTheDocument()
  })
})

describe('movimientos de comida', () => {
  it('registra una salida desde la tarjeta y avisa si el stock queda en negativo', async () => {
    estado.movimientos = [
      movimientoSimulado({ id: 'm1', almacenId: 'al4', tipo: 'entrada', cantidad: 100 }),
    ]
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(comida())
    const lista = await almacenes()
    await usuario.click(within(lista).getByRole('button', { name: 'Registrar en Silo de pienso' }))
    await usuario.click(await screen.findByRole('button', { name: 'Salida (ración)' }))
    const hoja = await screen.findByRole('dialog', { name: 'Salida · Silo de pienso' })
    await usuario.type(within(hoja).getByRole('textbox', { name: /Cantidad \(kg\)/ }), '120,5')
    expect(within(hoja).getByRole('status')).toHaveTextContent(
      'El stock quedará en -20,50 kg. Se guarda igualmente',
    )
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(
      await screen.findByText('Salida registrada. El stock queda en -20,50 kg'),
    ).toBeInTheDocument()
    expect(estado.movimientos.at(-1)).toMatchObject({
      tipo: 'salida',
      cantidad: 120.5,
      fecha: hoy(),
      origen: null,
    })
    const pienso = within(await almacenes()).getByRole('region', { name: 'Silo de pienso' })
    expect(await within(pienso).findByText('Stock negativo')).toBeInTheDocument()
  })

  it('registra una entrada de producción propia con su finca, desde la ficha', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${comida()}/al2`)
    await usuario.click(
      await screen.findByRole('button', { name: 'Registrar en Pacas de hierba seca' }),
    )
    await usuario.click(await screen.findByRole('button', { name: 'Entrada' }))
    const hoja = await screen.findByRole('dialog', { name: 'Entrada · Pacas de hierba seca' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText('Indica si es compra o producción propia')).toBeInTheDocument()
    expect(within(hoja).getByText(/Indica la cantidad/)).toBeInTheDocument()

    await usuario.type(within(hoja).getByRole('textbox', { name: /Cantidad \(unidades\)/ }), '40')
    await usuario.click(within(hoja).getByRole('button', { name: 'Producción propia' }))
    await usuario.selectOptions(
      await within(hoja).findByRole('combobox', { name: /Finca de origen/ }),
      'Agra de abaixo',
    )
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Entrada registrada')).toBeInTheDocument()
    expect(estado.movimientos.at(-1)).toMatchObject({
      tipo: 'entrada',
      cantidad: 40,
      origen: 'produccion_propia',
      fincaId: 'f1',
    })
    const movimientos = await screen.findByRole('list', { name: 'Movimientos' })
    expect(
      within(movimientos).getByText('Entrada · Producción propia (Agra de abaixo)'),
    ).toBeInTheDocument()
    expect(within(movimientos).getByText('+40 unidades')).toBeInTheDocument()
  })

  it('un recuento fija el stock y muestra la diferencia; pide el motivo', async () => {
    estado.movimientos = [
      movimientoSimulado({ id: 'm1', almacenId: 'al2', tipo: 'entrada', cantidad: 90 }),
    ]
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${comida()}/al2`)
    await usuario.click(
      await screen.findByRole('button', { name: 'Registrar en Pacas de hierba seca' }),
    )
    await usuario.click(await screen.findByRole('button', { name: 'Ajuste de inventario' }))
    const hoja = await screen.findByRole('dialog', { name: 'Ajuste · Pacas de hierba seca' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Recuento' }))
    await usuario.type(
      within(hoja).getByRole('textbox', { name: /Cantidad contada \(unidades\)/ }),
      '86',
    )
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(within(hoja).getByText('Indica el motivo del ajuste')).toBeInTheDocument()
    await usuario.type(within(hoja).getByRole('textbox', { name: /Motivo/ }), 'Recuento del pajar')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Ajuste registrado')).toBeInTheDocument()

    const movimientos = await screen.findByRole('list', { name: 'Movimientos' })
    const [recuento] = within(movimientos).getAllByRole('listitem')
    expect(recuento).toHaveTextContent('Recuento')
    expect(recuento).toHaveTextContent('Recuento del pajar')
    expect(recuento).toHaveTextContent('−4 unidades')
    expect(recuento).toHaveTextContent('Quedan 86 unidades')
  })

  it('filtra el historial por tipo y por fecha', async () => {
    estado.movimientos = [
      movimientoSimulado({
        id: 'm1',
        almacenId: 'al3',
        tipo: 'entrada',
        cantidad: 1000,
        fecha: '2026-09-01',
      }),
      movimientoSimulado({
        id: 'm2',
        almacenId: 'al3',
        tipo: 'salida',
        cantidad: 100,
        fecha: '2026-09-10',
      }),
      movimientoSimulado({
        id: 'm3',
        almacenId: 'al3',
        tipo: 'salida',
        cantidad: 50,
        fecha: '2026-09-20',
      }),
    ]
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${comida()}/al3`)
    const filas = async () =>
      within(await screen.findByRole('list', { name: 'Movimientos' })).getAllByRole('listitem')
    expect(await filas()).toHaveLength(3)
    await usuario.click(screen.getByRole('button', { name: 'Salidas' }))
    await vi.waitFor(async () => expect(await filas()).toHaveLength(2))
    await usuario.type(screen.getByLabelText(/Desde/), '2026-09-15')
    await vi.waitFor(async () => expect(await filas()).toHaveLength(1))
    expect((await filas())[0]).toHaveTextContent('20/09/2026')
  })

  it('corrige un movimiento y lo borra con deshacer', async () => {
    estado.movimientos = [
      movimientoSimulado({ id: 'm1', almacenId: 'al4', tipo: 'entrada', cantidad: 500 }),
    ]
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${comida()}/al4`)
    await usuario.click(
      await screen.findByRole('button', { name: 'Corregir entrada · compra del 01/10/2026' }),
    )
    let hoja = await screen.findByRole('dialog', { name: 'Corregir · Entrada · Silo de pienso' })
    const cantidad = within(hoja).getByRole('textbox', { name: /Cantidad/ })
    await usuario.clear(cantidad)
    await usuario.type(cantidad, '3.500')
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Movimiento corregido')).toBeInTheDocument()
    expect(estado.movimientos[0]?.cantidad).toBe(3500)

    await usuario.click(
      await screen.findByRole('button', { name: 'Corregir entrada · compra del 01/10/2026' }),
    )
    hoja = await screen.findByRole('dialog', { name: 'Corregir · Entrada · Silo de pienso' })
    await usuario.click(within(hoja).getByRole('button', { name: 'Borrar' }))
    expect(await screen.findByText('Entrada borrada (01/10/2026)')).toBeInTheDocument()
    expect(estado.movimientos).toHaveLength(0)
    await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
    await vi.waitFor(() => expect(estado.movimientos).toHaveLength(1))
    expect(estado.movimientos[0]).toMatchObject({ tipo: 'entrada', cantidad: 3500 })
  })
})

it('con movimientos, el formulario del almacén no deja cambiar la unidad', async () => {
  estado.movimientos = [
    movimientoSimulado({ id: 'm1', almacenId: 'al4', tipo: 'entrada', cantidad: 500 }),
  ]
  simularApi(estado)
  const usuario = userEvent.setup()
  abrir(`${comida()}/al4`)
  await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
  const hoja = await screen.findByRole('dialog', { name: 'Editar · Silo de pienso' })
  expect(within(hoja).getByText(/No se puede cambiar: ya tiene movimientos/)).toBeInTheDocument()
  expect(within(hoja).queryByRole('button', { name: 'Unidades (pacas)' })).not.toBeInTheDocument()
})

it('saca la ración desde la tarjeta: empieza en 1, con − y +, y se deshace', async () => {
  estado.movimientos = [
    movimientoSimulado({ id: 'm1', almacenId: 'al2', tipo: 'entrada', cantidad: 80 }),
  ]
  simularApi(estado)
  const usuario = userEvent.setup()
  abrir(comida())
  const seca = within(await almacenes()).getByRole('region', { name: 'Pacas de hierba seca' })
  const cifra = within(seca).getByRole('textbox', { name: /Cantidad que sacar/ })
  expect(cifra).toHaveValue('1')
  expect(within(seca).getByRole('button', { name: 'Una menos' })).toBeDisabled()
  await usuario.click(within(seca).getByRole('button', { name: 'Una más' }))
  await usuario.click(within(seca).getByRole('button', { name: 'Una más' }))
  await usuario.click(within(seca).getByRole('button', { name: 'Una menos' }))
  expect(cifra).toHaveValue('2')

  await usuario.click(within(seca).getByRole('button', { name: 'Sacar de Pacas de hierba seca' }))
  expect(
    await screen.findByText('Salida de 2 unidades de Pacas de hierba seca'),
  ).toBeInTheDocument()
  expect(estado.movimientos.at(-1)).toMatchObject({ tipo: 'salida', cantidad: 2, fecha: hoy() })
  expect(await within(seca).findByText('78 unidades')).toBeInTheDocument()
  // Vuelve a 1 para la siguiente
  expect(cifra).toHaveValue('1')

  await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
  await vi.waitFor(() => expect(estado.movimientos).toHaveLength(1))
  expect(await within(seca).findByText('80 unidades')).toBeInTheDocument()

  // Se puede escribir la cantidad, con decimales
  await usuario.clear(cifra)
  await usuario.type(cifra, '2,5')
  await usuario.click(within(seca).getByRole('button', { name: 'Sacar de Pacas de hierba seca' }))
  await vi.waitFor(() => expect(estado.movimientos.at(-1)?.cantidad).toBe(2.5))
})

describe('facturas de las entradas (GH-36)', () => {
  const entradas = () => [
    movimientoSimulado({ id: 'm1', almacenId: 'al4', tipo: 'entrada', cantidad: 500 }),
    movimientoSimulado({ id: 'm2', almacenId: 'al4', tipo: 'entrada', cantidad: 300 }),
    movimientoSimulado({
      id: 'm3',
      almacenId: 'al4',
      tipo: 'entrada',
      cantidad: 200,
      origen: 'produccion_propia',
    }),
  ]

  it('el administrador ve la factura de cada compra y filtra por origen y por factura', async () => {
    estado.movimientos = entradas()
    estado.facturas = estado.facturas.map((f) =>
      f.id === 'fa1' ? { ...f, movimientoIds: ['m1'] } : f,
    )
    simularApi(estado)
    const usuario = userEvent.setup()
    abrir(`${comida()}/al4`)
    const lista = await screen.findByRole('list', { name: 'Movimientos' })
    expect(within(lista).getByRole('link', { name: /Factura P-381/ })).toHaveAttribute(
      'href',
      `/explotaciones/${A_VEIGA.id}/finanzas/facturas/fa1`,
    )
    expect(within(lista).getAllByText('Sin factura')).toHaveLength(1)

    await usuario.selectOptions(screen.getByRole('combobox', { name: /Factura/ }), 'sin')
    await waitFor(() =>
      expect(within(lista).queryByRole('link', { name: /Factura P-381/ })).not.toBeInTheDocument(),
    )
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
    await usuario.selectOptions(screen.getByRole('combobox', { name: /Factura/ }), 'todas')
    await usuario.selectOptions(
      screen.getByRole('combobox', { name: /Origen/ }),
      'produccion_propia',
    )
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(1))
    expect(within(lista).getByText(/Producción propia/)).toBeInTheDocument()
  })

  it('el empleado filtra por origen pero no ve las facturas', async () => {
    estado.movimientos = entradas()
    estado.facturas = estado.facturas.map((f) =>
      f.id === 'fa1' ? { ...f, movimientoIds: ['m1'] } : f,
    )
    simularApi(estado)
    abrir(`${comida(O_SOUTO.id)}/al4`)
    const lista = await screen.findByRole('list', { name: 'Movimientos' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByRole('combobox', { name: /Origen/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Factura/ })).not.toBeInTheDocument()
    expect(within(lista).queryByText(/Factura/)).not.toBeInTheDocument()
    expect(within(lista).queryByText('Sin factura')).not.toBeInTheDocument()
  })
})
