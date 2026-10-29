import { CloudUpload, Pencil, Scale } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha, kilos } from '../formato'
import { useCola } from '../sinConexion/cola'
import estilos from './Animales.module.css'
import type { AnimalDetalle } from './datos'
import { FormularioPesada } from './FormularioPesada'
import { GraficoPeso } from './GraficoPeso'
import {
  conGanancia,
  ganancia,
  gananciaMedia,
  MOMENTOS,
  type NuevaPesada,
  type Pesada,
  usePesadas,
} from './pesos'

const peso = (kg: number) => kilos(kg, kg % 1 ? 1 : 0)

// Pesos del animal en su ficha: el último, la ganancia media, la evolución y cada pesada (GH-21)
export function TarjetaPesos({ animal }: { animal: AnimalDetalle }) {
  const explotacion = useExplotacionActual()
  const pesadas = usePesadas(explotacion.id, animal.id)
  // undefined: cerrado; null: pesada nueva; una pesada: corregirla
  const [editando, setEditando] = useState<Pesada | null>()
  const sinEnviar = useCola().filter(
    (p) => p.tipo === 'pesada' && p.contexto.animalId === animal.id,
  )

  // La lista, de la más reciente a la más antigua y con solo las últimas a la vista: el gráfico
  // ya muestra toda la evolución
  const recientes = conGanancia(pesadas.data ?? []).toReversed()
  const recorte = useRecorte(recientes)

  let contenido: ReactNode
  if (pesadas.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '3rem' }, { alto: '10rem' }]} />
  } else if (pesadas.isError) {
    contenido = (
      <EstadoError alReintentar={() => pesadas.refetch()} reintentando={pesadas.isFetching} />
    )
  } else if (pesadas.data.length === 0) {
    contenido = <p className={estilos.suave}>Sin pesadas registradas</p>
  } else {
    const lista = conGanancia(pesadas.data)
    const ultima = pesadas.data.at(-1)
    const media = gananciaMedia(pesadas.data)
    contenido = (
      <>
        <dl className={estilos.cifrasPeso}>
          <div>
            <dt>Último peso</dt>
            <dd>{ultima && peso(ultima.kg)}</dd>
          </div>
          {media !== null && (
            <div>
              <dt>Ganancia media</dt>
              <dd>{ganancia(media)}</dd>
            </div>
          )}
        </dl>
        <GraficoPeso pesadas={lista} />
        <ul className={estilos.pesadas} aria-label="Pesadas">
          {recorte.elementos.map((p) => (
            <li key={p.id}>
              <div>
                <span className={estilos.cifra}>{peso(p.kg)}</span>
                <span className={estilos.suave}>
                  {fecha(p.fecha)}
                  {p.momento !== 'otro' && ` · ${MOMENTOS[p.momento].toLowerCase()}`}
                  {p.ganancia !== null && ` · ${ganancia(p.ganancia)}`}
                </span>
              </div>
              <BotonIcono
                etiqueta={`Corregir la pesada del ${fecha(p.fecha)}`}
                icono={<Pencil aria-hidden size={18} />}
                onClick={() => setEditando(p)}
              />
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <Tarjeta aria-labelledby="ficha-pesos" className={estilos.tarjetaRegistros}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="ficha-pesos">
          <Scale aria-hidden size={20} className={estilos.iconoTitulo} />
          Pesos
        </h2>
      </div>
      {/* Las registradas sin conexión, hasta que lleguen (GH-31) */}
      {sinEnviar.length > 0 && (
        <ul className={estilos.pesadas} aria-label="Pesadas sin enviar">
          {sinEnviar.map((p) => {
            const c = p.cuerpo as NuevaPesada
            return (
              <li key={p.id}>
                <div>
                  <span className={estilos.cifra}>{peso(c.kg)}</span>
                  <span className={estilos.suave}>{fecha(c.fecha)}</span>
                </div>
                <Insignia
                  tipo={p.estado === 'fallido' ? 'peligro' : 'aviso'}
                  icono={<CloudUpload aria-hidden size={14} />}
                >
                  {p.estado === 'fallido' ? 'No enviada' : 'Sin enviar'}
                </Insignia>
              </li>
            )
          })}
        </ul>
      )}
      {contenido}
      {recorte.boton}
      {editando !== undefined && (
        <FormularioPesada
          animal={animal}
          pesada={editando ?? undefined}
          alCerrar={() => setEditando(undefined)}
        />
      )}
    </Tarjeta>
  )
}
