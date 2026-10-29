import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus, PowerOff, RotateCcw } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, datos, ErrorApi } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import { CLAVE_MANTENIMIENTO, TIPOS_EQUIPO, useEquipo, useTareas } from './datos'
import { FormularioEquipo } from './FormularioEquipo'
import { FormularioTarea } from './FormularioTarea'
import { ListaTareas } from './ListaTareas'
import estilos from './Mantenimiento.module.css'
import { InsigniaPendientes } from './PaginaMantenimiento'

// Ficha de una máquina o una infraestructura (GH-111): sus datos, sus tareas pendientes y hechas, con
// "Nueva tarea" (GH-112), y editarla, desactivarla o reactivarla.
export function PaginaFichaEquipo() {
  const explotacion = useExplotacionActual()
  const { equipoId = '' } = useParams()
  const equipo = useEquipo(explotacion.id, equipoId)
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [editando, setEditando] = useState(false)

  const cambiarEstado = useMutation({
    mutationFn: (activo: boolean) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/equipos/{equipoId}/estado', {
          params: { path: { explotacionId: explotacion.id, equipoId } },
          body: { activo },
        }),
      ),
    onSuccess: async (e) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_MANTENIMIENTO, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje: e.activo ? `${e.nombre} vuelve a estar activo` : `${e.nombre} desactivado`,
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const volver = (
    <Link to={`${rutaExplotacion(explotacion.id)}/mantenimiento`} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      Mantenimiento
    </Link>
  )

  if (equipo.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '8rem' }]} />
      </section>
    )
  }
  if (equipo.isError && !equipo.data) {
    const noExiste = equipo.error instanceof ErrorApi && equipo.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Este equipo no está en la explotación"
            descripcion="Puede que se haya escrito mal la dirección."
          />
        ) : (
          <EstadoError alReintentar={() => equipo.refetch()} reintentando={equipo.isFetching} />
        )}
      </section>
    )
  }

  const e = equipo.data
  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>{e.nombre}</h1>
          <div className={estilos.insignias}>
            <span className={estilos.suave}>{TIPOS_EQUIPO[e.tipo]}</span>
            {!e.activo && <Insignia icono={<PowerOff aria-hidden />}>Desactivado</Insignia>}
            {e.activo && <InsigniaPendientes n={e.tareasPendientes} />}
          </div>
        </div>
        <div className={estilos.acciones}>
          <Boton
            variante="secundario"
            icono={<Pencil aria-hidden size={18} />}
            onClick={() => setEditando(true)}
          >
            Editar
          </Boton>
          {e.activo ? (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<PowerOff aria-hidden size={18} />}
              cargando={cambiarEstado.isPending}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: `¿Desactivar ${e.nombre}?`,
                  mensaje:
                    'Deja de aparecer entre los activos (vendido, desmontado…). Sus datos y su historial se conservan, y se puede reactivar.',
                  textoConfirmar: 'Desactivar',
                })
                if (ok) cambiarEstado.mutate(false)
              }}
            >
              Desactivar
            </Boton>
          ) : (
            <Boton
              variante="secundario"
              icono={<RotateCcw aria-hidden size={18} />}
              cargando={cambiarEstado.isPending}
              onClick={() => cambiarEstado.mutate(true)}
            >
              Reactivar
            </Boton>
          )}
        </div>
      </div>

      <Tarjeta aria-labelledby="equipo-datos">
        <h2 id="equipo-datos" className={estilos.tituloTarjeta}>
          Datos
        </h2>
        <dl className={estilos.datos}>
          <Dato titulo="Tipo">{TIPOS_EQUIPO[e.tipo]}</Dato>
          <Dato titulo="Descripción">
            <span className={estilos.descripcion}>{e.descripcion ?? 'Sin indicar'}</span>
          </Dato>
        </dl>
      </Tarjeta>

      <TarjetaTareas equipoId={e.id} activo={e.activo} />

      <p className={estilos.suave}>
        Alta el {fecha(e.creadoEn)} · Última modificación el {fecha(e.modificadoEn)}
      </p>

      {editando && <FormularioEquipo equipo={e} alCerrar={() => setEditando(false)} />}
    </section>
  )
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className={estilos.dato}>
      <dt>{titulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// Las tareas del equipo: las pendientes y, aparte, las hechas, las más recientes a la vista
function TarjetaTareas({ equipoId, activo }: { equipoId: string; activo: boolean }) {
  const explotacion = useExplotacionActual()
  const pendientes = useTareas(explotacion.id, { equipoId, estado: 'pendiente' })
  const hechas = useTareas(explotacion.id, { equipoId, estado: 'hecha' })
  const recorte = useRecorte(hechas.data ?? [])
  const [creando, setCreando] = useState(false)

  return (
    <Tarjeta aria-labelledby="equipo-tareas" className={estilos.tarjetaTareas}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="equipo-tareas" className={estilos.tituloTarjeta}>
          Tareas
        </h2>
        {activo && (
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<Plus aria-hidden size={18} />}
            onClick={() => setCreando(true)}
          >
            Nueva tarea
          </Boton>
        )}
      </div>
      {pendientes.isPending ? (
        <Esqueleto bloques={[{ alto: '3rem' }, { alto: '3rem' }]} />
      ) : pendientes.data && pendientes.data.length > 0 ? (
        <ListaTareas tareas={pendientes.data} etiqueta="Tareas pendientes" conEquipo={false} />
      ) : (
        <p className={estilos.suave}>Sin tareas pendientes</p>
      )}
      {hechas.data && hechas.data.length > 0 && (
        <>
          <h3 className={estilos.subtitulo}>Hechas</h3>
          <ListaTareas tareas={recorte.elementos} etiqueta="Tareas hechas" conEquipo={false} />
          {recorte.boton}
        </>
      )}
      {creando && <FormularioTarea equipoInicial={equipoId} alCerrar={() => setCreando(false)} />}
    </Tarjeta>
  )
}
