import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Animales.module.css'
import {
  type AnimalDetalle,
  CLAVE_ANIMALES,
  type DatosAnimal,
  identificacion,
  SEXOS,
  type Sexo,
  useAnimales,
  useRazas,
} from './datos'

// Madre o padre: ninguno, un animal de la explotación (su id) o un texto libre
const SIN = ''
const TEXTO = 'texto'

type Formulario = {
  crotal: string
  nombre: string
  raza: string
  sexo: Sexo
  fechaNacimiento: string
  madre: string
  madreTexto: string
  padre: string
  padreTexto: string
  origen: 'nacido' | 'comprado'
  fechaEntrada: string
  regaOrigen: string
  observaciones: string
}

const VACIO: Formulario = {
  crotal: '',
  nombre: '',
  raza: '',
  sexo: 'hembra',
  fechaNacimiento: '',
  madre: SIN,
  madreTexto: '',
  padre: SIN,
  padreTexto: '',
  origen: 'nacido',
  fechaEntrada: '',
  regaOrigen: '',
  observaciones: '',
}

const desdeAnimal = (a: AnimalDetalle): Formulario => ({
  crotal: a.crotal,
  nombre: a.nombre ?? '',
  raza: a.raza,
  sexo: a.sexo,
  fechaNacimiento: a.fechaNacimiento,
  madre: a.madreId ?? (a.madreTexto ? TEXTO : SIN),
  madreTexto: a.madreTexto ?? '',
  padre: a.padreId ?? (a.padreTexto ? TEXTO : SIN),
  padreTexto: a.padreTexto ?? '',
  origen: a.origen,
  fechaEntrada: a.fechaEntrada ?? '',
  regaOrigen: a.regaOrigen ?? '',
  observaciones: a.observaciones ?? '',
})

const aDatos = (f: Formulario): DatosAnimal => ({
  crotal: f.crotal,
  nombre: f.nombre || null,
  raza: f.raza,
  sexo: f.sexo,
  fechaNacimiento: f.fechaNacimiento,
  madreId: f.madre !== SIN && f.madre !== TEXTO ? f.madre : null,
  madreTexto: f.madre === TEXTO ? f.madreTexto : null,
  padreId: f.padre !== SIN && f.padre !== TEXTO ? f.padre : null,
  padreTexto: f.padre === TEXTO ? f.padreTexto : null,
  origen: f.origen,
  fechaEntrada: f.origen === 'comprado' ? f.fechaEntrada || null : null,
  regaOrigen: f.origen === 'comprado' ? f.regaOrigen || null : null,
  observaciones: f.observaciones || null,
})

type Props = {
  abierto: boolean
  alCerrar: () => void
  // Sin animal, es un alta; con él, se edita su ficha
  animal?: AnimalDetalle
  alGuardar?: (animal: AnimalDetalle) => void
}

