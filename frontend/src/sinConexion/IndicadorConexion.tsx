import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, CloudUpload, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useSesion } from '../auth/sesion'
import { Boton, BotonIcono } from '../componentes/Boton'
import { useConfirmacion } from '../componentes/Confirmacion'
import { clases } from '../componentes/clases'
import { HojaInferior } from '../componentes/HojaInferior'
import { fecha } from '../formato'
import { delUsuario, descartar, type Pendiente, procesarCola, reintentar, useCola } from './cola'
import { useConexion } from './conexion'
import { CORRECTORES } from './registros'
import estilos from './SinConexion.module.css'

// La lista se abre también desde el aviso de los registros que fallan
let abierta = false
const oyentes = new Set<() => void>()
const cambiarAbierta = (valor: boolean) => {
  abierta = valor
  for (const o of oyentes) o()
}
export const abrirPendientes = () => cambiarAbierta(true)
const useAbierta = () =>
  useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => abierta,
  )

const ESTADOS: Record<Pendiente['estado'], string> = {
  pendiente: 'Pendiente de enviar',
  enviando: 'Enviando…',
  fallido: 'No se ha podido enviar',
}

// En la cabecera, solo cuando hay algo que contar (GH-31): sin conexión, y cuántos registros quedan
// por enviar. Al tocarlo, la lista de pendientes.
export function IndicadorConexion() {
  const conexion = useConexion()
  const sesion = useSesion()
  const suyos = delUsuario(useCola(), sesion.data?.usuario.id)
  const fallidos = suyos.filter((p) => p.estado === 'fallido').length
  const lista = useAbierta()

  if (conexion && suyos.length === 0) return lista ? <ListaPendientes pendientes={[]} /> : null

  const etiqueta = [
    !conexion && 'Sin conexión',
    suyos.length > 0 &&
      (suyos.length === 1 ? '1 registro sin enviar' : `${suyos.length} registros sin enviar`),
    fallidos > 0 && (fallidos === 1 ? '1 con error' : `${fallidos} con error`),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <>
      <button
        type="button"
        className={clases(estilos.indicador, fallidos > 0 && estilos.conError)}
        aria-label={etiqueta}
        aria-haspopup="dialog"
        onClick={abrirPendientes}
      >
        {conexion ? <CloudUpload aria-hidden size={20} /> : <CloudOff aria-hidden size={20} />}
        {suyos.length > 0 ? (
          <span className={estilos.numero}>{suyos.length}</span>
        ) : (
          <span className={estilos.texto}>Sin conexión</span>
        )}
      </button>
      {lista && <ListaPendientes pendientes={suyos} />}
    </>
  )
}

function ListaPendientes({ pendientes }: { pendientes: Pendiente[] }) {
  const conexion = useConexion()
  const cliente = useQueryClient()
  const sesion = useSesion()
  const confirmar = useConfirmacion()
  const [corrigiendo, setCorrigiendo] = useState<Pendiente>()
  const cerrar = () => cambiarAbierta(false)
  const porEnviar = pendientes.some((p) => p.estado === 'pendiente')
  const Corrector = corrigiendo ? CORRECTORES[corrigiendo.tipo] : undefined

  return (
    <>
      <HojaInferior
        abierta={!corrigiendo}
        alCerrar={cerrar}
        titulo="Registros sin enviar"
        pie={
          conexion && porEnviar && sesion.data ? (
            <Boton
              icono={<CloudUpload aria-hidden size={18} />}
              onClick={() => void procesarCola(cliente, sesion.data?.usuario.id ?? '')}
            >
              Enviar ahora
            </Boton>
          ) : undefined
        }
      >
        <div className={estilos.contenido}>
          <p className={estilos.estado} role="status">
            {conexion
              ? 'Hay conexión. Lo pendiente se envía solo.'
              : 'Sin conexión. Lo que registres se guarda en el móvil y se envía solo al recuperarla.'}
          </p>
          {pendientes.length === 0 ? (
            <p className={estilos.suave}>No hay nada pendiente de enviar.</p>
          ) : (
            <ul className={estilos.lista} aria-label="Registros sin enviar">
              {pendientes.map((p) => (
                <li key={p.id}>
                  <div>
                    <span className={estilos.descripcion}>{p.descripcion}</span>
                    <span className={estilos.suave}>Registrado el {fecha(p.creadoEn)}</span>
                    <span
                      className={clases(
                        estilos.estadoPendiente,
                        p.estado === 'fallido' && estilos.fallido,
                      )}
                    >
                      {ESTADOS[p.estado]}
                      {p.error && `: ${p.error.mensaje}`}
                    </span>
                  </div>
                  {p.estado === 'fallido' && (
                    <div className={estilos.acciones}>
                      {CORRECTORES[p.tipo] && (
                        <BotonIcono
                          etiqueta={`Corregir ${p.descripcion}`}
                          icono={<Pencil aria-hidden size={18} />}
                          onClick={() => setCorrigiendo(p)}
                        />
                      )}
                      <BotonIcono
                        etiqueta={`Reintentar ${p.descripcion}`}
                        icono={<RotateCcw aria-hidden size={18} />}
                        onClick={() => reintentar(p.id)}
                      />
                      <BotonIcono
                        etiqueta={`Descartar ${p.descripcion}`}
                        icono={<Trash2 aria-hidden size={18} />}
                        className={estilos.peligro}
                        onClick={async () => {
                          const ok = await confirmar({
                            titulo: '¿Descartar el registro?',
                            mensaje: `${p.descripcion} no se enviará y se borrará de este dispositivo.`,
                            textoConfirmar: 'Descartar',
                          })
                          if (ok) descartar(p.id)
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </HojaInferior>
      {corrigiendo && Corrector && (
        <Corrector pendiente={corrigiendo} alCerrar={() => setCorrigiendo(undefined)} />
      )}
    </>
  )
}
