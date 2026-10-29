import { Paperclip, Plus, Receipt } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Boton } from '../componentes/Boton'
import { clases } from '../componentes/clases'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia, Tarjeta } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador, FiltroDesplegable } from '../componentes/Filtros'
import { Tabla } from '../componentes/Tabla'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, fecha } from '../formato'
import {
  type Apunte,
  CATEGORIA,
  CATEGORIAS,
  type CategoriaApunte,
  TIPOS_APUNTE,
  type TipoApunte,
  useApuntes,
} from './datos'
import estilos from './Finanzas.module.css'
import { FormularioApunte } from './FormularioApunte'

// "+3.250,40 €" en verde, "−420,00 €" en rojo; tachado si está anulado
export const ImporteApunte = ({ apunte }: { apunte: Apunte }) => (
  <span
    className={clases(
      estilos.importe,
      apunte.tipo === 'ingreso' ? estilos.ingreso : estilos.gasto,
      apunte.anulacion && estilos.anulado,
    )}
  >
    {apunte.tipo === 'ingreso' ? '+' : '−'}
    {euros(apunte.importe)}
  </span>
)

type FiltroTipo = TipoApunte | 'todos'
type FiltroCategoria = CategoriaApunte | 'todas'
type FiltroEstado = 'vigente' | 'anulado' | 'todos'

// Los otros ingresos y gastos (GH-37), del más reciente al más antiguo, con filtros por tipo,
// categoría y estado, y buscador por concepto
export function ListaApuntes() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const [categoria, setCategoria] = useState<FiltroCategoria>('todas')
  const [estado, setEstado] = useState<FiltroEstado>('vigente')
  const [creando, setCreando] = useState(false)
  const apuntes = useApuntes(explotacion.id, {
    q: texto || undefined,
    tipo: tipo === 'todos' ? undefined : tipo,
    categoria: categoria === 'todas' ? undefined : categoria,
    estado: estado === 'todos' ? undefined : estado,
  })
  const filtrado = texto !== '' || tipo !== 'todos' || categoria !== 'todas' || estado !== 'vigente'
  const ficha = (id: string) => `${rutaExplotacion(explotacion.id)}/finanzas/apuntes/${id}`
  // Las categorías del tipo elegido, o todas
  const categorias =
    tipo === 'todos' ? [...CATEGORIAS.ingreso, ...CATEGORIAS.gasto] : CATEGORIAS[tipo]

  return (
    <Tarjeta aria-labelledby="finanzas-apuntes" className={estilos.tarjeta}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="finanzas-apuntes" className={estilos.tituloTarjeta}>
          Otros ingresos y gastos
        </h2>
        <Boton
          variante="secundario"
          tamano="compacto"
          icono={<Plus aria-hidden size={18} />}
          onClick={() => setCreando(true)}
        >
          Nuevo
        </Boton>
      </div>

      <BarraFiltros buscador={<Buscador etiqueta="Buscar por concepto" alCambiar={setTexto} />}>
        <Chips
          etiqueta="Tipo"
          opciones={[
            { valor: 'todos' as const, texto: 'Todos' },
            { valor: 'ingreso' as const, texto: 'Ingresos' },
            { valor: 'gasto' as const, texto: 'Gastos' },
          ]}
          seleccion={tipo}
          alCambiar={(t) => {
            setTipo(t)
            setCategoria('todas')
          }}
        />
        <FiltroDesplegable
          etiqueta="Categoría"
          opciones={[
            { valor: 'todas' as FiltroCategoria, texto: 'Todas' },
            ...categorias.map(([valor, texto]) => ({ valor: valor as FiltroCategoria, texto })),
          ]}
          valor={categoria}
          porDefecto="todas"
          alCambiar={setCategoria}
        />
        <FiltroDesplegable
          etiqueta="Estado"
          opciones={[
            { valor: 'vigente', texto: 'Vigentes' },
            { valor: 'anulado', texto: 'Anulados' },
            { valor: 'todos', texto: 'Todos' },
          ]}
          valor={estado}
          porDefecto="vigente"
          alCambiar={setEstado}
        />
      </BarraFiltros>

      {apuntes.isPending ? (
        <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }, { alto: '4rem' }]} />
      ) : apuntes.isError && !apuntes.data ? (
        <EstadoError alReintentar={() => apuntes.refetch()} reintentando={apuntes.isFetching} />
      ) : apuntes.data.length === 0 ? (
        filtrado ? (
          <EstadoVacio
            titulo="Nada coincide"
            descripcion="Prueba con otra búsqueda o con otro filtro."
          />
        ) : (
          <EstadoVacio
            icono={<Receipt size={32} />}
            titulo="Aún no hay otros ingresos ni gastos"
            descripcion="Registra lo que no lleva factura: las ayudas de la PAC, los seguros, los tickets…"
          />
        )
      ) : (
        <Tabla
          etiqueta="Otros ingresos y gastos"
          filas={apuntes.data}
          claveFila={(a) => a.id}
          alSeleccionar={(a) => navegar(ficha(a.id))}
          columnas={[
            {
              clave: 'concepto',
              titulo: 'Concepto',
              valor: (a) => (
                <span className={estilos.numero}>
                  {a.concepto}
                  {a.archivo && <Paperclip aria-label="Con archivo" size={14} />}
                </span>
              ),
              ordenar: (a) => a.concepto,
              principal: true,
            },
            {
              clave: 'fecha',
              titulo: 'Fecha',
              valor: (a) => fecha(a.fecha),
              ordenar: (a) => a.fecha,
            },
            {
              clave: 'categoria',
              titulo: 'Categoría',
              valor: (a) => CATEGORIA[a.categoria],
              ordenar: (a) => CATEGORIA[a.categoria],
            },
            {
              clave: 'tipo',
              titulo: 'Tipo',
              valor: (a) =>
                a.anulacion ? <Insignia tipo="peligro">Anulado</Insignia> : TIPOS_APUNTE[a.tipo],
              ordenar: (a) => a.tipo,
            },
            {
              clave: 'importe',
              titulo: 'Importe',
              valor: (a) => <ImporteApunte apunte={a} />,
              ordenar: (a) => (a.tipo === 'ingreso' ? a.importe : -a.importe),
              numerica: true,
            },
          ]}
        />
      )}

      {creando && (
        <FormularioApunte
          alCerrar={() => setCreando(false)}
          alGuardar={(a) => navegar(ficha(a.id))}
        />
      )}
    </Tarjeta>
  )
}
