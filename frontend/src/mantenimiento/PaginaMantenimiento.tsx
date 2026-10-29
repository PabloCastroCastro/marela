import { Plus, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton } from '../componentes/Boton'
import { BotonFlotante } from '../componentes/BotonFlotante'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { TIPOS_EQUIPO, type TipoEquipo, useEquipos } from './datos'
import { FormularioEquipo } from './FormularioEquipo'
import estilos from './Mantenimiento.module.css'

type FiltroTipo = TipoEquipo | 'todos'

// Aviso de que una máquina o una infraestructura necesita mantenimiento
export const InsigniaMantenimiento = ({ corta }: { corta?: boolean }) => (
  <Insignia tipo="aviso" icono={<Wrench aria-hidden />}>
    {corta ? 'Mantenimiento' : 'Necesita mantenimiento'}
  </Insignia>
)

// Mantenimiento: la maquinaria y las infraestructuras de la explotación (GH-111), las que necesitan
// mantenimiento primero. Cualquiera del equipo da de alta y edita. En el móvil, tarjetas; en pantalla
// ancha, tabla.
export function PaginaMantenimiento() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [activos, setActivos] = useState<'true' | 'false'>('true')
  const [anadiendo, setAnadiendo] = useState(false)
  const equipos = useEquipos(explotacion.id, {
    q: texto || undefined,
    tipo: tipo === 'todos' ? undefined : tipo,
    activo: activos,
  })
  const filtrado = texto !== '' || tipo !== 'todos' || activos !== 'true'
  const ruta = `${rutaExplotacion(explotacion.id)}/mantenimiento`
  const abrir = (id: string) => navegar(`${ruta}/${id}`)
  const pendientes = (equipos.data ?? []).filter((e) => e.necesitaMantenimiento).length

  const anadir = (
    <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setAnadiendo(true)}>
      Añadir máquina o infraestructura
    </Boton>
  )

  return (
    <section className={estilos.pagina}>
      <div className={estilos.titulo}>
        <h1>Mantenimiento</h1>
        <div className={estilos.soloAncho}>{anadir}</div>
      </div>

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
            descripcion="Da de alta el tractor, los remolques, la nave… para llevar su mantenimiento."
            accion={anadir}
          />
        )
      ) : (
        <>
          <p className={estilos.recuento} role="status">
            {equipos.data.length === 1 ? '1 equipo' : `${equipos.data.length} equipos`}
            {pendientes > 0 &&
              ` · ${pendientes} necesitan mantenimiento`.replace(
                /^ · 1 necesitan/,
                ' · 1 necesita',
              )}
          </p>
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
                titulo: 'Estado',
                valor: (e) =>
                  !e.activo ? (
                    <Insignia>Desactivado</Insignia>
                  ) : e.necesitaMantenimiento ? (
                    <InsigniaMantenimiento corta />
                  ) : (
                    <Insignia tipo="exito">Al día</Insignia>
                  ),
                ordenar: (e) => (e.necesitaMantenimiento ? 0 : 1),
              },
            ]}
          />
        </>
      )}

      <BotonFlotante
        etiqueta="Añadir máquina o infraestructura"
        icono={<Plus aria-hidden size={26} />}
        alPulsar={() => setAnadiendo(true)}
      />
      {anadiendo && (
        <FormularioEquipo alCerrar={() => setAnadiendo(false)} alGuardar={(e) => abrir(e.id)} />
      )}
    </section>
  )
}
