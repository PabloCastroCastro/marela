import { Plus, Save, Syringe, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Cargando, Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia, Tarjeta } from '../componentes/Etiquetas'
import { BarraFiltros, Buscador } from '../componentes/Filtros'
import { HojaInferior } from '../componentes/HojaInferior'
import { Vaca } from '../componentes/iconos'
import { Tabla } from '../componentes/Tabla'
import { fecha, kilos } from '../formato'
import estilos from './PaginaComponentes.module.css'

// Catálogo de componentes, solo en desarrollo (/componentes): para verlos y probarlos en claro y
// oscuro, a cualquier ancho. Cada componente común nuevo se añade aquí.

type Tema = 'sistema' | 'claro' | 'oscuro'

const colores = [
  'primario',
  'primario-intenso',
  'primario-suave',
  'indicador',
  'fondo',
  'superficie',
  'superficie-elevada',
  'texto',
  'texto-suave',
  'borde',
  'borde-fuerte',
  'exito',
  'aviso',
  'peligro',
  'informacion',
]

type Animal = {
  id: string
  crotal: string
  nombre: string
  tipo: 'vaca' | 'ternero' | 'toro'
  nacimiento: string
  peso: number | null
}

const animales: Animal[] = [
  {
    id: '1',
    crotal: 'ES041503456789',
    nombre: 'Marela',
    tipo: 'vaca',
    nacimiento: '2019-03-14',
    peso: 612,
  },
  {
    id: '2',
    crotal: 'ES041503456790',
    nombre: 'Bonita',
    tipo: 'vaca',
    nacimiento: '2020-05-02',
    peso: 584,
  },
  {
    id: '3',
    crotal: 'ES041503456812',
    nombre: 'Moreno',
    tipo: 'toro',
    nacimiento: '2018-11-20',
    peso: 940,
  },
  {
    id: '4',
    crotal: 'ES041503457001',
    nombre: 'Pinta',
    tipo: 'ternero',
    nacimiento: '2026-02-11',
    peso: 186,
  },
  {
    id: '5',
    crotal: 'ES041503457002',
    nombre: 'Lucero',
    tipo: 'ternero',
    nacimiento: '2026-03-03',
    peso: null,
  },
]

const TIPOS = { vaca: 'Vaca', ternero: 'Ternero', toro: 'Toro' }

