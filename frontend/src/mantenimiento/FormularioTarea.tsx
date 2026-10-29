import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import {
  CLAVE_MANTENIMIENTO,
  type DatosTarea,
  PRIORIDADES,
  type Prioridad,
  type Tarea,
  useEquipos,
  usePersonas,
} from './datos'
import estilos from './Mantenimiento.module.css'

// Dar de alta una tarea de mantenimiento ("Cambiar la boya"), de un equipo o suelta, o corregirla o
// borrarla (GH-112). Cualquiera del equipo; solo el administrador elige a quién se asigna.
export function FormularioTarea({
  tarea,
  equipoInicial,
  alCerrar,
}: {
  // Para corregirla o borrarla
  tarea?: Tarea
  // Desde la ficha de un equipo, ya elegido
  equipoInicial?: string
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const administrador = explotacion.modulos.includes('administracion')
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const equipos = useEquipos(explotacion.id, { activo: 'true' })
  const personas = usePersonas(explotacion.id, administrador)
  const [f, setF] = useState({
    titulo: tarea?.titulo ?? '',
    equipoId: tarea?.equipo?.id ?? equipoInicial ?? '',
    descripcion: tarea?.descripcion ?? '',
    fechaLimite: tarea?.fechaLimite ?? '',
    prioridad: (tarea?.prioridad ?? 'normal') as Prioridad,
    asignadaAId: tarea?.asignadaA?.id ?? '',
  })
  const [errorTitulo, setErrorTitulo] = useState<string>()
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))
  const refrescar = () =>
    cliente.invalidateQueries({ queryKey: [...CLAVE_MANTENIMIENTO, explotacion.id] })

  const guardar = useMutation({
    mutationFn: (cuerpo: DatosTarea) =>
      datos(
        tarea
          ? api.PUT('/api/explotaciones/{explotacionId}/tareas/{tareaId}', {
              params: { path: { explotacionId: explotacion.id, tareaId: tarea.id } },
              body: cuerpo,
            })
          : api.POST('/api/explotaciones/{explotacionId}/tareas', {
              params: { path: { explotacionId: explotacion.id } },
              body: cuerpo,
            }),
      ),
    onSuccess: async (t) => {
      await refrescar()
      avisar({ tipo: 'exito', mensaje: tarea ? 'Tarea corregida' : `Tarea creada: ${t.titulo}` })
      alCerrar()
    },
  })

  // Para deshacer un borrado se vuelve a crear la misma tarea
  const recuperar = useMutation({
    mutationFn: (t: Tarea) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/tareas', {
          params: { path: { explotacionId: explotacion.id } },
          body: {
            titulo: t.titulo,
            equipoId: t.equipo?.id ?? null,
            descripcion: t.descripcion,
            fechaLimite: t.fechaLimite,
            prioridad: t.prioridad,
            asignadaAId: administrador ? (t.asignadaA?.id ?? null) : null,
          },
        }),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: (t: Tarea) =>
      datos(
        api.DELETE('/api/explotaciones/{explotacionId}/tareas/{tareaId}', {
          params: { path: { explotacionId: explotacion.id, tareaId: t.id } },
        }),
      ),
    onSuccess: async (t) => {
      await refrescar()
      avisar({
        mensaje: `Tarea borrada: ${t.titulo}`,
        accion: { texto: 'Deshacer', alPulsar: () => recuperar.mutate(t) },
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
    if (!f.titulo.trim()) {
      setErrorTitulo('Indica la tarea, por ejemplo "Cambiar la boya"')
      return
    }
    setErrorTitulo(undefined)
    guardar.mutate({
      titulo: f.titulo,
      equipoId: f.equipoId || null,
      descripcion: f.descripcion,
      fechaLimite: f.fechaLimite || null,
      prioridad: f.prioridad,
      // Quien no es administrador no la reasigna: se queda como estaba
      asignadaAId: administrador ? f.asignadaAId || null : (tarea?.asignadaA?.id ?? null),
    })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={tarea ? 'Corregir la tarea' : 'Nueva tarea'}
      pie={
        <>
          {tarea && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Trash2 aria-hidden size={18} />}
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(tarea)}
            >
              Borrar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-tarea" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-tarea" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Campo
          etiqueta="Tarea"
          ayuda='Lo que hay que hacer, por ejemplo "Cambiar la boya"'
          autoComplete="off"
          value={f.titulo}
          onChange={(e) => cambiar('titulo', e.target.value)}
          error={errorTitulo ?? errores.titulo}
          required
        />
        <Selector
          etiqueta="Máquina o infraestructura"
          value={f.equipoId}
          onChange={(e) => cambiar('equipoId', e.target.value)}
          error={errores.equipoId}
        >
          <option value="">Ninguna: tarea suelta</option>
          {/* La de la tarea, aunque ya no esté activa */}
          {tarea?.equipo && !equipos.data?.some((e) => e.id === tarea.equipo?.id) && (
            <option value={tarea.equipo.id}>{tarea.equipo.nombre}</option>
          )}
          {equipos.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </Selector>
        <AreaTexto
          etiqueta="Descripción"
          value={f.descripcion}
          onChange={(e) => cambiar('descripcion', e.target.value)}
          error={errores.descripcion}
        />
        <CampoFecha
          etiqueta="Fecha límite"
          ayuda="Opcional"
          value={f.fechaLimite}
          onChange={(e) => cambiar('fechaLimite', e.target.value)}
          error={errores.fechaLimite}
        />
        <fieldset className={estilos.grupo}>
          <legend>Prioridad</legend>
          <Chips
            etiqueta="Prioridad"
            opciones={(Object.keys(PRIORIDADES) as Prioridad[]).map((p) => ({
              valor: p,
              texto: PRIORIDADES[p],
            }))}
            seleccion={f.prioridad}
            alCambiar={(p) => cambiar('prioridad', p)}
          />
        </fieldset>
        {administrador ? (
          <Selector
            etiqueta="Asignada a"
            value={f.asignadaAId}
            onChange={(e) => cambiar('asignadaAId', e.target.value)}
            error={errores.asignadaAId}
          >
            <option value="">Sin asignar: la puede hacer cualquiera</option>
            {personas.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        ) : (
          <p className={estilos.suave}>
            {tarea?.asignadaA
              ? `Asignada a ${tarea.asignadaA.nombre}.`
              : 'Sin asignar: el administrador la puede asignar a alguien.'}
          </p>
        )}
      </form>
    </HojaInferior>
  )
}