export function FormularioAnimal({ abierto, alCerrar, animal, alGuardar }: Props) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const idRazas = useId()
  const [f, setF] = useState<Formulario>(animal ? desdeAnimal(animal) : VACIO)
  const razas = useRazas(explotacion.id)
  // Todos los animales de la explotación, para elegir madre y padre (también los dados de baja)
  const todos = useAnimales(explotacion.id)

  const guardar = useMutation({
    mutationFn: () =>
      animal
        ? datos(
            api.PATCH('/api/explotaciones/{explotacionId}/animales/{animalId}', {
              params: { path: { explotacionId: explotacion.id, animalId: animal.id } },
              body: aDatos(f),
            }),
          )
        : datos(
            api.POST('/api/explotaciones/{explotacionId}/animales', {
              params: { path: { explotacionId: explotacion.id } },
              body: aDatos(f),
            }),
          ),
    onSuccess: async (guardado) => {
      await cliente.invalidateQueries({ queryKey: CLAVE_ANIMALES })
      avisar({
        tipo: 'exito',
        mensaje: animal ? 'Ficha guardada' : `Alta de ${identificacion(guardado)}`,
      })
      if (!animal) setF(VACIO)
      guardar.reset()
      alGuardar?.(guardado)
      alCerrar()
    },
  })

  const errores = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? guardar.error.message : null
  const cambiar = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) =>
    setF((actual) => ({ ...actual, [campo]: valor }))

  const candidatos = (sexo: Sexo) =>
    (todos.data ?? []).filter((a) => a.sexo === sexo && a.id !== animal?.id)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    guardar.mutate()
  }

  return (
    <HojaInferior
      abierta={abierto}
      alCerrar={alCerrar}
      titulo={animal ? `Editar ${identificacion(animal)}` : 'Nuevo animal'}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-animal" cargando={guardar.isPending}>
            {animal ? 'Guardar la ficha' : 'Dar de alta'}
          </Boton>
        </>
      }
    >
      <form id="formulario-animal" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Campo
          etiqueta="Crotal"
          ayuda="ES y 12 dígitos"
          autoCapitalize="characters"
          spellCheck={false}
          value={f.crotal}
          onChange={(e) => cambiar('crotal', e.target.value.toUpperCase())}
          error={errores.crotal}
          required
        />
        <Campo
          etiqueta="Nombre"
          ayuda="Opcional"
          value={f.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          error={errores.nombre}
        />
        <Campo
          etiqueta="Raza"
          list={idRazas}
          ayuda="Elige una o escribe otra"
          value={f.raza}
          onChange={(e) => cambiar('raza', e.target.value)}
          error={errores.raza}
          required
        />
        <datalist id={idRazas}>
          {(razas.data ?? []).map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <fieldset className={estilos.grupo}>
          <legend>Sexo</legend>
          <Chips
            etiqueta="Sexo"
            opciones={Object.entries(SEXOS).map(([valor, texto]) => ({
              valor: valor as Sexo,
              texto,
            }))}
            seleccion={f.sexo}
            alCambiar={(sexo) => cambiar('sexo', sexo)}
          />
          {errores.sexo && (
            <p className={estilos.errorCampo} role="alert">
              {errores.sexo}
            </p>
          )}
        </fieldset>
        <CampoFecha
          etiqueta="Fecha de nacimiento"
          value={f.fechaNacimiento}
          onChange={(e) => cambiar('fechaNacimiento', e.target.value)}
          error={errores.fechaNacimiento}
          required
        />

        <Progenitor
          etiqueta="Madre"
          valor={f.madre}
          texto={f.madreTexto}
          candidatos={candidatos('hembra')}
          textoOtro="Otra que no está en la explotación"
          alCambiar={(v) => cambiar('madre', v)}
          alCambiarTexto={(t) => cambiar('madreTexto', t)}
          error={errores.madreId ?? errores.madreTexto}
        />
        <Progenitor
          etiqueta="Padre"
          valor={f.padre}
          texto={f.padreTexto}
          candidatos={candidatos('macho')}
          textoOtro="Dosis o toro de fuera"
          alCambiar={(v) => cambiar('padre', v)}
          alCambiarTexto={(t) => cambiar('padreTexto', t)}
          error={errores.padreId ?? errores.padreTexto}
        />

        <fieldset className={estilos.grupo}>
          <legend>Origen</legend>
          <Chips
            etiqueta="Origen"
            opciones={[
              { valor: 'nacido', texto: 'Nacido aquí' },
              { valor: 'comprado', texto: 'Comprado' },
            ]}
            seleccion={f.origen}
            alCambiar={(origen) => cambiar('origen', origen)}
          />
        </fieldset>
        {f.origen === 'comprado' && (
          <>
            <CampoFecha
              etiqueta="Fecha de entrada"
              value={f.fechaEntrada}
              onChange={(e) => cambiar('fechaEntrada', e.target.value)}
              error={errores.fechaEntrada}
              required
            />
            <Campo
              etiqueta="REGA de la explotación de origen"
              ayuda="ES y 12 dígitos"
              autoCapitalize="characters"
              spellCheck={false}
              value={f.regaOrigen}
              onChange={(e) => cambiar('regaOrigen', e.target.value.toUpperCase())}
              error={errores.regaOrigen}
              required
            />
          </>
        )}
        <AreaTexto
          etiqueta="Observaciones"
          value={f.observaciones}
          onChange={(e) => cambiar('observaciones', e.target.value)}
          error={errores.observaciones}
        />
      </form>
    </HojaInferior>
  )
}

function Progenitor({
  etiqueta,
  valor,
  texto,
  candidatos,
  textoOtro,
  alCambiar,
  alCambiarTexto,
  error,
}: {
  etiqueta: string
  valor: string
  texto: string
  candidatos: { id: string; crotal: string; nombre: string | null }[]
  textoOtro: string
  alCambiar: (valor: string) => void
  alCambiarTexto: (texto: string) => void
  error?: string
}) {
  return (
    <>
      <Selector
        etiqueta={etiqueta}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        error={valor === TEXTO ? undefined : error}
      >
        <option value={SIN}>Sin indicar</option>
        {candidatos.map((c) => (
          <option key={c.id} value={c.id}>
            {identificacion(c)}
          </option>
        ))}
        <option value={TEXTO}>{textoOtro}</option>
      </Selector>
      {valor === TEXTO && (
        <Campo
          etiqueta={`${etiqueta} (nombre, crotal o código)`}
          value={texto}
          onChange={(e) => alCambiarTexto(e.target.value)}
          error={error}
        />
      )}
    </>
  )
}
