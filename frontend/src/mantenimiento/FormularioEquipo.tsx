import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { CLAVE_MANTENIMIENTO, type Equipo, TIPOS_EQUIPO, type TipoEquipo } from './datos'
import estilos from './Mantenimiento.module.css'

// Dar de alta una máquina o una infraestructura, o cambiar sus datos (GH-111). Cualquiera del equipo.
// Si necesita mantenimiento lo dicen sus tareas pendientes (GH-112).
export function FormularioEquipo({
  equipo,
  alCerrar,
  alGuardar,
}: {
  // Para editarlo
  equipo?: Equipo
  alCerrar: () => void
  alGuardar?: (e: Equipo) => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [f, setF] = useState<{
    nombre: string
    tipo?: TipoEquipo
    descripcion: string
  }>({
    nombre: equipo?.nombre ?? '',
    tipo: equipo?.tipo,
    descripcion: equipo?.descripcion ?? '',
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})

  const guardar = useMutation({
    mutationFn: (cuerpo: { nombre: string; tipo: TipoEquipo; descripcion: string }) =>
      datos(
        equipo
          ? api.PUT('/api/explotaciones/{explotacionId}/equipos/{equipoId}', {
              params: { path: { explotacionId: explotacion.id, equipoId: equipo.id } },
              body: cuerpo,
            })
          : api.POST('/api/explotaciones/{explotacionId}/equipos', {
              params: { path: { explotacionId: explotacion.id } },
              body: cuerpo,
            }),
      ),
    onSuccess: async (e) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_MANTENIMIENTO, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje: equipo ? `${e.nombre} guardado` : `${e.nombre} dado de alta`,
      })
      alGuardar?.(e)
      alCerrar()
    },
  })

  const errores: Record<string, string | undefined> = {
    ...erroresPorCampo(guardar.error),
    ...erroresLocales,
  }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    if (!f.nombre.trim()) locales.nombre = 'Indica el nombre, por ejemplo "Tractor"'
    if (!f.tipo) locales.tipo = 'Indica si es maquinaria o una infraestructura'
    setErroresLocales(locales)
    if (f.tipo && Object.keys(locales).length === 0) guardar.mutate({ ...f, tipo: f.tipo })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={equipo ? `Editar · ${equipo.nombre}` : 'Nueva máquina o infraestructura'}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-equipo" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-equipo" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Campo
          etiqueta="Nombre"
          autoComplete="off"
          value={f.nombre}
          onChange={(e) => setF((v) => ({ ...v, nombre: e.target.value }))}
          error={errores.nombre}
          required
        />
        <fieldset className={estilos.grupo}>
          <legend>Tipo</legend>
          <Chips
            etiqueta="Tipo"
            opciones={(Object.keys(TIPOS_EQUIPO) as TipoEquipo[]).map((t) => ({
              valor: t,
              texto: TIPOS_EQUIPO[t],
            }))}
            seleccion={f.tipo}
            alCambiar={(t) => setF((v) => ({ ...v, tipo: t }))}
          />
          {errores.tipo && (
            <p className={estilos.error} role="alert">
              {errores.tipo}
            </p>
          )}
        </fieldset>
        <AreaTexto
          etiqueta="Descripción"
          ayuda="Marca, modelo, matrícula, ubicación…"
          value={f.descripcion}
          onChange={(e) => setF((v) => ({ ...v, descripcion: e.target.value }))}
          error={errores.descripcion}
        />
      </form>
    </HojaInferior>
  )
}
