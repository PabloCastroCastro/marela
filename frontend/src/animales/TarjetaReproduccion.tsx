import { Ban, Plus } from 'lucide-react'
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
import { type AnimalDetalle, identificacion, SEXOS } from './datos'
import { FormularioAnulacion } from './FormularioAnulacion'
import { FormularioEvento } from './FormularioEvento'
import { InsigniaGestacion } from './InsigniaGestacion'
import { useRecorte } from './Recorte'
import {
  type EventoReproductivo,
  METODOS,
  type Parto,
  RESULTADOS,
  TIPOS_EVENTO,
  TIPOS_PARTO,
  tiposPara,
  useEventos,
  usePartos,
} from './reproduccion'

// Una fila del historial: un evento (GH-22) o un parto (GH-23)
type Entrada = {
  clave: string
  fecha: string
  creadoEn: string
  titulo: string
  detalle: ReactNode[]
  lineas: ReactNode[]
  observaciones: string | null
  anulacion: { en: string; por: string; motivo: string } | null
  anular: () => void
}

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
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState<Anulando>()
  const lista = `${rutaExplotacion(explotacion.id)}/animales`
  // El destete, solo si aún no lo tiene
  const destetado = eventos.data?.some(
    (e) => e.tipo === 'destete' && e.animalId === animal.id && !e.anulacion,
  )
  const tipos = tiposPara(animal).filter((t) => t !== 'destete' || !destetado)
  const enlace = (a: { id: string; crotal: string | null; nombre: string | null }) => (
    <Link key={a.id} to={`${lista}/${a.id}`}>
      {identificacion(a)}
    </Link>
  )

  const deEvento = (e: EventoReproductivo): Entrada => {
    const titulo =
      e.tipo === 'diagnostico' && e.resultado
        ? `Diagnóstico: ${RESULTADOS[e.resultado].toLowerCase()}`
        : e.tipo === 'destete' && e.animalId !== animal.id
          ? 'Destete de su ternero'
          : TIPOS_EVENTO[e.tipo]
    return {
      clave: e.id,
      fecha: e.fecha,
      creadoEn: e.creadoEn,
      titulo,
      detalle: [
        fecha(e.fecha),
        e.padre ? (
          <span key="padre">con {enlace(e.padre)}</span>
        ) : (
          e.padreTexto && `con ${e.padreTexto}`
        ),
        e.metodo && METODOS[e.metodo],
        e.tipo === 'destete' && e.animalId !== animal.id && enlace(e.animal),
      ],
      lineas:
        e.fechaPrevistaParto && !e.anulacion
          ? [`Parto previsto el ${fecha(e.fechaPrevistaParto)}`]
          : [],
      observaciones: e.observaciones,
      anulacion: e.anulacion,
      anular: () => setAnulando({ tipo: 'evento', evento: e, titulo }),
    }
  }

  const deParto = (p: Parto): Entrada => ({
    clave: p.id,
    fecha: p.fecha,
    creadoEn: p.creadoEn,
    titulo: p.tipo === 'normal' ? 'Parto' : `Parto ${TIPOS_PARTO[p.tipo].toLowerCase()}`,
    detalle: [
      fecha(p.fecha),
      p.padre ? (
        <span key="padre">de {enlace(p.padre)}</span>
      ) : (
        p.padreTexto && `de ${p.padreTexto}`
      ),
    ],
    lineas: p.terneros.map((t) => (
      <span key={t.id}>
        {enlace(t)} · {SEXOS[t.sexo].toLowerCase()}
        {t.estado === 'muerto' && ', nacido muerto'}
      </span>
    )),
    observaciones: p.observaciones,
    anulacion: p.anulacion,
    anular: () => setAnulando({ tipo: 'parto', parto: p }),
  })

  // Del más reciente al más antiguo; a la vista, solo lo último
  const entradas = [
    ...(eventos.data ?? []).map(deEvento),
    ...(partos.data ?? []).map(deParto),
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
                <span className={estilos.suave}>
                  {e.detalle.filter(Boolean).flatMap((d, i) => (i ? [' · ', d] : [d]))}
                </span>
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
      {recorte.boton}
      {registrando && (
        <FormularioEvento
          animales={[animal]}
          tipos={tipos}
          alCerrar={() => setRegistrando(false)}
        />
      )}
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
