import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, Selector } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas, numero } from '../formato'
import { CLAVE_FINCAS, type DatosFinca, type FincaDetalle, REGIMENES, type Regimen } from './datos'
import estilos from './Fincas.module.css'

type ParcelaFormulario = {
  id?: string
  provincia: string
  municipio: string
  poligono: string
  parcela: string
  recinto: string
  referenciaCatastral: string
  superficie: string
}

const SIGPAC = [
  ['provincia', 'Provincia'],
  ['municipio', 'Municipio'],
  ['poligono', 'Polígono'],
  ['parcela', 'Parcela'],
  ['recinto', 'Recinto'],
] as const

const parcelaNueva = (): ParcelaFormulario => ({
  provincia: '',
  municipio: '',
  poligono: '',
  parcela: '',
  recinto: '',
  referenciaCatastral: '',
  superficie: '',
})

// "1,2345" → 1.2345; null si no es un número
const leerHa = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

const desdeFinca = (f: FincaDetalle) => ({
  nombre: f.nombre,
  municipio: f.municipio ?? '',
  provincia: f.provincia ?? '',
  regimen: f.regimen,
  observaciones: f.observaciones ?? '',
})

// Alta o edición de una finca con sus parcelas (GH-25)
export function FormularioFinca({
  finca,
  alCerrar,
  alGuardar,
}: {
  finca?: FincaDetalle
  alCerrar: () => void
  alGuardar?: (f: FincaDetalle) => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [f, setF] = useState(
    finca
      ? desdeFinca(finca)
      : {
          nombre: '',
          municipio: explotacion.municipio ?? '',
          provincia: explotacion.provincia ?? '',
          regimen: 'propiedad' as Regimen,
          observaciones: '',
        },
  )
  const [parcelas, setParcelas] = useState<ParcelaFormulario[]>(
    finca
      ? finca.parcelas.map((p) => ({
          id: p.id,
          provincia: p.provincia ?? '',
          municipio: p.municipio ?? '',
          poligono: p.poligono ?? '',
          parcela: p.parcela ?? '',
          recinto: p.recinto ?? '',
          referenciaCatastral: p.referenciaCatastral ?? '',
          superficie: numero(p.superficie, 4).replace(/,?0+$/, ''),
        }))
      : [parcelaNueva()],
  )
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))
  const cambiarParcela = (i: number, campo: keyof ParcelaFormulario, valor: string) =>
    setParcelas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))

  const guardar = useMutation({
    mutationFn: (cuerpo: DatosFinca) =>
      datos(
        finca
          ? api.PUT('/api/explotaciones/{explotacionId}/fincas/{fincaId}', {
              params: { path: { explotacionId: explotacion.id, fincaId: finca.id } },
              body: cuerpo,
            })
          : api.POST('/api/explotaciones/{explotacionId}/fincas', {
              params: { path: { explotacionId: explotacion.id } },
              body: cuerpo,
            }),
      ),
    onSuccess: async (guardada) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje: finca
          ? `${guardada.nombre}: cambios guardados`
          : `Finca ${guardada.nombre} dada de alta`,
      })
      alGuardar?.(guardada)
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
  const total = parcelas.reduce((s, p) => s + (leerHa(p.superficie) ?? 0), 0)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    parcelas.forEach((p, i) => {
      if (leerHa(p.superficie) === null)
        locales[`parcelas.${i}.superficie`] = 'Indica la superficie en hectáreas, por ejemplo 1,25'
    })
    setErroresLocales(locales)
    if (Object.keys(locales).length > 0) return
    guardar.mutate({
      ...f,
      parcelas: parcelas.map((p) => ({
        ...(p.id ? { id: p.id } : {}),
        provincia: p.provincia,
        municipio: p.municipio,
        poligono: p.poligono,
        parcela: p.parcela,
        recinto: p.recinto,
        referenciaCatastral: p.referenciaCatastral,
        superficie: leerHa(p.superficie) ?? 0,
      })),
    })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={finca ? `Editar ${finca.nombre}` : 'Nueva finca'}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-finca" cargando={guardar.isPending}>
            {finca ? 'Guardar cambios' : 'Dar de alta'}
          </Boton>
        </>
      }
    >
      <form id="formulario-finca" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Campo
          etiqueta="Nombre"
          value={f.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          error={errores.nombre}
          required
          autoFocus={!finca}
        />
        <div className={estilos.dosCampos}>
          <Campo
            etiqueta="Municipio"
            value={f.municipio}
            onChange={(e) => cambiar('municipio', e.target.value)}
            error={errores.municipio}
          />
          <Campo
            etiqueta="Provincia"
            value={f.provincia}
            onChange={(e) => cambiar('provincia', e.target.value)}
            error={errores.provincia}
          />
        </div>
        <Selector
          etiqueta="Régimen"
          value={f.regimen}
          onChange={(e) => cambiar('regimen', e.target.value as Regimen)}
          error={errores.regimen}
        >
          {(Object.keys(REGIMENES) as Regimen[]).map((r) => (
            <option key={r} value={r}>
              {REGIMENES[r]}
            </option>
          ))}
        </Selector>

        {parcelas.map((p, i) => (
          <fieldset key={p.id ?? `nueva-${i}`} className={estilos.parcela}>
            <legend>{parcelas.length > 1 ? `Parcela ${i + 1}` : 'Parcela'}</legend>
            {parcelas.length > 1 && (
              <BotonIcono
                etiqueta={`Quitar la parcela ${i + 1}`}
                icono={<Trash2 aria-hidden size={18} />}
                className={estilos.quitarParcela}
                onClick={() => setParcelas((ps) => ps.filter((_, j) => j !== i))}
              />
            )}
            <div className={estilos.sigpac}>
              {SIGPAC.map(([campo, etiqueta]) => (
                <Campo
                  key={campo}
                  etiqueta={etiqueta}
                  inputMode="numeric"
                  autoComplete="off"
                  value={p[campo]}
                  onChange={(e) => cambiarParcela(i, campo, e.target.value)}
                  error={errores[`parcelas.${i}.${campo}`]}
                />
              ))}
            </div>
            <p className={estilos.suave}>
              Referencia SIGPAC. Si no la tiene, basta con la catastral.
            </p>
            <div className={estilos.dosCampos}>
              <Campo
                etiqueta="Referencia catastral"
                autoCapitalize="characters"
                spellCheck={false}
                value={p.referenciaCatastral}
                onChange={(e) =>
                  cambiarParcela(i, 'referenciaCatastral', e.target.value.toUpperCase())
                }
                error={errores[`parcelas.${i}.referenciaCatastral`]}
              />
              <Campo
                etiqueta="Superficie (ha)"
                inputMode="decimal"
                autoComplete="off"
                value={p.superficie}
                onChange={(e) => cambiarParcela(i, 'superficie', e.target.value)}
                error={errores[`parcelas.${i}.superficie`]}
                required
              />
            </div>
          </fieldset>
        ))}
        {errores.parcelas && (
          <p className={estilos.error} role="alert">
            {errores.parcelas}
          </p>
        )}
        <div className={estilos.titulo}>
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<Plus aria-hidden size={18} />}
            onClick={() => setParcelas((ps) => [...ps, parcelaNueva()])}
          >
            Añadir otra parcela
          </Boton>
          <span className={estilos.suave}>Superficie total: {hectareas(total)}</span>
        </div>

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
