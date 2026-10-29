import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { CampoFecha } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import { nuevoId, type Pendiente, reemplazar } from '../sinConexion/cola'
import { AVISO_GUARDADO, useRegistrar } from '../sinConexion/useRegistrar'
import { CLAVE_FINCAS } from './datos'
import estilos from './Fincas.module.css'
import { animales } from './pastoreos'

export type PastoreoEnCurso = { id: string; desde: string; animales: number }

// "Salida del pastoreo · 12 animales · 10/06/2026 · Agra de abaixo", para la lista de pendientes
// (GH-32)
const descripcion = (p: PastoreoEnCurso, fechaSalida: string, finca: string) =>
  `Salida del pastoreo · ${animales(p.animales)} · ${formatoFecha(fechaSalida)} · ${finca}`

// La salida de los animales de un pastoreo en curso (GH-28). Sin conexión, se guarda en el móvil y
// se envía sola al recuperarla, también la de un pastoreo cuya entrada aún no se ha enviado: van en
// orden. Con `pendiente`, se corrige la que no se pudo enviar (GH-32).
export function FormularioSalida({
  pastoreo,
  finca,
  pendiente,
  alCerrar,
}: {
  pastoreo: PastoreoEnCurso
  finca: { id: string; nombre: string }
  pendiente?: Pendiente
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const registrar = useRegistrar()
  const [fechaSalida, setFechaSalida] = useState(
    (pendiente?.cuerpo as { fechaSalida?: string } | undefined)?.fechaSalida ?? hoy(),
  )
  const [errorLocal, setErrorLocal] = useState<string>()

  const guardar = useMutation({
    mutationFn: async () => {
      if (pendiente) {
        reemplazar(pendiente.id, { fechaSalida }, descripcion(pastoreo, fechaSalida, finca.nombre))
        return 'Salida corregida: se volverá a enviar'
      }
      const resultado = await registrar(
        {
          id: nuevoId(),
          tipo: 'salida',
          metodo: 'PATCH',
          ruta: `/api/explotaciones/${explotacion.id}/pastoreos/${pastoreo.id}/salida`,
          cuerpo: { fechaSalida },
          descripcion: descripcion(pastoreo, fechaSalida, finca.nombre),
          contexto: {
            fincaId: finca.id,
            finca: JSON.stringify({ id: finca.id, nombre: finca.nombre }),
            pastoreo: JSON.stringify(pastoreo),
          },
          claves: [[...CLAVE_FINCAS, explotacion.id]],
        },
        () =>
          datos(
            api.PATCH('/api/explotaciones/{explotacionId}/pastoreos/{pastoreoId}/salida', {
              params: { path: { explotacionId: explotacion.id, pastoreoId: pastoreo.id } },
              body: { fechaSalida },
            }),
          ),
      )
      return 'enviado' in resultado ? 'Salida registrada' : AVISO_GUARDADO
    },
    onSuccess: async (mensaje) => {
      // En la cola, o corregida en ella: no ha cambiado nada en el servidor, y sin conexión
      // refrescar se quedaría esperando
      const enCola = mensaje !== 'Salida registrada'
      if (!enCola) await cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })
      avisar({ tipo: enCola ? 'info' : 'exito', mensaje })
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
