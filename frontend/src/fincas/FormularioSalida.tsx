import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { CampoFecha } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import { CLAVE_FINCAS } from './datos'
import estilos from './Fincas.module.css'
import { animales } from './pastoreos'

// La salida de los animales de un pastoreo en curso (GH-28)
export function FormularioSalida({
  pastoreo,
  alCerrar,
}: {
  pastoreo: { id: string; desde: string; animales: number }
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [fechaSalida, setFechaSalida] = useState(hoy())
  const [errorLocal, setErrorLocal] = useState<string>()

  const guardar = useMutation({
    mutationFn: () =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/pastoreos/{pastoreoId}/salida', {
          params: { path: { explotacionId: explotacion.id, pastoreoId: pastoreo.id } },
          body: { fechaSalida },
        }),
      ),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })
      avisar({ tipo: 'exito', mensaje: 'Salida registrada' })
      alCerrar()
    },
  })

  const errores = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? guardar.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!fechaSalida || fechaSalida < pastoreo.desde) {
      setErrorLocal(
        fechaSalida ? 'La salida no puede ser antes de la entrada' : 'Indica la fecha de salida',
      )
      return
    }
    setErrorLocal(undefined)
    guardar.mutate()
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo="Registrar la salida"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-salida" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-salida" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <p>
          {animales(pastoreo.animales)} pastando desde el {formatoFecha(pastoreo.desde)}.
        </p>
        <CampoFecha
          etiqueta="Fecha de salida"
          value={fechaSalida}
          min={pastoreo.desde}
          max={hoy()}
          onChange={(e) => setFechaSalida(e.target.value)}
          error={errorLocal ?? errores.fechaSalida}
          required
        />
      </form>
    </HojaInferior>
  )
}
