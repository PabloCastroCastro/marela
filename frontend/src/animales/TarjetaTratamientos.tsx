import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Plus, Syringe } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto } from '../componentes/Campo'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, CLAVE_ANIMALES } from './datos'
import { FormularioTratamiento } from './FormularioTratamiento'
import { InsigniaSupresion } from './InsigniaSupresion'
import { MOTIVOS_TRATAMIENTO, type Tratamiento, useTratamientos, VIAS } from './tratamientos'

// Tratamientos del animal en su ficha: la supresión en curso y el historial, con los anulados
// (GH-20)
export function TarjetaTratamientos({ animal }: { animal: AnimalDetalle }) {
  const explotacion = useExplotacionActual()
  const tratamientos = useTratamientos(explotacion.id, animal.id)
  const [registrando, setRegistrando] = useState(false)
  const [anulando, setAnulando] = useState<Tratamiento>()

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
        {tratamientos.data.map((t) => (
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
        <Boton
          variante="secundario"
          tamano="compacto"
          icono={<Plus aria-hidden size={18} />}
          onClick={() => setRegistrando(true)}
        >
          Registrar tratamiento
        </Boton>
      </div>
      {animal.finSupresion && (
        <div>
          <InsigniaSupresion fin={animal.finSupresion} />
        </div>
      )}
      {contenido}
      {registrando && (
        <FormularioTratamiento animales={[animal]} alCerrar={() => setRegistrando(false)} />
      )}
      {anulando && (
        <FormularioAnulacion tratamiento={anulando} alCerrar={() => setAnulando(undefined)} />
      )}
    </Tarjeta>
  )
}

// Anular un tratamiento registrado por error: no se borra, queda en la ficha con el motivo
function FormularioAnulacion({
  tratamiento,
  alCerrar,
}: {
  tratamiento: Tratamiento
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [motivo, setMotivo] = useState('')
  const [errorLocal, setErrorLocal] = useState<string>()

  const anular = useMutation({
    mutationFn: () =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/tratamientos/{tratamientoId}/anulacion', {
          params: { path: { explotacionId: explotacion.id, tratamientoId: tratamiento.id } },
          body: { motivo },
        }),
      ),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      avisar({ tipo: 'exito', mensaje: `Tratamiento con ${tratamiento.producto} anulado` })
      alCerrar()
    },
  })

  const errores = erroresPorCampo(anular.error)
  const errorGeneral =
    anular.error && Object.keys(errores).length === 0 ? anular.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!motivo.trim()) {
      setErrorLocal('Indica por qué se anula')
      return
    }
    setErrorLocal(undefined)
    anular.mutate()
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo="¿Anular el tratamiento?"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton
            type="submit"
            form="formulario-anulacion"
            variante="peligro"
            cargando={anular.isPending}
          >
            Anular tratamiento
          </Boton>
        </>
      }
    >
      <form id="formulario-anulacion" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <p>
          {tratamiento.producto}, del {fecha(tratamiento.fecha)}. No se borra: queda en la ficha
          como anulado, con el motivo, y deja de contar para la supresión.
        </p>
        <AreaTexto
          etiqueta="Motivo de la anulación"
          ayuda="Por ejemplo: registrado en el animal equivocado"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={errorLocal ?? errores.motivo}
          required
          autoFocus
        />
      </form>
    </HojaInferior>
  )
}
