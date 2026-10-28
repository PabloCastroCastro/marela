import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import estilos from './Animales.module.css'
import { CLAVE_ANIMALES, identificacion, useAnimales } from './datos'
import {
  type DatosEvento,
  DIAS_GESTACION,
  METODOS,
  type MetodoDiagnostico,
  masDias,
  RESULTADOS,
  type ResultadoDiagnostico,
  TIPOS_EVENTO,
  type TipoEvento,
} from './reproduccion'

type AnimalDelEvento = {
  id: string
  crotal: string | null
  nombre?: string | null
  fechaNacimiento: string
  fechaBaja?: string | null
}

const REGISTRADO: Record<TipoEvento, string> = {
  cubricion: 'Cubrición registrada',
  inseminacion: 'Inseminación registrada',
  diagnostico: 'Diagnóstico registrado',
  aborto: 'Aborto registrado',
  destete: 'Destete registrado',
}

// Valor del selector del padre para escribir un texto (toro de fuera, dosis)
const OTRO = 'otro'

// "412,5" → 412.5; null si no es un número
const leerKg = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

// Registrar un evento reproductivo a uno o varios animales (GH-22): se crea uno por animal
export function FormularioEvento({
  animales,
  tipos,
  alCerrar,
  alGuardar,
}: {
  animales: AnimalDelEvento[]
  // Los tipos que se pueden elegir; el primero, elegido al abrir
  tipos: TipoEvento[]
  alCerrar: () => void
  alGuardar?: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  // Toros activos de la explotación, para elegir el padre
  const toros = useAnimales(explotacion.id, { sexo: 'macho', estado: 'activo' })

  // Entre el nacimiento del más joven y hoy, o la primera baja si alguno ya no está
  const primerDia = animales.reduce(
    (max, a) => (a.fechaNacimiento > max ? a.fechaNacimiento : max),
    '',
  )
  const ultimoDia = animales.reduce(
    (min, a) => (a.fechaBaja && a.fechaBaja < min ? a.fechaBaja : min),
    hoy(),
  )
  const [f, setF] = useState({
    tipo: tipos[0] ?? 'cubricion',
    fecha: ultimoDia,
    // Un toro, OTRO o '' (sin elegir)
    padre: '',
    padreTexto: '',
    metodo: '' as MetodoDiagnostico | '',
    resultado: '' as ResultadoDiagnostico | '',
    peso: '',
    observaciones: '',
  })
  const [errorPeso, setErrorPeso] = useState<string>()
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const guardar = useMutation({
    mutationFn: (cuerpo: DatosEvento) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/reproduccion', {
          params: { path: { explotacionId: explotacion.id } },
          body: cuerpo,
        }),
      ),
    onSuccess: async (creados) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      const registrado = REGISTRADO[f.tipo]
      avisar({
        tipo: 'exito',
        mensaje: creados.length === 1 ? registrado : `${registrado} a ${creados.length} animales`,
      })
      alGuardar?.()
      alCerrar()
    },
  })

  const errores = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? guardar.error.message : null
  const conPadre = f.tipo === 'cubricion' || f.tipo === 'inseminacion'

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const kg = f.peso.trim() ? leerKg(f.peso) : null
    if (f.tipo === 'destete' && f.peso.trim() && kg === null) {
      setErrorPeso('Indica el peso en kg, por ejemplo 245,5')
      return
    }
    setErrorPeso(undefined)
    const otro = f.padre === OTRO
    guardar.mutate({
      animalIds: animales.map((a) => a.id),
      tipo: f.tipo,
      fecha: f.fecha,
      padreId: conPadre && f.padre && !otro ? f.padre : null,
      padreTexto: conPadre && otro ? f.padreTexto : null,
      metodo: f.tipo === 'diagnostico' ? f.metodo || null : null,
      resultado: f.tipo === 'diagnostico' ? f.resultado || null : null,
      pesoDestete: f.tipo === 'destete' ? kg : null,
      observaciones: f.observaciones,
    })
  }

  const [unico] = animales
  const titulo =
    animales.length === 1 && unico
      ? `Registrar · ${identificacion(unico)}`
      : tipos.every((t) => t === 'cubricion' || t === 'inseminacion')
        ? `Cubrir ${animales.length} animales`
        : `Registrar a ${animales.length} animales`

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={titulo}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-evento" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-evento" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {animales.length > 1 && (
          <p className={estilos.suave}>{animales.map(identificacion).join(', ')}</p>
        )}
        {errores.animalIds && (
          <p className={estilos.error} role="alert">
            {errores.animalIds}
          </p>
        )}
        {tipos.length > 1 && (
          <fieldset className={estilos.grupo}>
            <legend>Tipo</legend>
            <Chips
              etiqueta="Tipo"
              opciones={tipos.map((t) => ({ valor: t, texto: TIPOS_EVENTO[t] }))}
              seleccion={f.tipo}
              alCambiar={(tipo) => cambiar('tipo', tipo)}
            />
          </fieldset>
        )}
        <CampoFecha
          etiqueta="Fecha"
          value={f.fecha}
          min={primerDia}
          max={ultimoDia}
          onChange={(e) => cambiar('fecha', e.target.value)}
          ayuda={
            conPadre && f.fecha
              ? `Parto previsto el ${formatoFecha(masDias(f.fecha, DIAS_GESTACION))}`
              : undefined
          }
          error={errores.fecha}
          required
        />

        {conPadre && (
          <>
            <Selector
              etiqueta={f.tipo === 'inseminacion' ? 'Toro o dosis' : 'Toro'}
              value={f.padre}
              onChange={(e) => cambiar('padre', e.target.value)}
              error={f.padre === OTRO ? undefined : errores.padreId}
              required
            >
              <option value="" disabled>
                Elige el toro
              </option>
              {(toros.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {identificacion(t)}
                </option>
              ))}
              <option value={OTRO}>
                {f.tipo === 'inseminacion' ? 'Dosis o toro de fuera' : 'Toro de fuera'}
              </option>
            </Selector>
            {f.padre === OTRO && (
              <Campo
                etiqueta={f.tipo === 'inseminacion' ? 'Dosis o toro (código o nombre)' : 'Toro'}
                value={f.padreTexto}
                onChange={(e) => cambiar('padreTexto', e.target.value)}
                error={errores.padreTexto ?? errores.padreId}
                required
              />
            )}
          </>
        )}

        {f.tipo === 'diagnostico' && (
          <>
            <fieldset className={estilos.grupo}>
              <legend>Método *</legend>
              <Chips
                etiqueta="Método"
                opciones={(Object.keys(METODOS) as MetodoDiagnostico[]).map((m) => ({
                  valor: m,
                  texto: METODOS[m],
                }))}
                seleccion={f.metodo}
                alCambiar={(m) => cambiar('metodo', m)}
              />
              {errores.metodo && (
                <p className={estilos.errorCampo} role="alert">
                  {errores.metodo}
                </p>
              )}
            </fieldset>
            <fieldset className={estilos.grupo}>
              <legend>Resultado *</legend>
              <Chips
                etiqueta="Resultado"
                opciones={(Object.keys(RESULTADOS) as ResultadoDiagnostico[]).map((r) => ({
                  valor: r,
                  texto: RESULTADOS[r],
                }))}
                seleccion={f.resultado}
                alCambiar={(r) => cambiar('resultado', r)}
              />
              {errores.resultado && (
                <p className={estilos.errorCampo} role="alert">
                  {errores.resultado}
                </p>
              )}
            </fieldset>
          </>
        )}

        {f.tipo === 'destete' && animales.length === 1 && (
          <Campo
            etiqueta="Peso al destete (kg)"
            ayuda="Opcional: se guarda también como su pesada al destete"
            inputMode="decimal"
            autoComplete="off"
            value={f.peso}
            onChange={(e) => cambiar('peso', e.target.value)}
            error={errorPeso ?? errores.pesoDestete}
          />
        )}

        <AreaTexto
          etiqueta="Observaciones"
          value={f.observaciones}
          onChange={(e) => cambiar('observaciones', e.target.value)}
          error={errores.observaciones}
        />
      </form>
    </HojaInferior>
  )
}
