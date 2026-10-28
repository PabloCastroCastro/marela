import { Ban, Heart, Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { api, datos } from '../api/cliente'
import { Boton, BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, identificacion } from './datos'
import { FormularioAnulacion } from './FormularioAnulacion'
import { FormularioEvento } from './FormularioEvento'
import { InsigniaGestacion } from './InsigniaGestacion'
import {
  type EventoReproductivo,
  METODOS,
  RESULTADOS,
  TIPOS_EVENTO,
  tiposPara,
  useEventos,
} from './reproduccion'

// Reproducción del animal en su ficha (GH-22): la gestación en curso y el historial, con los
// anulados y los destetes de sus hijos. En un ternero, su destete.
export function TarjetaReproduccion({ animal }: { animal: AnimalDetalle }) {
  const explotacion = useExplotacionActual()
  const eventos = useEventos(explotacion.id, animal.id)
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState<EventoReproductivo>()
  const lista = `${rutaExplotacion(explotacion.id)}/animales`
  // El destete, solo si aún no lo tiene
  const destetado = eventos.data?.some(
    (e) => e.tipo === 'destete' && e.animalId === animal.id && !e.anulacion,
  )
  const tipos = tiposPara(animal).filter((t) => t !== 'destete' || !destetado)

  const titulo = (e: EventoReproductivo) =>
    e.tipo === 'diagnostico' && e.resultado
      ? `Diagnóstico: ${RESULTADOS[e.resultado].toLowerCase()}`
      : e.tipo === 'destete' && e.animalId !== animal.id
        ? 'Destete de su ternero'
        : TIPOS_EVENTO[e.tipo]

  const detalle = (e: EventoReproductivo): ReactNode[] => [
    fecha(e.fecha),
    e.padre ? (
      <span key="padre">
        con <Link to={`${lista}/${e.padre.id}`}>{identificacion(e.padre)}</Link>
      </span>
    ) : (
      e.padreTexto && `con ${e.padreTexto}`
    ),
    e.metodo && METODOS[e.metodo],
    e.tipo === 'destete' && e.animalId !== animal.id && (
      <Link key="ternero" to={`${lista}/${e.animal.id}`}>
        {identificacion(e.animal)}
      </Link>
    ),
  ]

  let contenido: ReactNode
  if (eventos.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }]} />
  } else if (eventos.isError) {
    contenido = (
      <EstadoError alReintentar={() => eventos.refetch()} reintentando={eventos.isFetching} />
    )
  } else if (eventos.data.length === 0) {
    contenido = <p className={estilos.suave}>Sin eventos registrados</p>
  } else {
    contenido = (
      <ul className={estilos.tratamientos} aria-label="Historial reproductivo">
        {eventos.data.map((e) => (
          <li key={e.id} className={e.anulacion ? estilos.anulado : undefined}>
            <div>
              <span className={estilos.producto}>{titulo(e)}</span>
              <span className={estilos.suave}>
                {detalle(e)
                  .filter(Boolean)
                  .flatMap((d, i) => (i ? [' · ', d] : [d]))}
              </span>
              {e.fechaPrevistaParto && !e.anulacion && (
                <span className={estilos.suave}>
                  Parto previsto el {fecha(e.fechaPrevistaParto)}
                </span>
              )}
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
                etiqueta={`Anular ${titulo(e).toLowerCase()} del ${fecha(e.fecha)}`}
                icono={<Ban aria-hidden size={18} />}
                onClick={() => setAnulando(e)}
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
        <h2 id="ficha-reproduccion">
          <Heart aria-hidden size={20} className={estilos.iconoTitulo} />
          Reproducción
        </h2>
        {tipos.length > 0 && (
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<Plus aria-hidden size={18} />}
            onClick={() => setRegistrando(true)}
          >
            {tipos.length === 1 && tipos[0] === 'destete' ? 'Registrar destete' : 'Registrar'}
          </Boton>
        )}
      </div>
      {animal.gestacion && (
        <div>
          <InsigniaGestacion gestacion={animal.gestacion} />
        </div>
      )}
      {contenido}
      {registrando && (
        <FormularioEvento
          animales={[animal]}
          tipos={tipos}
          alCerrar={() => setRegistrando(false)}
        />
      )}
      {anulando && (
        <FormularioAnulacion
          titulo="¿Anular el evento?"
          descripcion={`${titulo(anulando)}, del ${fecha(anulando.fecha)}. No se borra: queda en el historial como anulado, con el motivo, y deja de contar para la gestación.`}
          textoBoton="Anular evento"
          ayuda="Por ejemplo: registrado en la vaca equivocada"
          mensajeExito={`${titulo(anulando)} del ${fecha(anulando.fecha)} anulado`}
          anular={(motivo) =>
            datos(
              api.POST('/api/explotaciones/{explotacionId}/reproduccion/{eventoId}/anulacion', {
                params: { path: { explotacionId: explotacion.id, eventoId: anulando.id } },
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
