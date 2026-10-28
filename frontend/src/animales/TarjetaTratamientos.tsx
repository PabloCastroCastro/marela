import { Ban, Syringe } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { api, datos } from '../api/cliente'
import { BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import estilos from './Animales.module.css'
import type { AnimalDetalle } from './datos'
import { FormularioAnulacion } from './FormularioAnulacion'
import { InsigniaSupresion } from './InsigniaSupresion'
import { MOTIVOS_TRATAMIENTO, type Tratamiento, useTratamientos, VIAS } from './tratamientos'

// Tratamientos del animal en su ficha: la supresión en curso y el historial, con los anulados
// (GH-20)
export function TarjetaTratamientos({ animal }: { animal: AnimalDetalle }) {
  const explotacion = useExplotacionActual()
  const tratamientos = useTratamientos(explotacion.id, animal.id)
  const [anulando, setAnulando] = useState<Tratamiento>()

  // A la vista, solo los últimos
  const recorte = useRecorte(tratamientos.data ?? [])

  let contenido: ReactNode
  if (tratamientos.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }]} />
  } else if (tratamientos.isError) {
    contenido = (
      <EstadoError
        alReintentar={() => tratamientos.refetch()}
        reintentando={tratamientos.isFetching}
      />
    )
  } else if (tratamientos.data.length === 0) {
    contenido = <p className={estilos.suave}>Sin tratamientos registrados</p>
  } else {
    contenido = (
      <ul className={estilos.tratamientos} aria-label="Historial de tratamientos">
        {recorte.elementos.map((t) => (
          <li key={t.id} className={t.anulacion ? estilos.anulado : undefined}>
            <div>
              <span className={estilos.producto}>{t.producto}</span>
              <span className={estilos.suave}>
                {[fecha(t.fecha), MOTIVOS_TRATAMIENTO[t.motivo], t.diagnostico]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className={estilos.suave}>
                {[
                  t.dosis,
                  t.via && VIAS[t.via],
                  t.aplicadoPor && `por ${t.aplicadoPor.nombre}`,
                  t.lote && `lote ${t.lote}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className={estilos.suave}>
                {t.diasSupresion === 0
                  ? 'Sin supresión'
                  : `Supresión de ${t.diasSupresion} ${t.diasSupresion === 1 ? 'día' : 'días'}, hasta el ${fecha(t.finSupresion)}`}
              </span>
              {t.observaciones && <span className={estilos.suave}>{t.observaciones}</span>}
              {t.anulacion && (
                <span className={estilos.motivoAnulacion}>
                  <Insignia icono={<Ban aria-hidden />}>Anulado</Insignia>
                  {t.anulacion.motivo} ({t.anulacion.por}, {fecha(t.anulacion.en)})
                </span>
              )}
            </div>
            {!t.anulacion && (
              <BotonIcono
                etiqueta={`Anular el tratamiento con ${t.producto} del ${fecha(t.fecha)}`}
                icono={<Ban aria-hidden size={18} />}
                onClick={() => setAnulando(t)}
              />
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Tarjeta aria-labelledby="ficha-tratamientos" className={estilos.tarjetaRegistros}>
      <div className={estilos.cabeceraTarjeta}>
        <h2 id="ficha-tratamientos">
          <Syringe aria-hidden size={20} className={estilos.iconoTitulo} />
          Tratamientos
        </h2>
      </div>
      {animal.finSupresion && (
        <div>
          <InsigniaSupresion fin={animal.finSupresion} />
        </div>
      )}
      {contenido}
      {recorte.boton}
      {anulando && (
        <FormularioAnulacion
          titulo="¿Anular el tratamiento?"
          descripcion={`${anulando.producto}, del ${fecha(anulando.fecha)}. No se borra: queda en la ficha como anulado, con el motivo, y deja de contar para la supresión.`}
          textoBoton="Anular tratamiento"
          ayuda="Por ejemplo: registrado en el animal equivocado"
          mensajeExito={`Tratamiento con ${anulando.producto} anulado`}
          anular={(motivo) =>
            datos(
              api.POST(
                '/api/explotaciones/{explotacionId}/tratamientos/{tratamientoId}/anulacion',
                {
                  params: { path: { explotacionId: explotacion.id, tratamientoId: anulando.id } },
                  body: { motivo },
                },
              ),
            )
          }
          alCerrar={() => setAnulando(undefined)}
        />
      )}
    </Tarjeta>
  )
}
