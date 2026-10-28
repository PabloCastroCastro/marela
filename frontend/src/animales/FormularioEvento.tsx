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
import {
  CamposTerneros,
  datosTerneros,
  erroresTerneros,
  leerKg,
  type TerneroFormulario,
  terneroNuevo,
} from './CamposTerneros'
import { CLAVE_ANIMALES, identificacion, useAnimales } from './datos'
import {
  DIAS_GESTACION,
  type Gestacion,
  METODOS,
  type MetodoDiagnostico,
  masDias,
  RESULTADOS,
  type ResultadoDiagnostico,
  TIPOS_PARTO,
  TIPOS_REGISTRO,
  type TipoParto,
  type TipoRegistro,
} from './reproduccion'

type AnimalDelEvento = {
  id: string
  crotal: string | null
  nombre?: string | null
  raza?: string
  fechaNacimiento: string
  fechaBaja?: string | null
  gestacion?: Gestacion | null
}

const REGISTRADO: Record<Exclude<TipoRegistro, 'parto'>, string> = {
  cubricion: 'Cubrición registrada',
  inseminacion: 'Inseminación registrada',
  diagnostico: 'Diagnóstico registrado',
  aborto: 'Aborto registrado',
  destete: 'Destete registrado',
}

// Valor del selector del padre para escribir un texto (toro de fuera, dosis)
const OTRO = 'otro'

