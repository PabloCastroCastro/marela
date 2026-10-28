import { Plus, Tractor, Wheat, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton, BotonIcono } from '../componentes/Boton'
import { BotonFlotante } from '../componentes/BotonFlotante'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas } from '../formato'
import { REGIMENES, useFincas } from './datos'
import estilos from './Fincas.module.css'
import { FormularioFinca } from './FormularioFinca'
import { FormularioLabor } from './FormularioLabor'

type FiltroEstado = 'true' | 'false' | 'todas'

// Fincas de la explotación: buscar, filtrar, abrir su ficha y dar de alta (GH-25). En el móvil,
// tarjetas; en pantalla ancha, tabla. Con casillas (en el móvil, manteniendo pulsada una finca) se
// marcan varias para registrarles la misma labor (GH-26).
export function PaginaFincas() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('true')
  const [anadiendo, setAnadiendo] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [registrando, setRegistrando] = useState(false)

  const filtrado = texto !== '' || estado !== 'true'
  const fincas = useFincas(explotacion.id, {
    q: texto || undefined,
    activa: estado === 'todas' ? undefined : estado,
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
        <FiltroDesplegable
          etiqueta="Estado"
          opciones={[
            { valor: 'true', texto: 'Activas' },
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
            <span className={estilos.soloMovil}> · Mantén pulsada una para marcar varias</span>
          </p>
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
                valor: (f) => (f.activa ? REGIMENES[f.regimen] : <Insignia>Desactivada</Insignia>),
                ordenar: (f) => (f.activa ? REGIMENES[f.regimen] : 'zz'),
              },
            ]}
          />
        </>
      )}

      {seleccionadas.length > 0 ? (
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
            <Boton icono={<Tractor aria-hidden size={20} />} onClick={() => setRegistrando(true)}>
              Registrar labor
            </Boton>
          </div>
        </div>
      ) : (
        <BotonFlotante
          etiqueta="Añadir finca"
          icono={<Plus aria-hidden size={26} />}
          alPulsar={() => setAnadiendo(true)}
        />
      )}
      {registrando && (
        <FormularioLabor
          fincas={seleccionadas}
          alCerrar={() => setRegistrando(false)}
          alGuardar={desmarcar}
        />
      )}
      {anadiendo && (
        <FormularioFinca alCerrar={() => setAnadiendo(false)} alGuardar={(f) => abrir(f.id)} />
      )}
    </section>
  )
}
