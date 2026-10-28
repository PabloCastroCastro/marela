import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import estilos from './Animales.module.css'
import {
  type AnimalDetalle,
  CLAVE_ANIMALES,
  identificacion,
  SEXOS,
  type Sexo,
  useAnimales,
  useRazas,
} from './datos'
import { type DatosParto, TIPOS_PARTO, type TipoParto } from './reproduccion'

const TERNEROS_MAXIMO = 4

// Valor del selector del padre para escribir un texto (toro de fuera, dosis)
const OTRO = 'otro'

type TerneroFormulario = {
  crotal: string
  sexo: Sexo | ''
  estado: 'vivo' | 'muerto'
  raza: string
  peso: string
}

// "38,5" → 38.5; null si no es un número
const leerKg = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

// Registrar el parto de una vaca (GH-23): crea la ficha de cada ternero, enlazada a la madre y al
// padre de la gestación en curso
export function FormularioParto({
  madre,
  alCerrar,
}: {
  madre: AnimalDetalle
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const razas = useRazas(explotacion.id)
  const idRazas = useId()
  // Sin gestación registrada, el padre se elige aquí
  const conGestacion = Boolean(madre.gestacion?.desde)
  const toros = useAnimales(explotacion.id, { sexo: 'macho', estado: 'activo' })

  const ultimoDia = madre.fechaBaja && madre.fechaBaja < hoy() ? madre.fechaBaja : hoy()
  const nuevo = (): TerneroFormulario => ({
    crotal: '',
    sexo: '',
    estado: 'vivo',
    raza: madre.raza,
    peso: '',
  })
  const [f, setF] = useState({
    fecha: ultimoDia,
    tipo: 'normal' as TipoParto,
    padre: '',
    padreTexto: '',
    observaciones: '',
  })
  const [terneros, setTerneros] = useState<TerneroFormulario[]>([nuevo()])
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))
  const cambiarTernero = <K extends keyof TerneroFormulario>(
    i: number,
    campo: K,
    valor: TerneroFormulario[K],
  ) => setTerneros((ts) => ts.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)))

  const guardar = useMutation({
    mutationFn: (cuerpo: DatosParto) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/animales/{animalId}/partos', {
          params: { path: { explotacionId: explotacion.id, animalId: madre.id } },
          body: cuerpo,
        }),
      ),
    onSuccess: async (parto) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] })
      const n = parto.terneros.length
      avisar({
        tipo: 'exito',
        mensaje: `Parto registrado: ${n === 1 ? '1 ternero' : `${n} terneros`}`,
      })
      alCerrar()
    },
  })

  const errores = { ...erroresPorCampo(guardar.error), ...erroresLocales }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    terneros.forEach((t, i) => {
      if (!t.sexo) locales[`terneros.${i}.sexo`] = 'Indica el sexo'
      if (t.peso.trim() && leerKg(t.peso) === null)
        locales[`terneros.${i}.peso`] = 'Indica el peso en kg, por ejemplo 38,5'
    })
    setErroresLocales(locales)
    if (Object.keys(locales).length > 0) return
    const otro = f.padre === OTRO
    guardar.mutate({
      fecha: f.fecha,
      tipo: f.tipo,
      padreId: !conGestacion && f.padre && !otro ? f.padre : null,
      padreTexto: !conGestacion && otro ? f.padreTexto : null,
      observaciones: f.observaciones,
      terneros: terneros.map((t) => ({
        crotal: t.crotal,
        sexo: t.sexo as Sexo,
        estado: t.estado,
        raza: t.raza,
        peso: t.peso.trim() ? leerKg(t.peso) : null,
      })),
    })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={`Registrar parto · ${identificacion(madre)}`}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-parto" cargando={guardar.isPending}>
            Guardar parto
          </Boton>
        </>
      }
    >
      <form id="formulario-parto" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <CampoFecha
          etiqueta="Fecha"
          value={f.fecha}
          min={madre.gestacion?.desde ?? madre.fechaNacimiento}
          max={ultimoDia}
          onChange={(e) => cambiar('fecha', e.target.value)}
          error={errores.fecha}
          required
        />
        <fieldset className={estilos.grupo}>
          <legend>Tipo</legend>
          <Chips
            etiqueta="Tipo de parto"
            opciones={(Object.keys(TIPOS_PARTO) as TipoParto[]).map((t) => ({
              valor: t,
              texto: TIPOS_PARTO[t],
            }))}
            seleccion={f.tipo}
            alCambiar={(t) => cambiar('tipo', t)}
          />
        </fieldset>

        {conGestacion && madre.gestacion?.desde ? (
          <p className={estilos.suave}>
            El padre es el de la cubrición o inseminación del {formatoFecha(madre.gestacion.desde)}.
          </p>
        ) : (
          <>
            <Selector
              etiqueta="Padre"
              value={f.padre}
              onChange={(e) => cambiar('padre', e.target.value)}
              error={f.padre === OTRO ? undefined : errores.padreId}
            >
              <option value="">Sin indicar</option>
              {(toros.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {identificacion(t)}
                </option>
              ))}
              <option value={OTRO}>Dosis o toro de fuera</option>
            </Selector>
            {f.padre === OTRO && (
              <Campo
                etiqueta="Padre (código de la dosis o nombre del toro)"
                value={f.padreTexto}
                onChange={(e) => cambiar('padreTexto', e.target.value)}
                error={errores.padreTexto}
              />
            )}
          </>
        )}

        {terneros.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: los terneros no tienen identificador hasta guardarlos
          <fieldset key={i} className={estilos.ternero}>
            <legend>{terneros.length > 1 ? `Ternero ${i + 1}` : 'Ternero'}</legend>
            {terneros.length > 1 && (
              <BotonIcono
                etiqueta={`Quitar el ternero ${i + 1}`}
                icono={<Trash2 aria-hidden size={18} />}
                className={estilos.quitarTernero}
                onClick={() => setTerneros((ts) => ts.filter((_, j) => j !== i))}
              />
            )}
            <div className={estilos.grupo}>
              <span className={estilos.etiquetaGrupo}>Sexo *</span>
              <Chips
                etiqueta={`Sexo del ternero ${i + 1}`}
                opciones={(Object.keys(SEXOS) as Sexo[]).map((s) => ({
                  valor: s,
                  texto: SEXOS[s],
                }))}
                seleccion={t.sexo}
                alCambiar={(s) => cambiarTernero(i, 'sexo', s)}
              />
              {errores[`terneros.${i}.sexo`] && (
                <p className={estilos.errorCampo} role="alert">
                  {errores[`terneros.${i}.sexo`]}
                </p>
              )}
            </div>
            <div className={estilos.grupo}>
              <span className={estilos.etiquetaGrupo}>Al nacer</span>
              <Chips
                etiqueta={`Estado al nacer del ternero ${i + 1}`}
                opciones={[
                  { valor: 'vivo', texto: 'Vivo' },
                  { valor: 'muerto', texto: 'Muerto' },
                ]}
                seleccion={t.estado}
                alCambiar={(e) => cambiarTernero(i, 'estado', e)}
              />
            </div>
            <Campo
              etiqueta="Crotal"
              ayuda="Si aún no lo tiene, déjalo vacío y ponlo en los 20 días siguientes"
              autoCapitalize="characters"
              spellCheck={false}
              value={t.crotal}
              onChange={(e) => cambiarTernero(i, 'crotal', e.target.value.toUpperCase())}
              error={errores[`terneros.${i}.crotal`]}
            />
            <div className={estilos.dosCampos}>
              <Campo
                etiqueta="Raza"
                list={idRazas}
                value={t.raza}
                onChange={(e) => cambiarTernero(i, 'raza', e.target.value)}
                error={errores[`terneros.${i}.raza`]}
                required
              />
              <Campo
                etiqueta="Peso al nacer (kg)"
                ayuda="Opcional"
                inputMode="decimal"
                autoComplete="off"
                value={t.peso}
                onChange={(e) => cambiarTernero(i, 'peso', e.target.value)}
                error={errores[`terneros.${i}.peso`]}
              />
            </div>
          </fieldset>
        ))}
        <datalist id={idRazas}>
          {(razas.data ?? []).map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        {terneros.length < TERNEROS_MAXIMO && (
          <div>
            <Boton
              variante="secundario"
              tamano="compacto"
              icono={<Plus aria-hidden size={18} />}
              onClick={() => setTerneros((ts) => [...ts, nuevo()])}
            >
              Añadir otro ternero
            </Boton>
          </div>
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
