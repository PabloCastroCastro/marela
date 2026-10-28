import { Plus, Wheat } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton } from '../componentes/Boton'
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

type FiltroEstado = 'true' | 'false' | 'todas'

// Fincas de la explotación: buscar, filtrar, abrir su ficha y dar de alta (GH-25). En el móvil,
// tarjetas; en pantalla ancha, tabla.
export function PaginaFincas() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('true')
  const [anadiendo, setAnadiendo] = useState(false)

  const filtrado = texto !== '' || estado !== 'true'
  const fincas = useFincas(explotacion.id, {
    q: texto || undefined,
    activa: estado === 'todas' ? undefined : estado,
  })
  const abrir = (id: string) => navegar(`${rutaExplotacion(explotacion.id)}/fincas/${id}`)
  const total = (fincas.data ?? []).reduce((s, f) => s + f.superficie, 0)

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
          </p>
          <Tabla
            etiqueta="Fincas"
            filas={fincas.data}
            claveFila={(f) => f.id}
            alSeleccionar={(f) => abrir(f.id)}
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

      <BotonFlotante
        etiqueta="Añadir finca"
        icono={<Plus aria-hidden size={26} />}
        alPulsar={() => setAnadiendo(true)}
      />
      {anadiendo && (
        <FormularioFinca alCerrar={() => setAnadiendo(false)} alGuardar={(f) => abrir(f.id)} />
      )}
    </section>
  )
}