export function PaginaComponentes() {
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [tema, setTema] = useState<Tema>('sistema')
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<'todos' | Animal['tipo']>('todos')
  const [desde, setDesde] = useState('')

  // El tema forzado solo dura mientras se ve el catálogo
  useEffect(() => {
    const raiz = document.documentElement
    if (tema === 'sistema') delete raiz.dataset.tema
    else raiz.dataset.tema = tema
    return () => {
      delete raiz.dataset.tema
    }
  }, [tema])

  const filtrados = useMemo(
    () =>
      animales.filter(
        (a) =>
          (tipo === 'todos' || a.tipo === tipo) &&
          (!desde || a.nacimiento >= desde) &&
          `${a.crotal} ${a.nombre}`.toLowerCase().includes(texto.toLowerCase()),
      ),
    [texto, tipo, desde],
  )

  const guardar = () => {
    setGuardando(true)
    setTimeout(() => {
      setGuardando(false)
      setHojaAbierta(false)
      avisar({ tipo: 'exito', mensaje: 'Peso guardado' })
    }, 1200)
  }

  return (
    <div className={estilos.catalogo}>
      <div className={estilos.cabecera}>
        <h1>Componentes</h1>
        <Chips
          etiqueta="Tema"
          opciones={[
            { valor: 'sistema', texto: 'Sistema' },
            { valor: 'claro', texto: 'Claro' },
            { valor: 'oscuro', texto: 'Oscuro' },
          ]}
          seleccion={tema}
          alCambiar={setTema}
        />
      </div>

      <section className={estilos.seccion}>
        <h2>Colores</h2>
        <div className={estilos.colores}>
          {colores.map((color) => (
            <div key={color} className={estilos.color}>
              <span className={estilos.muestra} style={{ background: `var(--color-${color})` }} />
              <code>--color-{color}</code>
            </div>
          ))}
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2>Botones</h2>
        <div className={estilos.fila}>
          <Boton icono={<Plus aria-hidden size={20} />}>Añadir animal</Boton>
          <Boton variante="secundario">Secundario</Boton>
          <Boton variante="texto">Cancelar</Boton>
          <Boton variante="peligro" icono={<Trash2 aria-hidden size={20} />}>
            Dar de baja
          </Boton>
          <Boton disabled>Desactivado</Boton>
          <Boton cargando>Guardando</Boton>
        </div>
        <div className={estilos.fila}>
          <Boton tamano="compacto">Compacto</Boton>
          <Boton>Normal</Boton>
          <Boton tamano="grande">Grande</Boton>
          <BotonIcono etiqueta="Borrar" icono={<Trash2 aria-hidden size={22} />} />
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2>Campos</h2>
        <div className={estilos.rejilla}>
          <Campo etiqueta="Crotal" inputMode="numeric" ayuda="Los 14 caracteres, con ES" required />
          <Campo
            etiqueta="Peso (kg)"
            inputMode="decimal"
            defaultValue="61,5"
            error="Debe ser mayor que 0"
          />
          <CampoFecha etiqueta="Fecha del parto" defaultValue="2026-10-24" />
          <Selector etiqueta="Tipo" defaultValue="vaca">
            {Object.entries(TIPOS).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </Selector>
          <AreaTexto etiqueta="Observaciones" />
          <Campo etiqueta="Desactivado" disabled defaultValue="No editable" />
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2>Insignias y tarjeta</h2>
        <div className={estilos.fila}>
          <Insignia>Vendido</Insignia>
          <Insignia tipo="exito" icono={<Vaca aria-hidden />}>
            Gestante
          </Insignia>
          <Insignia tipo="aviso" icono={<TriangleAlert aria-hidden />}>
            En supresión hasta 12/11
          </Insignia>
          <Insignia tipo="peligro">Baja</Insignia>
          <Insignia tipo="informacion" icono={<Syringe aria-hidden />}>
            En tratamiento
          </Insignia>
        </div>
        <Tarjeta>
          <h3>Marela · ES041503456789</h3>
          <p className={estilos.suave}>Vaca nacida el 14/03/2019 · 612 kg</p>
        </Tarjeta>
      </section>

      <section className={estilos.seccion}>
        <h2>Avisos, confirmación y hoja inferior</h2>
        <div className={estilos.fila}>
          <Boton
            variante="secundario"
            onClick={() => avisar({ tipo: 'exito', mensaje: 'Parto guardado' })}
          >
            Aviso de éxito
          </Boton>
          <Boton
            variante="secundario"
            onClick={() => avisar({ tipo: 'error', mensaje: 'No se ha podido guardar el peso' })}
          >
            Aviso de error
          </Boton>
          <Boton
            variante="secundario"
            onClick={() =>
              avisar({
                mensaje: 'Peso borrado',
                accion: {
                  texto: 'Deshacer',
                  alPulsar: () => avisar({ mensaje: 'Peso recuperado' }),
                },
              })
            }
          >
            Aviso con acción
          </Boton>
          <Boton
            variante="secundario"
            onClick={async () => {
              const ok = await confirmar({
                titulo: '¿Dar de baja a Marela?',
                mensaje: 'Dejará de aparecer entre los animales de la explotación.',
                textoConfirmar: 'Dar de baja',
                peligrosa: true,
              })
              avisar({ mensaje: ok ? 'Marela dada de baja' : 'No se ha dado de baja' })
            }}
          >
            Confirmación
          </Boton>
          <Boton variante="secundario" onClick={() => setHojaAbierta(true)}>
            Hoja inferior
          </Boton>
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2>Estados</h2>
        <div className={estilos.rejilla}>
          <Tarjeta>
            <EstadoVacio
              icono={<Vaca size={32} />}
              titulo="Aún no hay animales"
              descripcion="Da de alta el primero para empezar su ficha."
              accion={<Boton icono={<Plus aria-hidden size={20} />}>Añadir animal</Boton>}
            />
          </Tarjeta>
          <Tarjeta>
            <EstadoError alReintentar={() => avisar({ mensaje: 'Reintentando…' })} />
          </Tarjeta>
          <Tarjeta>
            <Cargando />
          </Tarjeta>
          <Tarjeta>
            <Esqueleto bloques={[{ alto: '1.5rem', ancho: '50%' }, {}, {}, { ancho: '70%' }]} />
          </Tarjeta>
        </div>
      </section>

      <section className={estilos.seccion}>
        <h2>Filtros y tabla</h2>
        <BarraFiltros
          buscador={<Buscador etiqueta="Buscar por crotal o nombre" alCambiar={setTexto} />}
        >
          <Chips
            etiqueta="Tipo de animal"
            opciones={[
              { valor: 'todos', texto: 'Todos' },
              { valor: 'vaca', texto: 'Vacas' },
              { valor: 'ternero', texto: 'Terneros' },
              { valor: 'toro', texto: 'Toros' },
            ]}
            seleccion={tipo}
            alCambiar={setTipo}
          />
          <CampoFecha
            etiqueta="Nacidos desde"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </BarraFiltros>
        {filtrados.length === 0 ? (
          <EstadoVacio titulo="Ningún animal coincide" descripcion="Prueba con otros filtros." />
        ) : (
          <Tabla
            etiqueta="Animales"
            filas={filtrados}
            claveFila={(a) => a.id}
            ordenInicial={{ clave: 'crotal', sentido: 'asc' }}
            alSeleccionar={(a) => avisar({ mensaje: `Abrir la ficha de ${a.nombre}` })}
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
                valor: (a) => a.nombre,
                ordenar: (a) => a.nombre,
              },
              {
                clave: 'tipo',
                titulo: 'Tipo',
                valor: (a) => TIPOS[a.tipo],
                ordenar: (a) => TIPOS[a.tipo],
              },
              {
                clave: 'nacimiento',
                titulo: 'Nacimiento',
                valor: (a) => fecha(a.nacimiento),
                ordenar: (a) => a.nacimiento,
              },
              {
                clave: 'peso',
                titulo: 'Peso',
                valor: (a) => (a.peso === null ? '—' : kilos(a.peso)),
                ordenar: (a) => a.peso,
                numerica: true,
              },
            ]}
          />
        )}
      </section>

      <HojaInferior
        abierta={hojaAbierta}
        alCerrar={() => setHojaAbierta(false)}
        titulo="Registrar peso"
        pie={
          <>
            <Boton variante="texto" onClick={() => setHojaAbierta(false)}>
              Cancelar
            </Boton>
            <Boton icono={<Save aria-hidden size={20} />} cargando={guardando} onClick={guardar}>
              Guardar peso
            </Boton>
          </>
        }
      >
        <Campo etiqueta="Crotal" inputMode="numeric" defaultValue="ES041503457001" />
        <Campo etiqueta="Peso (kg)" inputMode="decimal" />
        <CampoFecha etiqueta="Fecha" defaultValue="2026-10-24" />
      </HojaInferior>
    </div>
  )
}
