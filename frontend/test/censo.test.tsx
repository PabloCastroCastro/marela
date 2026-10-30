import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VistaPreviaCenso } from '../src/animales/censo'
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

const VISTA: VistaPreviaCenso = {
  rega: A_VEIGA.rega,
  fecha: '2026-10-30',
  total: 3,
  nuevos: [
    {
      crotal: 'ES221100670172',
      sexo: 'hembra',
      raza: 'Cruzada',
      fechaNacimiento: '2026-10-17',
      origen: 'nacido',
      fechaEntrada: null,
      regaOrigen: null,
      madre: { crotal: 'ES021114250806', enCenso: true, id: null },
      madreTexto: null,
      observaciones: null,
    },
    {
      crotal: 'ES021114250806',
      sexo: 'hembra',
      raza: 'Rubia Gallega',
      fechaNacimiento: '2023-09-24',
      origen: 'comprado',
      fechaEntrada: '2026-10-30',
      regaOrigen: 'ES150520068301',
      madre: null,
      madreTexto: 'ES031112197103',
      observaciones: 'Importado del censo del 30/10/2026.',
    },
  ],
  existentes: [
    {
      id: 'a1',
      crotal: 'ES041503456789',
      diferencias: [{ campo: 'raza', censo: 'Rubia Gallega', aplicacion: 'Limusina' }],
    },
  ],
  ausentes: [{ id: 'a2', crotal: 'ES041503456790', nombre: 'Moura' }],
}

let estado: EstadoSimulado
// Lo que han recibido las rutas del censo
let recibidos: { ruta: string; archivo: FormDataEntryValue | null }[]

// La API simulada de siempre, con las dos rutas del censo encima
function simularCenso(respuestas: { vista?: Response; importacion?: Response }) {
  const api = simularApi(estado)
  vi.stubGlobal('fetch', async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const peticion =
      entrada instanceof Request
        ? entrada
        : new Request(new URL(String(entrada), 'http://localhost'), opciones)
    const ruta = new URL(peticion.url).pathname
    if (ruta.endsWith('/censo/vista-previa') || ruta.endsWith('/censo/importacion')) {
      recibidos.push({ ruta, archivo: (await peticion.formData()).get('archivo') })
      const respuesta = ruta.endsWith('vista-previa') ? respuestas.vista : respuestas.importacion
      return (
        respuesta ??
        Response.json({ error: { codigo: 'error', mensaje: 'Sin simular' } }, { status: 500 })
      )
    }
    return api(entrada, opciones)
  })
}

const pdf = () => new File(['%PDF-1.7'], 'Censo_ES150780000001.pdf', { type: 'application/pdf' })
const censo = `/explotaciones/${A_VEIGA.id}/animales/censo`

beforeEach(() => {
  localStorage.clear()
  estado = estadoInicial({ conSesion: true })
  recibidos = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('importar el censo en PDF', () => {
  it('el administrador lo ve en Animales; el empleado, no', async () => {
    simularApi(estado)
    const usuario = userEvent.setup()
    const router = abrir(`/explotaciones/${A_VEIGA.id}/animales`)
    await usuario.click(await screen.findByRole('button', { name: 'Importar censo' }))
    expect(router.state.location.pathname).toBe(censo)
  })

  it('el empleado no lo ve ni puede entrar', async () => {
    simularApi(estado)
    abrir(`/explotaciones/${O_SOUTO.id}/animales`)
    expect(await screen.findByRole('heading', { name: 'Animales', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar censo' })).not.toBeInTheDocument()
  })

  it('el empleado que abre la dirección no tiene acceso', async () => {
    simularApi(estado)
    abrir(`/explotaciones/${O_SOUTO.id}/animales/censo`)
    expect(
      await screen.findByText('No tienes acceso a la administración de la explotación'),
    ).toBeInTheDocument()
  })

  it('enseña la vista previa y, al importar, da de alta los nuevos y vuelve a Animales', async () => {
    simularCenso({
      vista: Response.json(VISTA),
      importacion: Response.json({ creados: 2, fecha: '2026-10-30' }),
    })
    const usuario = userEvent.setup()
    const router = abrir(censo)
    await usuario.upload(await screen.findByLabelText('Elegir el PDF del censo'), pdf())

    expect(await screen.findByText(/Censo del 30\/10\/2026/)).toBeInTheDocument()
    const nuevos = screen.getByRole('list', { name: 'Animales que se darán de alta' })
    expect(within(nuevos).getAllByRole('listitem')).toHaveLength(2)
    expect(within(nuevos).getByText('Comprado')).toBeInTheDocument()
    expect(within(nuevos).getByText(/Madre: ES021114250806 \(del censo\)/)).toBeInTheDocument()
    expect(within(nuevos).getByText(/ES031112197103 \(no está en Marela/)).toBeInTheDocument()
    expect(screen.getByText(/1 nació en otra explotación: entra como comprado/)).toBeInTheDocument()
    expect(
      screen.getByText('Raza: en el censo Rubia Gallega, en Marela Limusina'),
    ).toBeInTheDocument()
    const ausentes = screen.getByRole('list', { name: 'Activos que no están en el censo' })
    expect(within(ausentes).getByRole('link', { name: 'ES041503456790' })).toBeInTheDocument()
    expect(recibidos).toHaveLength(1)

    await usuario.click(screen.getByRole('button', { name: 'Importar 2 animales' }))
    expect(await screen.findByText('Se han dado de alta 2 animales del censo')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/explotaciones/${A_VEIGA.id}/animales`)
    // Las dos peticiones llevan el PDF
    expect(recibidos.map((r) => [r.ruta.split('/').at(-1), (r.archivo as File).name])).toEqual([
      ['vista-previa', 'Censo_ES150780000001.pdf'],
      ['importacion', 'Censo_ES150780000001.pdf'],
    ])
  })

  it('si no hay nada nuevo, no ofrece importar', async () => {
    simularCenso({ vista: Response.json({ ...VISTA, nuevos: [] }) })
    const usuario = userEvent.setup()
    abrir(censo)
    await usuario.upload(await screen.findByLabelText('Elegir el PDF del censo'), pdf())
    expect(
      await screen.findByText('Todos los animales del censo ya están en Marela.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Importar/ })).not.toBeInTheDocument()
  })

  it('dice por qué no se puede leer el censo', async () => {
    const mensaje = 'El censo es de la explotación ES150340090301, no de esta (ES150780000001)'
    simularCenso({
      vista: Response.json(
        { error: { codigo: 'censo_de_otra_explotacion', mensaje } },
        { status: 422 },
      ),
    })
    const usuario = userEvent.setup()
    abrir(censo)
    await usuario.upload(await screen.findByLabelText('Elegir el PDF del censo'), pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent(mensaje)
    // Se puede elegir otro
    expect(screen.getByLabelText('Elegir otro PDF')).toBeInTheDocument()
  })
})
