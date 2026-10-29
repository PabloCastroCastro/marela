import { ClipboardCheck, Plus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Boton } from '../componentes/Boton'
import { BotonFlotante } from '../componentes/BotonFlotante'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import {
  type FiltrosTareas,
  pendientes,
  TIPOS_EQUIPO,
  type TipoEquipo,
  useEquipos,
  useTareas,
} from './datos'
import { FormularioEquipo } from './FormularioEquipo'
import { FormularioTarea } from './FormularioTarea'
import { ListaTareas } from './ListaTareas'
import estilos from './Mantenimiento.module.css'

// Cuántas tareas pendientes tiene una máquina o una infraestructura: si alguna, necesita mantenimiento
export const InsigniaPendientes = ({ n }: { n: number }) =>
  n > 0 ? (
    <Insignia tipo="aviso" icono={<Wrench aria-hidden />}>
      {pendientes(n)}
    </Insignia>
  ) : (
    <Insignia tipo="exito">Al día</Insignia>
  )

type VistaTareas = 'mias' | 'todas' | 'hechas'

const FILTROS: Record<VistaTareas, FiltrosTareas> = {
  mias: { estado: 'pendiente', para: 'mi' },
  todas: { estado: 'pendiente' },
  hechas: { estado: 'hecha' },
}

// Mantenimiento (GH-111 y GH-112): las tareas por hacer, primero, y la maquinaria y las
// infraestructuras de la explotación. Cualquiera da de alta tareas y equipos; el administrador
// asigna las tareas. La pestaña, en la dirección para que se conserve al volver de una ficha.
export function PaginaMantenimiento() {
  const [busqueda, setBusqueda] = useSearchParams()
  const vista = busqueda.get('vista') === 'equipos' ? 'equipos' : 'tareas'
  const [creando, setCreando] = useState(false)

  return (
    <section className={estilos.pagina}>
      <div className={estilos.titulo}>
        <h1>Mantenimiento</h1>
        <div className={estilos.soloAncho}>
          <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setCreando(true)}>
            {vista === 'tareas' ? 'Nueva tarea' : 'Añadir máquina o infraestructura'}
          </Boton>
        </div>
      </div>

      <Chips
        etiqueta="Vista"
        opciones={[
          { valor: 'tareas', texto: 'Tareas' },
          { valor: 'equipos', texto: 'Maquinaria e infraestructuras' },
        ]}
        seleccion={vista}
        alCambiar={(v) =>
          setBusqueda(v === 'equipos' ? { vista: 'equipos' } : {}, { replace: true })
        }
      />

      {vista === 'tareas' ? <Tareas /> : <Equipos />}

      <BotonFlotante
        etiqueta={vista === 'tareas' ? 'Nueva tarea' : 'Añadir máquina o infraestructura'}
        icono={<Plus aria-hidden size={26} />}
        alPulsar={() => setCreando(true)}
      />
      {creando &&
        (vista === 'tareas' ? (
          <FormularioTarea alCerrar={() => setCreando(false)} />
        ) : (
          <EquipoNuevo alCerrar={() => setCreando(false)} />
        ))}
    </section>
  )
}

function EquipoNuevo({ alCerrar }: { alCerrar: () => void }) {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  return (
    <FormularioEquipo
      alCerrar={alCerrar}
      alGuardar={(e) => navegar(`${rutaExplotacion(explotacion.id)}/mantenimiento/${e.id}`)}
    />
  )
}

