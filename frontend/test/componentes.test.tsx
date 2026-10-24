import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DURACION_AVISO, useAvisos } from '../src/componentes/Avisos'
import { Boton, BotonIcono } from '../src/componentes/Boton'
import { Campo } from '../src/componentes/Campo'
import { useConfirmacion } from '../src/componentes/Confirmacion'
import { EstadoError } from '../src/componentes/Estados'
import { Chips } from '../src/componentes/Etiquetas'
import { Buscador, ESPERA_BUSCADOR } from '../src/componentes/Filtros'
import { HojaInferior } from '../src/componentes/HojaInferior'
import { Tabla } from '../src/componentes/Tabla'
import { euros, fecha, kilos, numero } from '../src/formato'
import { crearClienteConsultas, Proveedores } from '../src/proveedores'
import { rutas } from '../src/rutas'

const conProveedores = (ui: React.ReactNode) =>
  render(<Proveedores cliente={crearClienteConsultas()}>{ui}</Proveedores>)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Boton', () => {
  it('mientras carga está desactivado y lo anuncia', () => {
    render(<Boton cargando>Guardar parto</Boton>)
    const boton = screen.getByRole('button', { name: 'Guardar parto' })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')
  })

  it('el botón de icono tiene nombre accesible', () => {
    render(<BotonIcono etiqueta="Borrar" icono={<span />} />)
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
  })
})

describe('Campo', () => {
  it('asocia la etiqueta, la ayuda y el error', () => {
    render(<Campo etiqueta="Peso (kg)" ayuda="En kilos" error="Debe ser mayor que 0" />)
    const campo = screen.getByLabelText('Peso (kg)')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('En kilos Debe ser mayor que 0')
    expect(screen.getByRole('alert')).toHaveTextContent('Debe ser mayor que 0')
  })
})

describe('HojaInferior', () => {
  function Ejemplo() {
    const [abierta, setAbierta] = useState(false)
    return (
      <>
        <Boton onClick={() => setAbierta(true)}>Abrir</Boton>
        <HojaInferior abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Registrar peso">
          <Campo etiqueta="Peso" />
        </HojaInferior>
      </>
    )
  }

  it('se abre y se cierra con su botón o con Escape', async () => {
    const usuario = userEvent.setup()
    render(<Ejemplo />)
    const hoja = screen.getByRole('dialog', { hidden: true })
    expect(hoja).not.toHaveAttribute('open')

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(hoja).toHaveAttribute('open')
    expect(hoja).toHaveAccessibleName('Registrar peso')
    await usuario.click(within(hoja).getByRole('button', { name: 'Cerrar' }))
    expect(hoja).not.toHaveAttribute('open')

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }))
    fireEvent(hoja, new Event('cancel', { cancelable: true }))
    expect(hoja).not.toHaveAttribute('open')
  })
})

