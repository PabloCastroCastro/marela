import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import type { components } from '../api/esquema'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import { nuevoId, type Pendiente, reemplazar } from '../sinConexion/cola'
import { AVISO_GUARDADO, useRegistrar } from '../sinConexion/useRegistrar'
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

type CuerpoParto = components['schemas']['DatosParto']

// "Parto · 2 terneros · 01/09/2026 · ES36 0001", para la lista de pendientes (GH-33)
const descripcionParto = (c: CuerpoParto, madre: AnimalDelEvento) =>
  [
    'Parto',
    c.terneros.length === 1 ? '1 ternero' : `${c.terneros.length} terneros`,
    formatoFecha(c.fecha),
    identificacion(madre),
  ].join(' · ')

// Los terneros de un parto sin enviar, como los pide el formulario, para corregirlo (GH-33)
const ternerosDe = (c: CuerpoParto): TerneroFormulario[] =>
  c.terneros.map((t) => ({
    crotal: t.crotal ?? '',
    sexo: t.sexo,
    estado: t.estado ?? 'vivo',
    raza: t.raza,
    peso: t.peso != null ? String(t.peso).replace('.', ',') : '',
  }))

// Registrar un evento reproductivo (GH-22) a uno o varios animales, uno por animal, o el parto de
// una vaca (GH-23), que crea las fichas de sus terneros. Sin conexión, el parto se guarda en el móvil
// y se envía solo al recuperarla, con los ids de sus terneros; con `pendiente`, se corrige el que no
// se pudo enviar, por ejemplo por un crotal repetido (GH-33).
export function FormularioEvento({
  animales,
  tipos,
  tipoInicial,
  pendiente,
  alCerrar,
  alGuardar,
}: {
  animales: AnimalDelEvento[]
  // Lo que se puede elegir. El parto, solo con una vaca.
  tipos: TipoRegistro[]
  // Lo elegido al abrir; si no se indica, lo primero de tipos
  tipoInicial?: TipoRegistro
  // Un parto sin enviar, para corregirlo
  pendiente?: Pendiente
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
  const registrar = useRegistrar()
  const previo = pendiente?.cuerpo as CuerpoParto | undefined
  // El del parto y los de sus terneros, los mismos en cada intento: reenviarlo no los duplica
  const [idParto] = useState(() => previo?.id ?? nuevoId())
  const idsTerneros = useRef<string[]>(previo?.terneros.map((t) => t.id ?? nuevoId()) ?? [])
  const [f, setF] = useState({
    tipo: tipoInicial ?? tipos[0] ?? ('cubricion' as TipoRegistro),
    fecha: previo?.fecha ?? ultimoDia,
    // Un toro, OTRO o '' (sin elegir)
    padre: previo ? (previo.padreId ?? (previo.padreTexto ? OTRO : '')) : '',
    padreTexto: previo?.padreTexto ?? '',
    metodo: '' as MetodoDiagnostico | '',
    resultado: '' as ResultadoDiagnostico | '',
    peso: '',
    tipoParto: (previo?.tipo ?? 'normal') as TipoParto,
    observaciones: previo?.observaciones ?? '',
  })
  const [terneros, setTerneros] = useState<TerneroFormulario[]>(() =>
    previo ? ternerosDe(previo) : [terneroNuevo(unico?.raza ?? '')],
  )
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
      if (parto && unico) {
        const nuevo: CuerpoParto = {
          id: idParto,
          fecha: f.fecha,
          tipo: f.tipoParto,
          padreId,
          padreTexto,
          observaciones: f.observaciones,
          terneros: datosTerneros(terneros).map((t, i) => {
            idsTerneros.current[i] ??= nuevoId()
            return { ...t, id: idsTerneros.current[i] }
          }),
        }
        if (pendiente) {
          reemplazar(pendiente.id, nuevo, descripcionParto(nuevo, unico))
          return 'Parto corregido: se volverá a enviar'
        }
        const resultado = await registrar(
          {
            id: idParto,
            tipo: 'parto',
            ruta: `/api/explotaciones/${explotacion.id}/animales/${unico.id}/partos`,
            cuerpo: nuevo,
            descripcion: descripcionParto(nuevo, unico),
            contexto: {
              madreId: unico.id,
              madre: JSON.stringify({
                id: unico.id,
                crotal: unico.crotal,
                nombre: unico.nombre ?? null,
                raza: unico.raza ?? '',
                fechaNacimiento: unico.fechaNacimiento,
                fechaBaja: unico.fechaBaja ?? null,
                gestacion: unico.gestacion ?? null,
              }),
            },
            claves: [[...CLAVE_ANIMALES, explotacion.id]],
          },
          () =>
            datos(
              api.POST('/api/explotaciones/{explotacionId}/animales/{animalId}/partos', {
                params: { path: { explotacionId: explotacion.id, animalId: unico.id } },
                body: nuevo,
              }),
            ),
        )
        if (!('enviado' in resultado)) return AVISO_GUARDADO
        const n = resultado.enviado.terneros.length
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
      // En la cola, o corregido en ella: no ha cambiado nada en el servidor, y sin conexión
      // refrescar se quedaría esperando
      const enCola = mensaje === AVISO_GUARDADO || Boolean(pendiente)
      if (!enCola)
        await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      avisar({ tipo: enCola ? 'info' : 'exito', mensaje })
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
