import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo, CampoFecha } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, CLAVE_ANIMALES, identificacion } from './datos'

// Las que más a menudo hacen que no se dejen hijas para reposición
const MOTIVOS_HABITUALES = [
  'Paratuberculosis',
  'Leucosis',
  'Neosporosis',
  'Diarrea vírica bovina (BVD)',
  'Rinotraqueítis infecciosa (IBR)',
]

// Marcar una vaca para no dejar sus hijas como madres reproductoras, con el motivo, o quitar la marca
// (GH-110). Sus hijas, las nacidas y las que nazcan, lo muestran.
export function FormularioReposicion({
  animal,
  alCerrar,
}: {
  animal: AnimalDetalle
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const idMotivos = useId()
  const marcada = animal.noAptaReposicion
  const [motivo, setMotivo] = useState('')
  const [desde, setDesde] = useState(hoy())
  const [errorMotivo, setErrorMotivo] = useState<string>()

  const guardar = useMutation({
    mutationFn: (cuerpo: { apta: boolean; motivo?: string; fecha?: string }) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/animales/{animalId}/reposicion', {
          params: { path: { explotacionId: explotacion.id, animalId: animal.id } },
          body: cuerpo,
        }),
      ),
    onSuccess: async (a) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje: a.noAptaReposicion
          ? `${identificacion(a)}: no se dejarán sus hijas para reposición`
          : `${identificacion(a)}: quitada la marca de reposición`,
      })
      alCerrar()
    },
  })

  const errores = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? guardar.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (marcada) {
      guardar.mutate({ apta: true })
      return
    }
    if (!motivo.trim()) {
      setErrorMotivo('Indica el motivo, por ejemplo Paratuberculosis')
      return
    }
    setErrorMotivo(undefined)
    guardar.mutate({ apta: false, motivo, fecha: desde })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={`Reposición · ${identificacion(animal)}`}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            form="formulario-reposicion"
            variante={marcada ? 'secundario' : 'primario'}
            cargando={guardar.isPending}
          >
            {marcada ? 'Quitar la marca' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <form id="formulario-reposicion" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {marcada ? (
          <p>
            Desde el {formatoFecha(marcada.desde)} no se dejan sus hijas para reposición:{' '}
            {marcada.motivo}. Al quitar la marca, sus hijas dejan de mostrar el aviso.
          </p>
        ) : (
          <>
            <p className={estilos.suave}>
              Sus hijas, las que ya tiene y las que nazcan, mostrarán el aviso "Madre no apta para
              reposición", para no dejarlas como madres reproductoras.
            </p>
            <Campo
              etiqueta="Motivo"
              ayuda="La enfermedad, por ejemplo Paratuberculosis"
              list={idMotivos}
              autoComplete="off"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              error={errorMotivo ?? errores.motivo}
              required
            />
            <datalist id={idMotivos}>
              {MOTIVOS_HABITUALES.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <CampoFecha
              etiqueta="Desde"
              value={desde}
              max={hoy()}
              onChange={(e) => setDesde(e.target.value)}
              error={errores.fecha}
              required
            />
          </>
        )}
      </form>
    </HojaInferior>
  )
}
