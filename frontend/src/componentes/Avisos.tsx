import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import estilos from './Avisos.module.css'
import { BotonIcono } from './Boton'
import { clases } from './clases'

export type TipoAviso = 'exito' | 'error' | 'aviso' | 'info'

export type OpcionesAviso = {
  mensaje: string
  tipo?: TipoAviso
  // Botón dentro del aviso, p. ej. "Deshacer" o "Actualizar"
  accion?: { texto: string; alPulsar: () => void }
  // Milisegundos hasta que desaparece; null lo deja hasta que se cierre o se pulse la acción. Por
  // defecto, 4 s; los errores se quedan hasta cerrarlos.
  duracion?: number | null
}

type Aviso = OpcionesAviso & { id: number }

type ContextoAvisos = {
  avisar: (opciones: OpcionesAviso) => number
  quitar: (id: number) => void
}

const Contexto = createContext<ContextoAvisos | null>(null)

// Mensajes breves no bloqueantes (toast):
//   const { avisar } = useAvisos()
//   avisar({ tipo: 'exito', mensaje: 'Parto guardado' })
//   avisar({ mensaje: 'Peso borrado', accion: { texto: 'Deshacer', alPulsar: deshacer } })
export function useAvisos() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error('useAvisos necesita ProveedorAvisos')
  return contexto
}

export const DURACION_AVISO = 4000

const iconos: Record<TipoAviso, ReactNode> = {
  exito: <CircleCheck aria-hidden size={20} />,
  error: <CircleAlert aria-hidden size={20} />,
  aviso: <TriangleAlert aria-hidden size={20} />,
  info: <Info aria-hidden size={20} />,
}

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguienteId = useRef(1)

  const quitar = useCallback((id: number) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id))
  }, [])

  const avisar = useCallback((opciones: OpcionesAviso) => {
    const id = siguienteId.current++
    setAvisos((actuales) => [...actuales, { ...opciones, id }])
    return id
  }, [])

  const valor = useMemo(() => ({ avisar, quitar }), [avisar, quitar])

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* Región siempre presente para que los lectores de pantalla anuncien los avisos nuevos */}
      <section className={estilos.avisos} aria-label="Avisos" aria-live="polite">
        {avisos.map((aviso) => (
          <TarjetaAviso key={aviso.id} aviso={aviso} alCerrar={() => quitar(aviso.id)} />
        ))}
      </section>
    </Contexto.Provider>
  )
}

function TarjetaAviso({ aviso, alCerrar }: { aviso: Aviso; alCerrar: () => void }) {
  const tipo = aviso.tipo ?? 'info'
  const duracion =
    aviso.duracion === undefined ? (tipo === 'error' ? null : DURACION_AVISO) : aviso.duracion

  useEffect(() => {
    if (duracion === null) return
    const temporizador = setTimeout(alCerrar, duracion)
    return () => clearTimeout(temporizador)
  }, [duracion, alCerrar])

  return (
    <div
      className={clases(estilos.tarjeta, estilos[tipo])}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      <span className={estilos.icono}>{iconos[tipo]}</span>
      <p className={estilos.mensaje}>{aviso.mensaje}</p>
      {aviso.accion && (
        <button
          type="button"
          className={estilos.accion}
          onClick={() => {
            aviso.accion?.alPulsar()
            alCerrar()
          }}
        >
          {aviso.accion.texto}
        </button>
      )}
      <BotonIcono etiqueta="Cerrar aviso" icono={<X aria-hidden size={18} />} onClick={alCerrar} />
    </div>
  )
}
