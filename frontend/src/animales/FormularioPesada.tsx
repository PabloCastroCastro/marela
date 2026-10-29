import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo, CampoFecha, Selector } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy, kilos, numero } from '../formato'
import { enviarOGuardar, nuevoId, type Pendiente, reemplazar } from '../sinConexion/cola'
import estilos from './Animales.module.css'
import { type AnimalDetalle, identificacion } from './datos'
import {
  clavePesadas,
  type DatosPesada,
  MOMENTOS,
  type MomentoPesada,
  type NuevaPesada,
  type Pesada,
} from './pesos'

const ruta = '/api/explotaciones/{explotacionId}/animales/{animalId}/pesos' as const
const rutaPesada = `${ruta}/{pesoId}` as const

// "412,5" → 412.5; null si no es un número
const leerKg = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

// Lo que el formulario necesita del animal: también sirve el que se guardó con un pendiente
export type AnimalPesada = Pick<
  AnimalDetalle,
  'id' | 'crotal' | 'nombre' | 'fechaNacimiento' | 'fechaBaja'
>

// "Pesada · ES36 0001 · 412,5 kg", para la lista de pendientes
const descripcion = (animal: AnimalPesada, kg: number) =>
  `Pesada · ${identificacion(animal)} · ${kilos(kg, kg % 1 ? 1 : 0)}`

// Registrar una pesada nueva o, con `pesada`, corregirla o borrarla (GH-21). Sin conexión, la nueva
// se guarda en el móvil y se envía sola al recuperarla; con `pendiente`, se corrige la que no se
// pudo enviar (GH-31).
export function FormularioPesada({
  animal,
  pesada,
  pendiente,
  alCerrar,
}: {
  animal: AnimalPesada
  pesada?: Pesada
  pendiente?: Pendiente
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const path = { explotacionId: explotacion.id, animalId: animal.id }
  // El día de hoy, o el de la baja si el animal ya no está
  const ultimoDia = animal.fechaBaja && animal.fechaBaja < hoy() ? animal.fechaBaja : hoy()
  const inicial = pesada ?? (pendiente?.cuerpo as NuevaPesada | undefined)
  const [fecha, setFecha] = useState(inicial?.fecha ?? ultimoDia)
  const [kg, setKg] = useState(inicial ? numero(inicial.kg, inicial.kg % 1 ? 1 : 0) : '')
  const [momento, setMomento] = useState<MomentoPesada>(inicial?.momento ?? 'otro')
  // El id de la pesada nueva, el mismo en cada intento: reenviarla no la duplica
  const [id] = useState(() => pendiente?.id ?? nuevoId())
  const sesion = useSesion()
  const [errorKg, setErrorKg] = useState<string>()

  const refrescar = () =>
    cliente.invalidateQueries({ queryKey: clavePesadas(explotacion.id, animal.id) })

  const guardar = useMutation({
    mutationFn: async (cuerpo: DatosPesada) => {
      if (pesada)
        return datos(
          api.PUT(rutaPesada, { params: { path: { ...path, pesoId: pesada.id } }, body: cuerpo }),
        )
      const nueva: NuevaPesada = { ...cuerpo, id }
      // La que no se pudo enviar, corregida: vuelve a la cola
      if (pendiente) {
        reemplazar(pendiente.id, nueva, descripcion(animal, nueva.kg))
        return null
      }
      const resultado = await enviarOGuardar(
        {
          id,
          usuarioId: sesion.data?.usuario.id ?? '',
          explotacionId: explotacion.id,
          tipo: 'pesada',
          metodo: 'POST',
          ruta: `/api/explotaciones/${explotacion.id}/animales/${animal.id}/pesos`,
          cuerpo: nueva,
          descripcion: descripcion(animal, nueva.kg),
          contexto: {
            animalId: animal.id,
            crotal: animal.crotal ?? '',
            nombre: animal.nombre ?? '',
            fechaNacimiento: animal.fechaNacimiento,
            fechaBaja: animal.fechaBaja ?? '',
          },
          claves: [clavePesadas(explotacion.id, animal.id)],
        },
        () => datos(api.POST(ruta, { params: { path }, body: nueva })),
      )
      return 'enviado' in resultado ? resultado.enviado : null
    },
    onSuccess: async (p) => {
      if (!p) {
        avisar({
          tipo: 'info',
          mensaje: pendiente
            ? 'Pesada corregida: se volverá a enviar'
            : 'Sin conexión: la pesada se ha guardado en el móvil y se enviará al recuperarla',
        })
        alCerrar()
        return
      }
      await refrescar()
      avisar({
        tipo: 'exito',
        mensaje: `${pesada ? 'Pesada corregida' : 'Pesada guardada'}: ${kilos(p.kg, p.kg % 1 ? 1 : 0)}`,
      })
      alCerrar()
    },
  })

  // Para deshacer un borrado se vuelve a registrar la misma pesada
  const recuperar = useMutation({
    mutationFn: (p: Pesada) =>
      datos(
        api.POST(ruta, {
          params: { path },
          body: { fecha: p.fecha, kg: p.kg, momento: p.momento },
        }),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: (p: Pesada) =>
      datos(api.DELETE(rutaPesada, { params: { path: { ...path, pesoId: p.id } } })),
    onSuccess: async (p) => {
      await refrescar()
      avisar({
        mensaje: `Pesada del ${formatoFecha(p.fecha)} borrada`,
        accion: { texto: 'Deshacer', alPulsar: () => recuperar.mutate(p) },
      })
      alCerrar()
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const errores = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? guardar.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const valor = leerKg(kg)
    if (valor === null) {
      setErrorKg('Indica el peso en kg, por ejemplo 245,5')
      return
    }
    setErrorKg(undefined)
    guardar.mutate({ fecha, kg: valor, momento })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={`${pesada ? 'Corregir pesada' : 'Añadir pesada'} · ${identificacion(animal)}`}
      pie={
        <>
          {pesada && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Trash2 aria-hidden size={18} />}
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(pesada)}
            >
              Borrar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-pesada" cargando={guardar.isPending}>
            Guardar pesada
          </Boton>
        </>
      }
    >
      <form id="formulario-pesada" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Campo
          etiqueta="Peso (kg)"
          inputMode="decimal"
          autoComplete="off"
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          error={errorKg ?? errores.kg}
          required
          autoFocus
        />
        <CampoFecha
          etiqueta="Fecha"
          value={fecha}
          min={animal.fechaNacimiento}
          max={ultimoDia}
          onChange={(e) => setFecha(e.target.value)}
          error={errores.fecha}
          required
        />
        <Selector
          etiqueta="Momento"
          value={momento}
          onChange={(e) => setMomento(e.target.value as MomentoPesada)}
          error={errores.momento}
        >
          {(Object.keys(MOMENTOS) as MomentoPesada[]).map((m) => (
            <option key={m} value={m}>
              {MOMENTOS[m]}
            </option>
          ))}
        </Selector>
      </form>
    </HojaInferior>
  )
}