// "Mis tareas" son las asignadas a quien mira y las sin asignar
function Tareas() {
  const explotacion = useExplotacionActual()
  const [vista, setVista] = useState<VistaTareas>('mias')
  const tareas = useTareas(explotacion.id, FILTROS[vista])

  return (
    <>
      <Chips
        etiqueta="Qué tareas"
        opciones={[
          { valor: 'mias', texto: 'Mis tareas' },
          { valor: 'todas', texto: 'Todas las pendientes' },
          { valor: 'hechas', texto: 'Hechas' },
        ]}
        seleccion={vista}
        alCambiar={setVista}
      />
      {tareas.isPending ? (
        <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }, { alto: '4rem' }]} />
      ) : tareas.isError && !tareas.data ? (
        <EstadoError alReintentar={() => tareas.refetch()} reintentando={tareas.isFetching} />
      ) : tareas.data.length === 0 ? (
        <EstadoVacio
          icono={<ClipboardCheck size={32} />}
          titulo={vista === 'hechas' ? 'Aún no hay tareas hechas' : 'No hay tareas pendientes'}
          descripcion={
            vista === 'hechas'
              ? 'Las que se marquen como hechas aparecerán aquí.'
              : 'Da de alta lo que haya que hacer, por ejemplo "Cambiar la boya del bebedero".'
          }
        />
      ) : (
        <ListaTareas tareas={tareas.data} etiqueta="Tareas" />
      )}
    </>
  )
}

type FiltroTipo = TipoEquipo | 'todos'

// La maquinaria y las infraestructuras, las que tienen más tareas pendientes primero
function Equipos() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [activos, setActivos] = useState<'true' | 'false'>('true')
  const equipos = useEquipos(explotacion.id, {
    q: texto || undefined,
    tipo: tipo === 'todos' ? undefined : tipo,
    activo: activos,
  })
  const filtrado = texto !== '' || tipo !== 'todos' || activos !== 'true'
  const abrir = (id: string) => navegar(`${rutaExplotacion(explotacion.id)}/mantenimiento/${id}`)

  return (
    <>
      <BarraFiltros
        buscador={<Buscador etiqueta="Buscar por nombre o descripción" alCambiar={setTexto} />}
      >
        <Chips
          etiqueta="Tipo"
          opciones={[
            { valor: 'todos', texto: 'Todo' },
            { valor: 'maquinaria', texto: 'Maquinaria' },
            { valor: 'infraestructura', texto: 'Infraestructuras' },
          ]}
          seleccion={tipo}
          alCambiar={setTipo}
        />
        <FiltroDesplegable
          etiqueta="Estado"
          opciones={[
            { valor: 'true', texto: 'Activos' },
            { valor: 'false', texto: 'Desactivados' },
          ]}
          valor={activos}
          porDefecto="true"
          alCambiar={setActivos}
        />
      </BarraFiltros>

      {equipos.isPending ? (
        <Esqueleto bloques={[{ alto: '4.5rem' }, { alto: '4.5rem' }, { alto: '4.5rem' }]} />
      ) : equipos.isError && !equipos.data ? (
        <EstadoError alReintentar={() => equipos.refetch()} reintentando={equipos.isFetching} />
      ) : equipos.data.length === 0 ? (
        filtrado ? (
          <EstadoVacio
            titulo="Nada coincide"
            descripcion="Prueba con otra búsqueda o con otro filtro."
          />
        ) : (
          <EstadoVacio
            icono={<Wrench size={32} />}
            titulo="Aún no hay maquinaria ni infraestructuras"
            descripcion="Da de alta el tractor, los remolques, la nave… para llevar sus tareas de mantenimiento."
          />
        )
      ) : (
        <Tabla
          etiqueta="Equipos"
          filas={equipos.data}
          claveFila={(e) => e.id}
          alSeleccionar={(e) => abrir(e.id)}
          columnas={[
            {
              clave: 'nombre',
              titulo: 'Nombre',
              valor: (e) => e.nombre,
              ordenar: (e) => e.nombre,
              principal: true,
            },
            {
              clave: 'tipo',
              titulo: 'Tipo',
              valor: (e) => TIPOS_EQUIPO[e.tipo],
              ordenar: (e) => e.tipo,
            },
            {
              clave: 'descripcion',
              titulo: 'Descripción',
              valor: (e) => e.descripcion ?? '—',
            },
            {
              clave: 'estado',
              titulo: 'Mantenimiento',
              valor: (e) =>
                e.activo ? (
                  <InsigniaPendientes n={e.tareasPendientes} />
                ) : (
                  <Insignia>Desactivado</Insignia>
                ),
              ordenar: (e) => -e.tareasPendientes,
            },
          ]}
        />
      )}
    </>
  )
}
