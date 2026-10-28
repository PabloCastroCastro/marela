import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import estilos from './Animales.module.css'
import { CLAVE_ANIMALES, identificacion } from './datos'
import {
  type DatosTratamiento,
  finSupresion,
  MOTIVOS_TRATAMIENTO,
  type MotivoTratamiento,
  useOpcionesTratamiento,
  VIAS,
  type ViaAdministracion,
} from './tratamientos'

type AnimalTratado = {
  id: string
  crotal: string
  nombre?: string | null
  fechaNacimiento: string
  fechaBaja?: string | null
}

// Valor del selector de quién lo administra para escribir un nombre
const OTRA_PERSONA = 'otra'

// Registrar un tratamiento a uno o varios animales (GH-20). Se crea uno por animal, todos iguales.
export function FormularioTratamiento({
  animales,
  alCerrar,
  alGuardar,
}: {
  animales: AnimalTratado[]
  alCerrar: () => void
  alGuardar?: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const sesion = useSesion()
  const opciones = useOpcionesTratamiento(explotacion.id)
  const idProductos = useId()

  // Entre el nacimiento del más joven y hoy, o la primera baja si alguno ya no está
  const primerDia = animales.reduce(
    (max, a) => (a.fechaNacimiento > max ? a.fechaNacimiento : max),
    '',
  )
  const ultimoDia = animales.reduce(
    (min, a) => (a.fechaBaja && a.fechaBaja < min ? a.fechaBaja : min),
    hoy(),
  )
  const yo = sesion.data?.usuario
  const [f, setF] = useState({
    fecha: ultimoDia,
    motivo: '' as MotivoTratamiento | '',
    producto: '',
    diagnostico: '',
    dosis: '',
    via: '' as ViaAdministracion | '',
    diasSupresion: '',
    lote: '',
    aplicadoPor: yo?.id ?? '',
    aplicadoPorTexto: '',
    observaciones: '',
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = (campo: keyof typeof f, valor: string) => setF((v) => ({ ...v, [campo]: valor }))

  const guardar = useMutation({
    mutationFn: (cuerpo: DatosTratamiento) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/tratamientos', {
          params: { path: { explotacionId: explotacion.id } },
          body: cuerpo,
        }),
      ),
    onSuccess: async (creados) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje:
          creados.length === 1
            ? 'Tratamiento registrado'
            : `Tratamiento registrado a ${creados.length} animales`,
      })
      alGuardar?.()
      alCerrar()
    },
  })

  const errores = { ...erroresPorCampo(guardar.error), ...erroresLocales }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null

  const dias = /^\d+$/.test(f.diasSupresion.trim()) ? Number(f.diasSupresion) : null
  const personas = opciones.data?.personas ?? (yo ? [{ id: yo.id, nombre: yo.name }] : [])

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    if (!f.motivo) locales.motivo = 'Indica el motivo'
    if (dias === null) locales.diasSupresion = 'Indica los días de supresión (0 si no tiene)'
    setErroresLocales(locales)
    if (!f.motivo || dias === null) return
    const otra = f.aplicadoPor === OTRA_PERSONA
    guardar.mutate({
      animalIds: animales.map((a) => a.id),
      fecha: f.fecha,
      motivo: f.motivo,
      producto: f.producto,
      diagnostico: f.diagnostico,
      dosis: f.dosis,
      via: f.via || null,
      diasSupresion: dias,
      lote: f.lote,
      aplicadoPorId: !otra && f.aplicadoPor ? f.aplicadoPor : null,
      aplicadoPorTexto: otra ? f.aplicadoPorTexto : null,
      observaciones: f.observaciones,
    })
  }

  const [unico] = animales
  const titulo =
    animales.length === 1 && unico
      ? `Registrar tratamiento · ${identificacion(unico)}`
      : `Tratar ${animales.length} animales`

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
          <Boton type="submit" form="formulario-tratamiento" cargando={guardar.isPending}>
            Guardar tratamiento
          </Boton>
        </>
      }
    >
      <form id="formulario-tratamiento" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {animales.length > 1 && (
          <p className={estilos.suave}>{animales.map((a) => a.crotal).join(', ')}</p>
        )}
        {errores.animalIds && (
          <p className={estilos.error} role="alert">
            {errores.animalIds}
          </p>
        )}
        <CampoFecha
          etiqueta="Fecha"
          value={f.fecha}
          min={primerDia}
          max={ultimoDia}
          onChange={(e) => cambiar('fecha', e.target.value)}
          error={errores.fecha}
          required
        />
        <Selector
          etiqueta="Motivo"
          value={f.motivo}
          onChange={(e) => cambiar('motivo', e.target.value)}
          error={errores.motivo}
          required
        >
          <option value="" disabled>
            Elige el motivo
          </option>
          {(Object.keys(MOTIVOS_TRATAMIENTO) as MotivoTratamiento[]).map((m) => (
            <option key={m} value={m}>
              {MOTIVOS_TRATAMIENTO[m]}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Producto o medicamento"
          list={idProductos}
          autoComplete="off"
          value={f.producto}
          onChange={(e) => cambiar('producto', e.target.value)}
          error={errores.producto}
          required
        />
        <datalist id={idProductos}>
          {(opciones.data?.productos ?? []).map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <Campo
          etiqueta="Enfermedad o motivo concreto"
          ayuda="Por ejemplo: neumonía, lengua azul"
          value={f.diagnostico}
          onChange={(e) => cambiar('diagnostico', e.target.value)}
          error={errores.diagnostico}
        />
        <div className={estilos.dosCampos}>
          <Campo
            etiqueta="Dosis"
            ayuda="Por ejemplo: 10 ml"
            value={f.dosis}
            onChange={(e) => cambiar('dosis', e.target.value)}
            error={errores.dosis}
          />
          <Selector
            etiqueta="Vía"
            value={f.via}
            onChange={(e) => cambiar('via', e.target.value)}
            error={errores.via}
          >
            <option value="">Sin indicar</option>
            {(Object.keys(VIAS) as ViaAdministracion[]).map((v) => (
              <option key={v} value={v}>
                {VIAS[v]}
              </option>
            ))}
          </Selector>
        </div>
        <div className={estilos.dosCampos}>
          <Campo
            etiqueta="Días de supresión"
            inputMode="numeric"
            autoComplete="off"
            ayuda={
              dias
                ? `Termina el ${formatoFecha(finSupresion(f.fecha, dias))}`
                : 'Los del prospecto; 0 si no tiene'
            }
            value={f.diasSupresion}
            onChange={(e) => cambiar('diasSupresion', e.target.value)}
            error={errores.diasSupresion}
            required
          />
          <Campo
            etiqueta="Lote del medicamento"
            autoComplete="off"
            value={f.lote}
            onChange={(e) => cambiar('lote', e.target.value)}
            error={errores.lote}
          />
        </div>
        <Selector
          etiqueta="Quién lo administra"
          value={f.aplicadoPor}
          onChange={(e) => cambiar('aplicadoPor', e.target.value)}
          error={errores.aplicadoPorId}
        >
          <option value="">Sin indicar</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
          <option value={OTRA_PERSONA}>Otra persona (escribir el nombre)</option>
        </Selector>
        {f.aplicadoPor === OTRA_PERSONA && (
          <Campo
            etiqueta="Nombre de quien lo administra"
            ayuda="Por ejemplo, el veterinario"
            value={f.aplicadoPorTexto}
            onChange={(e) => cambiar('aplicadoPorTexto', e.target.value)}
            error={errores.aplicadoPorTexto}
          />
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