describe('useConfirmacion', () => {
  function Ejemplo({ alResponder }: { alResponder: (ok: boolean) => void }) {
    const confirmar = useConfirmacion()
    return (
      <Boton
        onClick={async () =>
          alResponder(
            await confirmar({
              titulo: '¿Dar de baja?',
              textoConfirmar: 'Dar de baja',
              peligrosa: true,
            }),
          )
        }
      >
        Baja
      </Boton>
    )
  }

  it('devuelve true al confirmar y false al cancelar', async () => {
    const usuario = userEvent.setup()
    const alResponder = vi.fn()
    conProveedores(<Ejemplo alResponder={alResponder} />)

    await usuario.click(screen.getByRole('button', { name: 'Baja' }))
    const dialogo = screen.getByRole('alertdialog', { name: '¿Dar de baja?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }))
    expect(alResponder).toHaveBeenLastCalledWith(true)

    await usuario.click(screen.getByRole('button', { name: 'Baja' }))
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(alResponder).toHaveBeenLastCalledWith(false)
  })
})

describe('useAvisos', () => {
  function Ejemplo({ alDeshacer = () => {} }: { alDeshacer?: () => void }) {
    const { avisar } = useAvisos()
    return (
      <>
        <Boton onClick={() => avisar({ tipo: 'exito', mensaje: 'Parto guardado' })}>Éxito</Boton>
        <Boton onClick={() => avisar({ tipo: 'error', mensaje: 'No se ha podido guardar' })}>
          Error
        </Boton>
        <Boton
          onClick={() =>
            avisar({ mensaje: 'Peso borrado', accion: { texto: 'Deshacer', alPulsar: alDeshacer } })
          }
        >
          Borrar
        </Boton>
      </>
    )
  }

  it('el de éxito desaparece a los 4 s y el de error se queda hasta cerrarlo', () => {
    vi.useFakeTimers()
    conProveedores(<Ejemplo />)
    fireEvent.click(screen.getByRole('button', { name: 'Éxito' }))
    fireEvent.click(screen.getByRole('button', { name: 'Error' }))
    expect(screen.getByText('Parto guardado')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(DURACION_AVISO + 100))
    expect(screen.queryByText('Parto guardado')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No se ha podido guardar')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByText('No se ha podido guardar')).not.toBeInTheDocument()
  })

  it('la acción se ejecuta y cierra el aviso', async () => {
    const usuario = userEvent.setup()
    const alDeshacer = vi.fn()
    conProveedores(<Ejemplo alDeshacer={alDeshacer} />)
    await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
    await usuario.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(alDeshacer).toHaveBeenCalledOnce()
    expect(screen.queryByText('Peso borrado')).not.toBeInTheDocument()
  })
})

describe('Tabla', () => {
  type Animal = { id: string; crotal: string; peso: number | null }
  const animales: Animal[] = [
    { id: '1', crotal: 'ES02', peso: 600 },
    { id: '2', crotal: 'ES10', peso: null },
    { id: '3', crotal: 'ES01', peso: 450 },
  ]
  const columnas = [
    {
      clave: 'crotal',
      titulo: 'Crotal',
      valor: (a: Animal) => a.crotal,
      ordenar: (a: Animal) => a.crotal,
      principal: true,
    },
    {
      clave: 'peso',
      titulo: 'Peso',
      valor: (a: Animal) => a.peso ?? '—',
      ordenar: (a: Animal) => a.peso,
      numerica: true,
    },
  ]

  const crotalesDeLaTabla = () =>
    within(screen.getByRole('table', { name: 'Animales' }))
      .getAllByRole('row')
      .slice(1)
      .map((fila) => within(fila).getAllByRole('cell')[0]?.textContent)

  it('ordena por columna, con los vacíos al final', async () => {
    const usuario = userEvent.setup()
    render(
      <Tabla etiqueta="Animales" filas={animales} columnas={columnas} claveFila={(a) => a.id} />,
    )
    expect(crotalesDeLaTabla()).toEqual(['ES02', 'ES10', 'ES01'])

    await usuario.click(screen.getByRole('button', { name: 'Peso' }))
    expect(screen.getByRole('columnheader', { name: 'Peso' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    expect(crotalesDeLaTabla()).toEqual(['ES01', 'ES02', 'ES10'])

    await usuario.click(screen.getByRole('button', { name: 'Peso' }))
    expect(screen.getByRole('columnheader', { name: 'Peso' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(crotalesDeLaTabla()).toEqual(['ES02', 'ES01', 'ES10'])

    // Orden natural de los textos: ES01, ES02, ES10
    await usuario.click(screen.getByRole('button', { name: 'Crotal' }))
    expect(crotalesDeLaTabla()).toEqual(['ES01', 'ES02', 'ES10'])
  })

  it('en el móvil muestra tarjetas que abren el detalle', async () => {
    const usuario = userEvent.setup()
    const alSeleccionar = vi.fn()
    render(
      <Tabla
        etiqueta="Animales"
        filas={animales}
        columnas={columnas}
        claveFila={(a) => a.id}
        alSeleccionar={alSeleccionar}
      />,
    )
    const tarjetas = screen.getByRole('list', { name: 'Animales' })
    await usuario.click(within(tarjetas).getByRole('button', { name: /ES10/ }))
    expect(alSeleccionar).toHaveBeenCalledWith(animales[1])
  })
})

describe('filtros', () => {
  it('el buscador avisa 300 ms después de dejar de escribir, y al borrar', () => {
    vi.useFakeTimers()
    const alCambiar = vi.fn()
    render(<Buscador etiqueta="Buscar animal" alCambiar={alCambiar} />)
    const campo = screen.getByRole('searchbox', { name: 'Buscar animal' })

    fireEvent.change(campo, { target: { value: 'Mar' } })
    fireEvent.change(campo, { target: { value: 'Marela ' } })
    act(() => vi.advanceTimersByTime(ESPERA_BUSCADOR - 50))
    expect(alCambiar).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(100))
    expect(alCambiar).toHaveBeenCalledExactlyOnceWith('Marela')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar la búsqueda' }))
    expect(alCambiar).toHaveBeenLastCalledWith('')
  })

  it('los chips marcan la opción seleccionada', async () => {
    const usuario = userEvent.setup()
    const alCambiar = vi.fn()
    render(
      <Chips
        etiqueta="Tipo"
        opciones={[
          { valor: 'todos', texto: 'Todos' },
          { valor: 'vaca', texto: 'Vacas' },
        ]}
        seleccion="todos"
        alCambiar={alCambiar}
      />,
    )
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vacas' })).toHaveAttribute('aria-pressed', 'false')
    await usuario.click(screen.getByRole('button', { name: 'Vacas' }))
    expect(alCambiar).toHaveBeenCalledWith('vaca')
  })
})

describe('EstadoError', () => {
  it('ofrece reintentar', async () => {
    const usuario = userEvent.setup()
    const alReintentar = vi.fn()
    render(<EstadoError alReintentar={alReintentar} />)
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(alReintentar).toHaveBeenCalledOnce()
  })
})

describe('catálogo de componentes', () => {
  it('está en /componentes en desarrollo y cambia el tema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({})),
    )
    const usuario = userEvent.setup()
    const router = createMemoryRouter(rutas, { initialEntries: ['/componentes'] })
    conProveedores(<RouterProvider router={router} />)
    expect(
      await screen.findByRole('heading', { name: 'Componentes', level: 1 }),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Oscuro' }))
    expect(document.documentElement.dataset.tema).toBe('oscuro')
    await usuario.click(screen.getByRole('button', { name: 'Sistema' }))
    expect(document.documentElement.dataset.tema).toBeUndefined()
  })
})

describe('formatos', () => {
  it('fechas dd/mm/aaaa, números, kilos y euros en español', () => {
    expect(fecha('2019-03-04')).toBe('04/03/2019')
    expect(numero(1234.5, 1)).toBe('1.234,5')
    expect(kilos(612)).toBe('612 kg')
    expect(euros(1234.5).replace(/\s/g, ' ')).toBe('1.234,50 €')
  })
})
