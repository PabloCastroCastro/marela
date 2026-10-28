import { Plus, Syringe, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton, BotonIcono } from '../componentes/Boton'
import { BotonFlotante } from '../componentes/BotonFlotante'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Vaca } from '../componentes/iconos'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { edad, fecha } from '../formato'
import estilos from './Animales.module.css'
import { type EstadoAnimal, identificacion, SEXOS, type Sexo, useAnimales } from './datos'
import { FormularioAnimal } from './FormularioAnimal'
import { FormularioEvento } from './FormularioEvento'
import { FormularioTratamiento } from './FormularioTratamiento'
import { InsigniaEstado } from './InsigniaEstado'
import { InsigniaGestacion } from './InsigniaGestacion'
import { InsigniaSupresion } from './InsigniaSupresion'

// "En supresión" y "Gestantes" se filtran como un estado más, aunque no lo son: se calculan de los
// tratamientos (GH-20) y de los eventos reproductivos (GH-22), y el animal sigue activo
type FiltroEstado = EstadoAnimal | 'en_supresion' | 'gestante' | 'todos'
type FiltroSexo = Sexo | 'todos'

// Animales de la explotación: buscar, filtrar, abrir su ficha y dar de alta (GH-15). Con
// casillas (en el móvil, manteniendo pulsado un animal) se marcan varios para registrarles un
// tratamiento (GH-20) o una cubrición (GH-22) a la vez.
export function PaginaAnimales() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('activo')
  const [sexo, setSexo] = useState<FiltroSexo>('todos')
  const [anadiendo, setAnadiendo] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [tratando, setTratando] = useState(false)
  const [cubriendo, setCubriendo] = useState(false)

  const filtrado = texto !== '' || estado !== 'activo' || sexo !== 'todos'
  const animales = useAnimales(explotacion.id, {
    q: texto || undefined,
    estado:
      estado === 'todos'
        ? undefined
        : estado === 'en_supresion' || estado === 'gestante'
          ? 'activo'
          : estado,
    sexo: sexo === 'todos' ? undefined : sexo,
    supresion: estado === 'en_supresion' ? 'en_curso' : undefined,
    gestacion: estado === 'gestante' ? 'en_curso' : undefined,
  })
  const abrir = (id: string) => navegar(`${rutaExplotacion(explotacion.id)}/animales/${id}`)
  // Solo cuentan los marcados que siguen en la lista con los filtros de ahora
  const seleccionados = (animales.data ?? []).filter((a) => seleccion.has(a.id))
  const desmarcar = () => setSeleccion(new Set())

  return (
    <section className={estilos.pagina}>
      <div className={estilos.titulo}>
        <h1>Animales</h1>
        <div className={estilos.soloAncho}>
          <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setAnadiendo(true)}>
            Añadir animal
          </Boton>
        </div>
      </div>

      <BarraFiltros
        buscador={<Buscador etiqueta="Buscar por crotal, nombre o raza" alCambiar={setTexto} />}
      >
        <FiltroDesplegable
          etiqueta="Estado"
          opciones={[
            { valor: 'activo', texto: 'Activos' },
            { valor: 'en_supresion', texto: 'En supresión' },
            { valor: 'gestante', texto: 'Gestantes' },
            { valor: 'vendido', texto: 'Vendidos' },
            { valor: 'muerto', texto: 'Muertos' },
            { valor: 'baja', texto: 'Otras bajas' },
            { valor: 'todos', texto: 'Todos' },
          ]}
          valor={estado}
          porDefecto="activo"
          alCambiar={setEstado}
        />
        <FiltroDesplegable
          etiqueta="Sexo"
          opciones={[
            { valor: 'todos', texto: 'Todos' },
            { valor: 'hembra', texto: 'Hembras' },
            { valor: 'macho', texto: 'Machos' },
          ]}
          valor={sexo}
          porDefecto="todos"
          alCambiar={setSexo}
        />
      </BarraFiltros>

      {animales.isPending ? (
        <Esqueleto bloques={[{ alto: '4.5rem' }, { alto: '4.5rem' }, { alto: '4.5rem' }]} />
      ) : animales.isError ? (
        <EstadoError alReintentar={() => animales.refetch()} reintentando={animales.isFetching} />
      ) : animales.data.length === 0 ? (
        filtrado ? (
          <EstadoVacio
            titulo="Ningún animal coincide"
            descripcion="Prueba con otra búsqueda o con otros filtros."
          />
        ) : (
          <EstadoVacio
            icono={<Vaca size={32} />}
            titulo="Aún no hay animales"
            descripcion="Da de alta el primero para empezar su ficha."
            accion={
              <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setAnadiendo(true)}>
                Añadir animal
              </Boton>
            }
          />
        )
      ) : (
        <>
          <p className={estilos.recuento} role="status">
            {animales.data.length} {animales.data.length === 1 ? 'animal' : 'animales'}
            <span className={estilos.soloMovil}> · Mantén pulsado uno para marcar varios</span>
          </p>
          <Tabla
            etiqueta="Animales"
            filas={animales.data}
            claveFila={(a) => a.id}
            alSeleccionar={(a) => abrir(a.id)}
            seleccion={{ claves: seleccion, alCambiar: setSeleccion, etiquetaFila: identificacion }}
            columnas={[
              {
                clave: 'crotal',
                titulo: 'Crotal',
                valor: (a) => a.crotal,
                ordenar: (a) => a.crotal,
                principal: true,
              },
              {
                clave: 'nombre',
                titulo: 'Nombre',
                valor: (a) => a.nombre ?? '—',
                ordenar: (a) => a.nombre,
              },
              { clave: 'raza', titulo: 'Raza', valor: (a) => a.raza, ordenar: (a) => a.raza },
              {
                clave: 'sexo',
                titulo: 'Sexo',
                valor: (a) => SEXOS[a.sexo],
                ordenar: (a) => a.sexo,
              },
              {
                clave: 'edad',
                titulo: 'Edad',
                valor: (a) => (
                  <span title={fecha(a.fechaNacimiento)}>{edad(a.fechaNacimiento)}</span>
                ),
                // Más edad primero en orden ascendente: se ordena por la fecha al revés
                ordenar: (a) => -new Date(a.fechaNacimiento).getTime(),
                numerica: true,
              },
              {
                clave: 'estado',
                titulo: 'Estado',
                valor: (a) => (
                  <span className={estilos.insignias}>
                    <InsigniaEstado estado={a.estado} />
                    {a.finSupresion && <InsigniaSupresion fin={a.finSupresion} corta />}
                    {a.gestacion && <InsigniaGestacion gestacion={a.gestacion} corta />}
                  </span>
                ),
                ordenar: (a) => a.estado,
              },
            ]}
          />
        </>
      )}

      {seleccionados.length > 0 ? (
        <div className={estilos.barraSeleccion}>
          <p role="status">
            {seleccionados.length === 1
              ? '1 seleccionado'
              : `${seleccionados.length} seleccionados`}
          </p>
          <div className={estilos.acciones}>
            <BotonIcono
              etiqueta="Desmarcar"
              icono={<X aria-hidden size={20} />}
              onClick={desmarcar}
            />
            <Boton variante="secundario" onClick={() => setCubriendo(true)}>
              Cubrir
            </Boton>
            <Boton icono={<Syringe aria-hidden size={20} />} onClick={() => setTratando(true)}>
              Tratar
            </Boton>
          </div>
        </div>
      ) : (
        <BotonFlotante
          etiqueta="Añadir animal"
          icono={<Plus aria-hidden size={26} />}
          alPulsar={() => setAnadiendo(true)}
        />
      )}
      {cubriendo && (
        <FormularioEvento
          animales={seleccionados}
          tipos={['cubricion', 'inseminacion']}
          alCerrar={() => setCubriendo(false)}
          alGuardar={desmarcar}
        />
      )}
      {tratando && (
        <FormularioTratamiento
          animales={seleccionados}
          alCerrar={() => setTratando(false)}
          alGuardar={desmarcar}
        />
      )}
      <FormularioAnimal
        abierto={anadiendo}
        alCerrar={() => setAnadiendo(false)}
        alGuardar={(a) => abrir(a.id)}
      />
    </section>
  )
}
