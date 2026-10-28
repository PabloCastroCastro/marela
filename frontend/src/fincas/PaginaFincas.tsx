import { Plus, Wheat, X } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Boton, BotonIcono } from '../componentes/Boton'
import { BotonFlotante } from '../componentes/BotonFlotante'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas } from '../formato'
import { REGIMENES, useFincas } from './datos'
import estilos from './Fincas.module.css'
import { FormularioFinca } from './FormularioFinca'
import { InsigniaPastoreo } from './InsigniaPastoreo'
import { InsigniaSeguridad } from './InsigniaSeguridad'
import { MenuRegistrarFinca } from './MenuRegistrarFinca'

// Leaflet pesa: el mapa se descarga solo al elegir esa vista (GH-91)
const MapaFincas = lazy(() => import('./MapaFincas'))

// "En plazo de seguridad" (GH-27) y "En pastoreo" (GH-28) se filtran como un estado más, aunque
// no lo son
type FiltroEstado = 'true' | 'false' | 'en_plazo' | 'en_pastoreo' | 'todas'

// Fincas de la explotación: buscar, filtrar, abrir su ficha y dar de alta (GH-25). En el móvil,
// tarjetas; en pantalla ancha, tabla. Con casillas (en el móvil, manteniendo pulsada una finca) se
// marcan varias para registrarles la misma labor (GH-26), abonado o tratamiento (GH-27).
export function PaginaFincas() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('true')
  // Lista o mapa (GH-91), en la dirección para que se conserve al volver de una ficha
  const [busqueda, setBusqueda] = useSearchParams()
  const vista = busqueda.get('vista') === 'mapa' ? 'mapa' : 'lista'
  const [anadiendo, setAnadiendo] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  const filtrado = texto !== '' || estado !== 'true'
  const fincas = useFincas(explotacion.id, {
    q: texto || undefined,
    activa:
      estado === 'todas' || estado === 'en_plazo' || estado === 'en_pastoreo' ? undefined : estado,
    seguridad: estado === 'en_plazo' ? 'en_curso' : undefined,
    pastoreo: estado === 'en_pastoreo' ? 'en_curso' : undefined,
  })
  const abrir = (id: string) => navegar(`${rutaExplotacion(explotacion.id)}/fincas/${id}`)
  const total = (fincas.data ?? []).reduce((s, f) => s + f.superficie, 0)
  // Solo cuentan las marcadas que siguen en la lista con los filtros de ahora
  const seleccionadas = (fincas.data ?? []).filter((f) => seleccion.has(f.id))
  const desmarcar = () => setSeleccion(new Set())

  return (
    <section className={estilos.pagina}>
      <div className={estilos.titulo}>
        <h1>Fincas</h1>
        <div className={estilos.soloAncho}>
          <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setAnadiendo(true)}>
            Añadir finca
          </Boton>
        </div>
      </div>

      <BarraFiltros
        buscador={<Buscador etiqueta="Buscar por nombre o municipio" alCambiar={setTexto} />}
      >
        <Chips
          etiqueta="Vista"
          opciones={[
            { valor: 'lista', texto: 'Lista' },
            { valor: 'mapa', texto: 'Mapa' },
          ]}
          seleccion={vista}
          alCambiar={(v) => setBusqueda(v === 'mapa' ? { vista: 'mapa' } : {}, { replace: true })}
        />
        <FiltroDesplegable
          etiqueta="Estado"
          opciones={[
            { valor: 'true', texto: 'Activas' },
            { valor: 'en_pastoreo', texto: 'En pastoreo' },
            { valor: 'en_plazo', texto: 'En plazo de seguridad' },
            { valor: 'false', texto: 'Desactivadas' },
            { valor: 'todas', texto: 'Todas' },
          ]}
          valor={estado}
          porDefecto="true"
          alCambiar={setEstado}
        />
      </BarraFiltros>

      {fincas.isPending ? (
        <Esqueleto bloques={[{ alto: '4.5rem' }, { alto: '4.5rem' }, { alto: '4.5rem' }]} />
      ) : fincas.isError ? (
        <EstadoError alReintentar={() => fincas.refetch()} reintentando={fincas.isFetching} />
      ) : fincas.data.length === 0 ? (
        filtrado ? (
          <EstadoVacio
            titulo="Ninguna finca coincide"
            descripcion="Prueba con otra búsqueda o con otro filtro."
          />
        ) : (
          <EstadoVacio
            icono={<Wheat size={32} />}
            titulo="Aún no hay fincas"
            descripcion="Da de alta la primera con sus parcelas del SIGPAC."
            accion={
              <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setAnadiendo(true)}>
                Añadir finca
              </Boton>
            }
          />
        )
      ) : (
        <>
          <p className={estilos.recuento} role="status">
            {fincas.data.length} {fincas.data.length === 1 ? 'finca' : 'fincas'} ·{' '}
            {hectareas(total)}
            {vista === 'lista' && (
              <span className={estilos.soloMovil}> · Mantén pulsada una para marcar varias</span>
            )}
          </p>
          {vista === 'mapa' ? (
            <Suspense fallback={<Esqueleto bloques={[{ alto: '24rem' }]} />}>
              <MapaFincas fincas={fincas.data} />
            </Suspense>
          ) : (
            <Tabla
              etiqueta="Fincas"
              filas={fincas.data}
              claveFila={(f) => f.id}
              alSeleccionar={(f) => abrir(f.id)}
              seleccion={{
                claves: seleccion,
                alCambiar: setSeleccion,
                etiquetaFila: (f) => f.nombre,
              }}
              columnas={[
                {
                  clave: 'nombre',
                  titulo: 'Nombre',
                  valor: (f) => f.nombre,
                  ordenar: (f) => f.nombre,
                  principal: true,
                },
                {
                  clave: 'municipio',
                  titulo: 'Municipio',
                  valor: (f) => f.municipio ?? '—',
                  ordenar: (f) => f.municipio,
                },
                {
                  clave: 'superficie',
                  titulo: 'Superficie',
                  valor: (f) => hectareas(f.superficie),
                  ordenar: (f) => f.superficie,
                  numerica: true,
                },
                {
                  clave: 'parcelas',
                  titulo: 'Parcelas',
                  valor: (f) => f.numeroParcelas,
                  ordenar: (f) => f.numeroParcelas,
                  numerica: true,
                },
                {
                  clave: 'regimen',
                  titulo: 'Régimen',
                  valor: (f) => (
                    <span className={estilos.insignias}>
                      {f.activa ? REGIMENES[f.regimen] : <Insignia>Desactivada</Insignia>}
                      {f.finSeguridad && <InsigniaSeguridad fin={f.finSeguridad} corta />}
                      {f.pastoreo && <InsigniaPastoreo pastoreo={f.pastoreo} corta />}
                    </span>
                  ),
                  ordenar: (f) => (f.activa ? REGIMENES[f.regimen] : 'zz'),
                },
              ]}
            />
          )}
        </>
      )}

      {vista === 'lista' && seleccionadas.length > 0 ? (
        <div className={estilos.barraSeleccion}>
          <p role="status">
            {seleccionadas.length === 1
              ? '1 seleccionada'
              : `${seleccionadas.length} seleccionadas`}
          </p>
          <div className={estilos.acciones}>
            <BotonIcono
              etiqueta="Desmarcar"
              icono={<X aria-hidden size={20} />}
              onClick={desmarcar}
            />
            <MenuRegistrarFinca fincas={seleccionadas} alGuardar={desmarcar} />
          </div>
        </div>
      ) : (
        <BotonFlotante
          etiqueta="Añadir finca"
          icono={<Plus aria-hidden size={26} />}
          alPulsar={() => setAnadiendo(true)}
        />
      )}
      {anadiendo && (
        <FormularioFinca alCerrar={() => setAnadiendo(false)} alGuardar={(f) => abrir(f.id)} />
      )}
    </section>
  )
}