// Registrar un evento reproductivo (GH-22) a uno o varios animales, uno por animal, o el parto de
// una vaca (GH-23), que crea las fichas de sus terneros
export function FormularioEvento({
  animales,
  tipos,
  alCerrar,
  alGuardar,
}: {
  animales: AnimalDelEvento[]
  // Lo que se puede elegir; lo primero, elegido al abrir. El parto, solo con una vaca.
  tipos: TipoRegistro[]
  alCerrar: () => void
  alGuardar?: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  // Toros activos de la explotación, para elegir el padre
  const toros = useAnimales(explotacion.id, { sexo: 'macho', estado: 'activo' })
  const [unico] = animales

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
    tipo: tipos[0] ?? ('cubricion' as TipoRegistro),
    fecha: ultimoDia,
    // Un toro, OTRO o '' (sin elegir)
    padre: '',
    padreTexto: '',
    metodo: '' as MetodoDiagnostico | '',
    resultado: '' as ResultadoDiagnostico | '',
    peso: '',
    tipoParto: 'normal' as TipoParto,
    observaciones: '',
  })
  const [terneros, setTerneros] = useState<TerneroFormulario[]>([terneroNuevo(unico?.raza ?? '')])
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const parto = f.tipo === 'parto'
  // En el parto, el padre es el de la gestación; solo se elige si no la hay
  const desdeGestacion = parto ? (unico?.gestacion?.desde ?? null) : null
  const conPadre = f.tipo === 'cubricion' || f.tipo === 'inseminacion'
  const eligePadre = conPadre || (parto && !desdeGestacion)

  const guardar = useMutation({
    mutationFn: async () => {
      const otro = f.padre === OTRO
      const padreId = eligePadre && f.padre && !otro ? f.padre : null
      const padreTexto = eligePadre && otro ? f.padreTexto : null
      if (parto) {
        const creado = await datos(
          api.POST('/api/explotaciones/{explotacionId}/animales/{animalId}/partos', {
            params: { path: { explotacionId: explotacion.id, animalId: unico?.id ?? '' } },
            body: {
              fecha: f.fecha,
              tipo: f.tipoParto,
              padreId,
              padreTexto,
              observaciones: f.observaciones,
              terneros: datosTerneros(terneros),
            },
          }),
        )
        const n = creado.terneros.length
        return `Parto registrado: ${n === 1 ? '1 ternero' : `${n} terneros`}`
      }
      const tipo = f.tipo as Exclude<TipoRegistro, 'parto'>
      const creados = await datos(
        api.POST('/api/explotaciones/{explotacionId}/reproduccion', {
          params: { path: { explotacionId: explotacion.id } },
          body: {
            animalIds: animales.map((a) => a.id),
            tipo,
            fecha: f.fecha,
            padreId,
            padreTexto,
            metodo: tipo === 'diagnostico' ? f.metodo || null : null,
            resultado: tipo === 'diagnostico' ? f.resultado || null : null,
            pesoDestete: tipo === 'destete' && f.peso.trim() ? leerKg(f.peso) : null,
            observaciones: f.observaciones,
          },
        }),
      )
      return creados.length === 1
        ? REGISTRADO[tipo]
        : `${REGISTRADO[tipo]} a ${creados.length} animales`
    },
    onSuccess: async (mensaje) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      avisar({ tipo: 'exito', mensaje })
      alGuardar?.()
      alCerrar()
    },
  })

  const errores: Record<string, string | undefined> = {
    ...erroresPorCampo(guardar.error),
    ...erroresLocales,
  }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = parto ? erroresTerneros(terneros) : {}
    if (f.tipo === 'destete' && f.peso.trim() && leerKg(f.peso) === null)
      locales.pesoDestete = 'Indica el peso en kg, por ejemplo 245,5'
    setErroresLocales(locales)
    if (Object.keys(locales).length === 0) guardar.mutate()
  }

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
            {parto ? 'Guardar parto' : 'Guardar'}
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
              opciones={tipos.map((t) => ({ valor: t, texto: TIPOS_REGISTRO[t] }))}
              seleccion={f.tipo}
              alCambiar={(tipo) => cambiar('tipo', tipo)}
              envolver
            />
          </fieldset>
        )}
        <CampoFecha
          etiqueta="Fecha"
          value={f.fecha}
          min={desdeGestacion ?? primerDia}
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

        {parto && (
          <fieldset className={estilos.grupo}>
            <legend>Tipo de parto</legend>
            <Chips
              etiqueta="Tipo de parto"
              opciones={(Object.keys(TIPOS_PARTO) as TipoParto[]).map((t) => ({
                valor: t,
                texto: TIPOS_PARTO[t],
              }))}
              seleccion={f.tipoParto}
              alCambiar={(t) => cambiar('tipoParto', t)}
            />
          </fieldset>
        )}
        {desdeGestacion && (
          <p className={estilos.suave}>
            El padre es el de la cubrición o inseminación del {formatoFecha(desdeGestacion)}.
          </p>
        )}

        {eligePadre && (
          <>
            <Selector
              etiqueta={parto ? 'Padre' : f.tipo === 'inseminacion' ? 'Toro o dosis' : 'Toro'}
              value={f.padre}
              onChange={(e) => cambiar('padre', e.target.value)}
              error={f.padre === OTRO ? undefined : errores.padreId}
              required={!parto}
            >
              <option value="" disabled={!parto}>
                {parto ? 'Sin indicar' : 'Elige el toro'}
              </option>
              {(toros.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {identificacion(t)}
                </option>
              ))}
              <option value={OTRO}>
                {f.tipo === 'cubricion' ? 'Toro de fuera' : 'Dosis o toro de fuera'}
              </option>
            </Selector>
            {f.padre === OTRO && (
              <Campo
                etiqueta={f.tipo === 'cubricion' ? 'Toro' : 'Dosis o toro (código o nombre)'}
                value={f.padreTexto}
                onChange={(e) => cambiar('padreTexto', e.target.value)}
                error={errores.padreTexto ?? errores.padreId}
                required={!parto}
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

        {parto && (
          <CamposTerneros
            terneros={terneros}
            razaMadre={unico?.raza ?? ''}
            alCambiar={setTerneros}
            errores={errores}
          />
        )}

        {f.tipo === 'destete' && animales.length === 1 && (
          <Campo
            etiqueta="Peso al destete (kg)"
            ayuda="Opcional: se guarda también como su pesada al destete"
            inputMode="decimal"
            autoComplete="off"
            value={f.peso}
            onChange={(e) => cambiar('peso', e.target.value)}
            error={errores.pesoDestete}
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
