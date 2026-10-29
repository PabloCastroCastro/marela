import { Ban } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { FormularioAnulacion } from '../animales/FormularioAnulacion'
import { api, datos } from '../api/cliente'
import { BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha, hectareas } from '../formato'
import { RegistrosSinEnviar } from '../sinConexion/RegistrosSinEnviar'
import { type Aplicacion, dosis, TIPOS_ABONO, useAplicaciones } from './aplicaciones'
import { CLAVE_FINCAS, type FincaDetalle } from './datos'
import estilos from './Fincas.module.css'
import { InsigniaSeguridad } from './InsigniaSeguridad'

const titulo = (a: Aplicacion) =>
  a.tipo === 'abono' ? `Abono: ${a.producto}` : `Fitosanitario: ${a.producto}`

// Abonados y tratamientos fitosanitarios de la finca: el plazo de seguridad en curso y el
// historial, con los anulados y solo los últimos a la vista (GH-27)
export function TarjetaAplicaciones({ finca }: { finca: FincaDetalle }) {
  const explotacion = useExplotacionActual()
  const aplicaciones = useAplicaciones(explotacion.id, finca.id)
  const [anulando, setAnulando] = useState<Aplicacion>()
  const recorte = useRecorte(aplicaciones.data ?? [])

  let contenido: ReactNode
  if (aplicaciones.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }]} />
  } else if (aplicaciones.isError) {
    contenido = (
      <EstadoError
        alReintentar={() => aplicaciones.refetch()}
        reintentando={aplicaciones.isFetching}
      />
    )
  } else if (aplicaciones.data.length === 0) {
    contenido = <p className={estilos.suave}>Sin abonados ni tratamientos registrados</p>
  } else {
    contenido = (
      <ul className={estilos.registros} aria-label="Abonado y fitosanitarios">
        {recorte.elementos.map((a) => (
          <li key={a.id} className={a.anulacion ? estilos.anulado : undefined}>
            <div>
              <span className={estilos.tituloRegistro}>{titulo(a)}</span>
              <span className={estilos.suave}>
                {[
                  fecha(a.fecha),
                  a.tipoAbono && TIPOS_ABONO[a.tipoAbono],
                  a.plaga,
                  dosis(a),
                  hectareas(a.superficie),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className={estilos.suave}>
                {[
                  a.aplicadoPor && `por ${a.aplicadoPor.nombre}`,
                  a.ropo && `ROPO ${a.ropo}`,
                  a.equipo,
                  a.lote && `lote ${a.lote}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {a.tipo === 'fitosanitario' && (
                <span className={estilos.suave}>
                  {a.diasSeguridad === 0
                    ? 'Sin plazo de seguridad'
                    : `Plazo de seguridad de ${a.diasSeguridad} ${a.diasSeguridad === 1 ? 'día' : 'días'}, hasta el ${fecha(a.finSeguridad)}`}
                </span>
              )}
              {a.observaciones && <span className={estilos.suave}>{a.observaciones}</span>}
              {a.anulacion && (
                <span className={estilos.motivoAnulacion}>
                  <Insignia icono={<Ban aria-hidden />}>Anulado</Insignia>
                  {a.anulacion.motivo} ({a.anulacion.por}, {fecha(a.anulacion.en)})
                </span>
              )}
            </div>
            {!a.anulacion && (
              <BotonIcono
                etiqueta={`Anular ${titulo(a).toLowerCase()} del ${fecha(a.fecha)}`}
                icono={<Ban aria-hidden size={18} />}
                onClick={() => setAnulando(a)}
              />
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Tarjeta aria-labelledby="finca-aplicaciones" className={estilos.tarjetaRegistros}>
      <h2 id="finca-aplicaciones" className={estilos.tituloTarjeta}>
        Abonado y fitosanitarios
      </h2>
      {finca.finSeguridad && (
        <div>
          <InsigniaSeguridad fin={finca.finSeguridad} />
        </div>
      )}
      <RegistrosSinEnviar
        etiqueta="Abonos y tratamientos sin enviar"
        de={(p) =>
          (p.tipo === 'aplicacion' &&
            (p.cuerpo as { fincaIds?: string[] }).fincaIds?.includes(finca.id)) ??
          false
        }
      />
      {contenido}
      {recorte.boton}
      {anulando && (
        <FormularioAnulacion
          titulo={anulando.tipo === 'abono' ? '¿Anular el abonado?' : '¿Anular el tratamiento?'}
          descripcion={`${anulando.producto}, del ${fecha(anulando.fecha)}. No se borra: queda en la ficha como anulado, con el motivo${anulando.tipo === 'fitosanitario' ? ', y deja de contar para el plazo de seguridad' : ''}.`}
          textoBoton="Anular"
          ayuda="Por ejemplo: registrado en la finca equivocada"
          mensajeExito={`${titulo(anulando)} anulado`}
          clave={CLAVE_FINCAS}
          anular={(motivo) =>
            datos(
              api.POST('/api/explotaciones/{explotacionId}/aplicaciones/{aplicacionId}/anulacion', {
                params: { path: { explotacionId: explotacion.id, aplicacionId: anulando.id } },
                body: { motivo },
              }),
            )
          }
          alCerrar={() => setAnulando(undefined)}
        />
      )}
    </Tarjeta>
  )
}
