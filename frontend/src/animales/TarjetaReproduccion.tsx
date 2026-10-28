import { Ban } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { api, datos } from '../api/cliente'
import { BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, identificacion } from './datos'
import { deEvento, deParto, type EntradaReproductiva, unir } from './entradasReproduccion'
import { FormularioAnulacion } from './FormularioAnulacion'
import { InsigniaGestacion } from './InsigniaGestacion'
import { type EventoReproductivo, type Parto, useEventos, usePartos } from './reproduccion'

// Una fila del historial: un evento (GH-22) o un parto (GH-23), que se puede anular
type Entrada = EntradaReproductiva & { anular: () => void }

type Anulando =
  | { tipo: 'evento'; evento: EventoReproductivo; titulo: string }
  | { tipo: 'parto'; parto: Parto }

// Reproducción del animal en su ficha (GH-22, GH-23): arriba, lo que viene (la gestación en curso y
// el parto previsto); debajo, lo último del historial, con los partos, los anulados y los destetes
// de sus hijos. En un ternero, su destete.
export function TarjetaReproduccion({ animal }: { animal: AnimalDetalle }) {
  const explotacion = useExplotacionActual()
  const hembra = animal.sexo === 'hembra'
  const eventos = useEventos(explotacion.id, animal.id)
  const partos = usePartos(explotacion.id, animal.id, hembra)
  const [anulando, setAnulando] = useState<Anulando>()
  const lista = `${rutaExplotacion(explotacion.id)}/animales`
  const enlace = (a: { id: string; crotal: string | null; nombre: string | null }) => (
    <Link key={a.id} to={`${lista}/${a.id}`}>
      {identificacion(a)}
    </Link>
  )

  // Del más reciente al más antiguo; a la vista, solo lo último
  const entradas: Entrada[] = [
    ...(eventos.data ?? []).map((e) => {
      const entrada = deEvento(e, animal.id, enlace)
      return {
        ...entrada,
        anular: () => setAnulando({ tipo: 'evento', evento: e, titulo: entrada.titulo }),
      }
    }),
    ...(partos.data ?? []).map((p) => ({
      ...deParto(p, enlace),
      anular: () => setAnulando({ tipo: 'parto', parto: p }),
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn))
  const recorte = useRecorte(entradas, (n) => `Ver todo el historial (${n})`)

  let contenido: ReactNode
  if (eventos.isPending || (hembra && partos.isPending)) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }]} />
  } else if (eventos.isError || partos.isError) {
    contenido = (
      <EstadoError
        alReintentar={() => {
          eventos.refetch()
          if (hembra) partos.refetch()
        }}
        reintentando={eventos.isFetching || partos.isFetching}
      />
    )
  } else {
    contenido =
      entradas.length === 0 ? (
        <p className={estilos.suave}>Sin eventos registrados</p>
      ) : (
        <ul className={estilos.tratamientos} aria-label="Historial reproductivo">
          {recorte.elementos.map((e) => (
            <li key={e.clave} className={e.anulacion ? estilos.anulado : undefined}>
              <div>
                <span className={estilos.producto}>{e.titulo}</span>
                <span className={estilos.suave}>{unir([fecha(e.fecha), ...e.detalle])}</span>
                {e.lineas.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: líneas fijas de cada fila
                  <span key={i} className={estilos.suave}>
                    {l}
                  </span>
                ))}
                {e.observaciones && <span className={estilos.suave}>{e.observaciones}</span>}
                {e.anulacion && (
                  <span className={estilos.motivoAnulacion}>
                    <Insignia icono={<Ban aria-hidden />}>Anulado</Insignia>
                    {e.anulacion.motivo} ({e.anulacion.por}, {fecha(e.anulacion.en)})
                  </span>
                )}
              </div>
              {!e.anulacion && (
                <BotonIcono
                  etiqueta={`Anular ${e.titulo.toLowerCase()} del ${fecha(e.fecha)}`}
                  icono={<Ban aria-hidden size={18} />}
                  onClick={e.anular}
                />
              )}
            </li>
          ))}
        </ul>
      )
  }

  return (
    <Tarjeta aria-labelledby="ficha-reproduccion" className={estilos.tarjetaRegistros}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="ficha-reproduccion">Reproducción</h2>
      </div>
      {animal.gestacion && (
        <div>
          <InsigniaGestacion gestacion={animal.gestacion} />
        </div>
      )}
      {contenido}
      {recorte.boton}
      {anulando?.tipo === 'evento' && (
        <FormularioAnulacion
          titulo="¿Anular el evento?"
          descripcion={`${anulando.titulo}, del ${fecha(anulando.evento.fecha)}. No se borra: queda en el historial como anulado, con el motivo, y deja de contar para la gestación.`}
          textoBoton="Anular evento"
          ayuda="Por ejemplo: registrado en la vaca equivocada"
          mensajeExito={`${anulando.titulo} del ${fecha(anulando.evento.fecha)} anulado`}
          anular={(motivo) =>
            datos(
              api.POST('/api/explotaciones/{explotacionId}/reproduccion/{eventoId}/anulacion', {
                params: { path: { explotacionId: explotacion.id, eventoId: anulando.evento.id } },
                body: { motivo },
              }),
            )
          }
          alCerrar={() => setAnulando(undefined)}
        />
      )}
      {anulando?.tipo === 'parto' && (
        <FormularioAnulacion
          titulo="¿Anular el parto?"
          descripcion={`Parto del ${fecha(anulando.parto.fecha)}. Queda en el historial como anulado, con el motivo, y se borran las fichas de sus terneros (${anulando.parto.terneros.map(identificacion).join(', ')}). No se puede si alguno tiene ya otros datos.`}
          textoBoton="Anular parto"
          ayuda="Por ejemplo: registrado en la vaca equivocada"
          mensajeExito={`Parto del ${fecha(anulando.parto.fecha)} anulado`}
          anular={(motivo) =>
            datos(
              api.POST('/api/explotaciones/{explotacionId}/partos/{partoId}/anulacion', {
                params: { path: { explotacionId: explotacion.id, partoId: anulando.parto.id } },
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
