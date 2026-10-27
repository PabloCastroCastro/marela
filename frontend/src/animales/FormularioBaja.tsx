import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo, CampoFecha, Selector } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hoy } from '../formato'
import estilos from './Animales.module.css'
import {
  type AnimalDetalle,
  CLAVE_ANIMALES,
  type DatosBaja,
  identificacion,
  TIPOS_BAJA,
} from './datos'

type TipoFicha = DatosBaja['tipo']

// Las que se registran desde la ficha; la venta, desde Finanzas
const TIPOS: TipoFicha[] = ['muerte', 'sacrificio', 'robo_extravio', 'otra']

// Deshace una baja: el animal vuelve a estar activo
export function useDeshacerBaja(animalId: string) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  return useMutation({
    mutationFn: () =>
      datos(
        api.DELETE('/api/explotaciones/{explotacionId}/animales/{animalId}/baja', {
          params: { path: { explotacionId: explotacion.id, animalId } },
        }),
      ),
    onSuccess: async (a) => {
      await cliente.invalidateQueries({ queryKey: CLAVE_ANIMALES })
      avisar({ tipo: 'exito', mensaje: `${identificacion(a)} vuelve a estar activo` })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })
}

export function FormularioBaja({
  animal,
  alCerrar,
}: {
  animal: AnimalDetalle
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const deshacer = useDeshacerBaja(animal.id)
  const [tipo, setTipo] = useState<TipoFicha>('muerte')
  const [fecha, setFecha] = useState(hoy())
  const [causa, setCausa] = useState('')

  const baja = useMutation({
    mutationFn: () =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/animales/{animalId}/baja', {
          params: { path: { explotacionId: explotacion.id, animalId: animal.id } },
          body: { tipo, fecha, causa: causa || null },
        }),
      ),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_ANIMALES })
      avisar({
        mensaje: `Baja de ${identificacion(animal)} registrada`,
        accion: { texto: 'Deshacer', alPulsar: () => deshacer.mutate() },
      })
      alCerrar()
    },
  })

  const errores = erroresPorCampo(baja.error)
  const errorGeneral = baja.error && Object.keys(errores).length === 0 ? baja.error.message : null

  const registrar = (e: FormEvent) => {
    e.preventDefault()
    baja.mutate()
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={`Dar de baja ${identificacion(animal)}`}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton variante="peligro" type="submit" form="formulario-baja" cargando={baja.isPending}>
            Dar de baja
          </Boton>
        </>
      }
    >
      <form id="formulario-baja" className={estilos.formulario} onSubmit={registrar} noValidate>
        <p className={estilos.suave}>
          Dejará de aparecer entre los animales activos. Si te equivocas, podrás deshacerlo. Las
          ventas se registran desde Finanzas.
        </p>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Selector
          etiqueta="Motivo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoFicha)}
          error={errores.tipo}
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {TIPOS_BAJA[t]}
            </option>
          ))}
        </Selector>
        <CampoFecha
          etiqueta="Fecha"
          value={fecha}
          max={hoy()}
          onChange={(e) => setFecha(e.target.value)}
          error={errores.fecha}
          required
        />
        <Campo
          etiqueta={tipo === 'otra' ? 'Causa' : 'Detalle'}
          ayuda={tipo === 'otra' ? undefined : 'Opcional: enfermedad, circunstancias…'}
          value={causa}
          onChange={(e) => setCausa(e.target.value)}
          error={errores.causa}
          required={tipo === 'otra'}
        />
      </form>
    </HojaInferior>
  )
}
