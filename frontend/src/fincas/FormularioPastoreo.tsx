import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import { CLAVE_FINCAS, type Finca } from './datos'
import estilos from './Fincas.module.css'
import type { Pastoreo } from './pastoreos'

// Registrar la entrada de animales a pastar en una finca, o corregir o borrar un pastoreo (GH-28).
// Si la finca está en plazo de seguridad, lo avisa, pero deja guardar.
export function FormularioPastoreo({
  finca,
  pastoreo,
  alCerrar,
}: {
  finca: Finca
  // Para corregirlo o borrarlo
  pastoreo?: Pastoreo
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [f, setF] = useState({
    fechaEntrada: pastoreo?.fechaEntrada ?? hoy(),
    fechaSalida: pastoreo?.fechaSalida ?? '',
    animales: pastoreo ? String(pastoreo.animales) : '',
    observaciones: pastoreo?.observaciones ?? '',
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const refrescar = () => cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })

  const cuerpo = () => ({
    fechaEntrada: f.fechaEntrada,
    fechaSalida: f.fechaSalida || null,
    animales: Number(f.animales),
    observaciones: f.observaciones,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (pastoreo) {
        await datos(
          api.PUT('/api/explotaciones/{explotacionId}/pastoreos/{pastoreoId}', {
            params: { path: { explotacionId: explotacion.id, pastoreoId: pastoreo.id } },
            body: cuerpo(),
          }),
        )
        return 'Pastoreo corregido'
      }
      await datos(
        api.POST('/api/explotaciones/{explotacionId}/pastoreos', {
          params: { path: { explotacionId: explotacion.id } },
          body: { fincaId: finca.id, ...cuerpo() },
        }),
      )
      return 'Pastoreo registrado'
    },
    onSuccess: async (mensaje) => {
      await refrescar()
      avisar({ tipo: 'exito', mensaje })
      alCerrar()
    },
  })

  // Para deshacer un borrado se vuelve a registrar el mismo pastoreo
  const recuperar = useMutation({
    mutationFn: (p: Pastoreo) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/pastoreos', {
          params: { path: { explotacionId: explotacion.id } },
          body: {
            fincaId: p.fincaId,
            fechaEntrada: p.fechaEntrada,
            fechaSalida: p.fechaSalida,
            animales: p.animales,
            observaciones: p.observaciones,
          },
        }),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: (p: Pastoreo) =>
      datos(
        api.DELETE('/api/explotaciones/{explotacionId}/pastoreos/{pastoreoId}', {
          params: { path: { explotacionId: explotacion.id, pastoreoId: p.id } },
        }),
      ),
    onSuccess: async (p) => {
      await refrescar()
      avisar({
        mensaje: `Pastoreo del ${formatoFecha(p.fechaEntrada)} borrado`,
        accion: { texto: 'Deshacer', alPulsar: () => recuperar.mutate(p) },
      })
      alCerrar()
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const errores: Record<string, string | undefined> = {
    ...erroresPorCampo(guardar.error),
    ...erroresLocales,
  }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null
  const enPlazo = finca.finSeguridad && f.fechaEntrada < finca.finSeguridad

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    const n = Number(f.animales)
    if (!f.animales.trim() || !Number.isInteger(n) || n < 1)
      locales.animales = 'Indica cuántos animales, por ejemplo 12'
    if (f.fechaSalida && f.fechaSalida < f.fechaEntrada)
      locales.fechaSalida = 'La salida no puede ser antes de la entrada'
    setErroresLocales(locales)
    if (Object.keys(locales).length === 0) guardar.mutate()
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={pastoreo ? 'Corregir · Pastoreo' : `Pastoreo · ${finca.nombre}`}
      pie={
        <>
          {pastoreo && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Trash2 aria-hidden size={18} />}
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(pastoreo)}
            >
              Borrar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-pastoreo" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-pastoreo" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {errores.fincaId && (
          <p className={estilos.error} role="alert">
            {errores.fincaId}
          </p>
        )}
        <CampoFecha
          etiqueta="Fecha de entrada"
          value={f.fechaEntrada}
          max={hoy()}
          onChange={(e) => cambiar('fechaEntrada', e.target.value)}
          error={errores.fechaEntrada}
          required
        />
        {enPlazo && finca.finSeguridad && (
          <p className={estilos.aviso} role="status">
            <TriangleAlert aria-hidden size={18} />
            La finca está en plazo de seguridad hasta el {formatoFecha(finca.finSeguridad)}:
            comprueba que el producto permite pastar.
          </p>
        )}
        <Campo
          etiqueta="Número de animales"
          inputMode="numeric"
          autoComplete="off"
          value={f.animales}
          onChange={(e) => cambiar('animales', e.target.value)}
          error={errores.animales}
          required
        />
        <CampoFecha
          etiqueta="Fecha de salida"
          ayuda="Déjala vacía si los animales siguen en la finca"
          value={f.fechaSalida}
          min={f.fechaEntrada}
          max={hoy()}
          onChange={(e) => cambiar('fechaSalida', e.target.value)}
          error={errores.fechaSalida}
        />
        <AreaTexto
          etiqueta="Observaciones"
          ayuda="Por ejemplo: vacas con sus crías"
          value={f.observaciones}
          onChange={(e) => cambiar('observaciones', e.target.value)}
          error={errores.observaciones}
        />
      </form>
    </HojaInferior>
  )
}
