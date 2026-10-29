import { CircleAlert, CloudOff, LoaderCircle, RotateCw } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useConexion } from '../sinConexion/conexion'
import { Boton } from './Boton'
import { clases } from './clases'
import estilos from './Estados.module.css'

// Estados de una pantalla con datos: cargando (Esqueleto o Cargando), vacío, error y con datos

type PropsVacio = {
  icono?: ReactNode
  titulo: string
  descripcion?: ReactNode
  // La acción para crear el primero, p. ej. "Añadir animal"
  accion?: ReactNode
}

export function EstadoVacio({ icono, titulo, descripcion, accion }: PropsVacio) {
  return (
    <section className={estilos.estado}>
      {icono && (
        <div className={estilos.icono} aria-hidden="true">
          {icono}
        </div>
      )}
      <h2>{titulo}</h2>
      {descripcion && <p className={estilos.descripcion}>{descripcion}</p>}
      {accion && <div className={estilos.accion}>{accion}</div>}
    </section>
  )
}

type PropsError = {
  // Qué ha pasado
  titulo?: string
  // Cómo resolverlo
  descripcion?: ReactNode
  alReintentar?: () => void
  reintentando?: boolean
}

export function EstadoError({
  titulo = 'No se han podido cargar los datos',
  descripcion = 'Comprueba la conexión y vuelve a intentarlo.',
  alReintentar,
  reintentando = false,
}: PropsError) {
  return (
    <section className={estilos.estado} role="alert">
      <div className={clases(estilos.icono, estilos.iconoError)} aria-hidden="true">
        <CircleAlert size={32} />
      </div>
      <h2>{titulo}</h2>
      <p className={estilos.descripcion}>{descripcion}</p>
      {alReintentar && (
        <div className={estilos.accion}>
          <Boton
            variante="secundario"
            icono={<RotateCw aria-hidden size={18} />}
            cargando={reintentando}
            onClick={alReintentar}
          >
            Reintentar
          </Boton>
        </div>
      )}
    </section>
  )
}

// Indicador de carga centrado, anunciado a los lectores de pantalla. Para listas y fichas es mejor
// Esqueleto, con la forma del contenido.
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className={estilos.cargando} role="status">
      <LoaderCircle className={estilos.girando} aria-hidden size={32} />
      <span>{texto}</span>
    </div>
  )
}

type PropsEsqueleto = {
  // Bloques con la forma del contenido: alto y ancho de cada uno (por defecto, una línea de texto)
  bloques?: { alto?: CSSProperties['height']; ancho?: CSSProperties['width'] }[]
  texto?: string
}

export function Esqueleto({
  bloques = [{}, { ancho: '80%' }, { ancho: '60%' }],
  texto = 'Cargando…',
}: PropsEsqueleto) {
  const conexion = useConexion()
  // Sin conexión y sin nada guardado, no va a cargar hasta que vuelva: se dice (GH-31)
  if (!conexion)
    return (
      <p className={estilos.sinConexion} role="status">
        <CloudOff aria-hidden size={20} />
        Sin conexión. Esto no está guardado en el dispositivo: se cargará al recuperarla.
      </p>
    )
  return (
    <div className={estilos.esqueleto} role="status" aria-label={texto}>
      {bloques.map((b, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: los bloques no cambian de orden
          key={i}
          className={estilos.bloque}
          style={{ height: b.alto, width: b.ancho }}
        />
      ))}
    </div>
  )
}
