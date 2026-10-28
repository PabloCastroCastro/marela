import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useState } from 'react'
import { erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Animales.module.css'
import { CLAVE_ANIMALES } from './datos'

// Anular un dato sanitario o reproductivo registrado por error (GH-20, GH-22): no se borra, queda
// en la ficha con el motivo
export function FormularioAnulacion({
  titulo,
  descripcion,
  textoBoton,
  ayuda,
  mensajeExito,
  anular,
  alCerrar,
}: {
  // Una pregunta: "¿Anular el tratamiento?"
  titulo: string
  descripcion: ReactNode
  textoBoton: string
  ayuda: string
  mensajeExito: string
  anular: (motivo: string) => Promise<unknown>
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [motivo, setMotivo] = useState('')
  const [errorLocal, setErrorLocal] = useState<string>()

  const mutacion = useMutation({
    mutationFn: () => anular(motivo),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      avisar({ tipo: 'exito', mensaje: mensajeExito })
      alCerrar()
    },
  })

  const errores = erroresPorCampo(mutacion.error)
  const errorGeneral =
    mutacion.error && Object.keys(errores).length === 0 ? mutacion.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!motivo.trim()) {
      setErrorLocal('Indica por qué se anula')
      return
    }
    setErrorLocal(undefined)
    mutacion.mutate()
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={titulo}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            form="formulario-anulacion"
            variante="peligro"
            cargando={mutacion.isPending}
          >
            {textoBoton}
          </Boton>
        </>
      }
    >
      <form id="formulario-anulacion" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <p>{descripcion}</p>
        <AreaTexto
          etiqueta="Motivo de la anulación"
          ayuda={ayuda}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={errorLocal ?? errores.motivo}
          required
          autoFocus
        />
      </form>
    </HojaInferior>
  )
}
