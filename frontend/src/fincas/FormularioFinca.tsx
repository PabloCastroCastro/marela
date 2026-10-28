import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Map as IconoMapa, Plus, Search, Trash2 } from 'lucide-react'
import { type FormEvent, lazy, Suspense, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, Selector } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hectareas, numero } from '../formato'
import {
  type Contorno,
  consultarCatastro,
  consultarRecinto,
  type RecintoSigpac,
  usoSigpac,
} from './cartografia'
import { CLAVE_FINCAS, type DatosFinca, type FincaDetalle, REGIMENES, type Regimen } from './datos'
import estilos from './Fincas.module.css'

// Leaflet pesa: el mapa se descarga solo al abrirlo (GH-52)
const MapaParcelas = lazy(() => import('./MapaParcelas'))

type ParcelaFormulario = {
  id?: string
  provincia: string
  municipio: string
  agregado: string
  zona: string
  poligono: string
  parcela: string
  recinto: string
  referenciaCatastral: string
  superficie: string
  // Del mapa o de la consulta por referencia (GH-52)
  uso: string | null
  contorno: Contorno | null
}

const SIGPAC = [
  ['provincia', 'Provincia'],
  ['municipio', 'Municipio'],
  ['agregado', 'Agregado'],
  ['zona', 'Zona'],
  ['poligono', 'Polígono'],
  ['parcela', 'Parcela'],
  ['recinto', 'Recinto'],
] as const

const parcelaNueva = (): ParcelaFormulario => ({
  provincia: '',
  municipio: '',
  agregado: '',
  zona: '',
  poligono: '',
  parcela: '',
  recinto: '',
  referenciaCatastral: '',
  superficie: '',
  uso: null,
  contorno: null,
})

const sinCeros = (n: number) => numero(n, 4).replace(/,?0+$/, '')

// Una parcela sin nada escrito, como la que se ofrece al dar de alta una finca
const vacia = (p: ParcelaFormulario) =>
  !p.id &&
  [...SIGPAC.map(([c]) => p[c]), p.referenciaCatastral, p.superficie].every((v) => !v.trim())

const desdeRecinto = (r: RecintoSigpac): ParcelaFormulario => ({
  provincia: r.provincia,
  municipio: r.municipio,
  agregado: r.agregado,
  zona: r.zona,
  poligono: r.poligono,
  parcela: r.parcela,
  recinto: r.recinto,
  referenciaCatastral: r.referenciaCatastral ?? '',
  superficie: sinCeros(r.superficie),
  uso: r.uso,
  contorno: r.contorno,
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
  abrirMapa = false,
  alCerrar,
  alGuardar,
}: {
  finca?: FincaDetalle
  // Con el mapa ya abierto, para completar las parcelas escritas a mano (GH-91)
  abrirMapa?: boolean
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
          agregado: p.agregado ?? '',
          zona: p.zona ?? '',
          poligono: p.poligono ?? '',
          parcela: p.parcela ?? '',
          recinto: p.recinto ?? '',
          referenciaCatastral: p.referenciaCatastral ?? '',
          superficie: sinCeros(p.superficie),
          uso: p.uso,
          contorno: p.contorno,
        }))
      : [parcelaNueva()],
  )
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))
  // Al cambiar la referencia, el uso y el contorno consultados dejan de valer
  const cambiarParcela = (i: number, campo: keyof ParcelaFormulario, valor: string) =>
    setParcelas((ps) =>
      ps.map((p, j) =>
        j !== i
          ? p
          : campo === 'superficie'
            ? { ...p, superficie: valor }
            : { ...p, [campo]: valor, uso: null, contorno: null },
      ),
    )
  const [enMapa, setEnMapa] = useState(abrirMapa)
  const [consultando, setConsultando] = useState<number>()

  // El municipio y la provincia de la finca, de lo consultado, si aún no los tiene
  const completarLugar = (municipio: string | null, provincia: string | null) =>
    setF((v) => ({
      ...v,
      municipio: v.municipio.trim() ? v.municipio : (municipio ?? v.municipio),
      provincia: v.provincia.trim() ? v.provincia : (provincia ?? v.provincia),
    }))

  const anadirRecintos = (recintos: RecintoSigpac[]) => {
    setParcelas((ps) => [...ps.filter((p) => !vacia(p)), ...recintos.map(desdeRecinto)])
    const [primero] = recintos
    if (primero) completarLugar(primero.nombreMunicipio, primero.nombreProvincia)
  }

  // Con la referencia SIGPAC completa se consulta el SIGPAC; si no, con la catastral, el Catastro
  const consultar = async (i: number) => {
    const p = parcelas[i]
    if (!p) return
    const sigpac = SIGPAC.map(([c]) => p[c].trim() || (c === 'agregado' || c === 'zona' ? '0' : ''))
    setConsultando(i)
    try {
      if (sigpac.every(Boolean)) {
        const r = await consultarRecinto(explotacion.id, { referencia: sigpac.join(':') })
        setParcelas((ps) =>
          ps.map((x, j) =>
            j === i
              ? {
                  ...desdeRecinto(r),
                  id: x.id,
                  referenciaCatastral: x.referenciaCatastral || (r.referenciaCatastral ?? ''),
                }
              : x,
          ),
        )
        completarLugar(r.nombreMunicipio, r.nombreProvincia)
      } else {
        const c = await consultarCatastro(explotacion.id, p.referenciaCatastral)
        setParcelas((ps) =>
          ps.map((x, j) =>
            j === i
              ? {
                  ...x,
                  referenciaCatastral: c.referenciaCatastral,
                  superficie: c.superficie ? sinCeros(c.superficie) : x.superficie,
                  contorno: c.contorno,
                }
              : x,
          ),
        )
        completarLugar(c.nombreMunicipio, c.nombreProvincia)
      }
    } catch (error) {
      avisar({ tipo: 'error', mensaje: (error as Error).message })
    } finally {
      setConsultando(undefined)
    }
  }

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
        agregado: p.agregado,
        zona: p.zona,
        poligono: p.poligono,
        parcela: p.parcela,
        recinto: p.recinto,
        referenciaCatastral: p.referenciaCatastral,
        superficie: leerHa(p.superficie) ?? 0,
        uso: p.uso,
        contorno: p.contorno ?? undefined,
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

        <div className={estilos.parcelaDatos}>
          <span className={estilos.suave}>
            Elige los recintos en el mapa o escribe su referencia.
          </span>
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<IconoMapa aria-hidden size={18} />}
            onClick={() => setEnMapa(true)}
          >
            Elegir en el mapa
          </Boton>
        </div>
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
                  placeholder={campo === 'agregado' || campo === 'zona' ? '0' : undefined}
                  value={p[campo]}
                  onChange={(e) => cambiarParcela(i, campo, e.target.value)}
                  error={errores[`parcelas.${i}.${campo}`]}
                />
              ))}
            </div>
            <div className={estilos.parcelaDatos}>
              <span className={estilos.suave}>
                {p.contorno
                  ? ['En el mapa', usoSigpac(p.uso)].filter(Boolean).join(' · ')
                  : 'Referencia SIGPAC. Si no la tiene, basta con la catastral.'}
              </span>
              <Boton
                variante="texto"
                tamano="compacto"
                icono={<Search aria-hidden size={18} />}
                cargando={consultando === i}
                disabled={
                  !(['provincia', 'municipio', 'poligono', 'parcela', 'recinto'] as const).every(
                    (c) => p[c].trim(),
                  ) && p.referenciaCatastral.replace(/\s/g, '').length < 14
                }
                aria-label={`Consultar la superficie de la parcela ${i + 1}`}
                onClick={() => consultar(i)}
              >
                Consultar
              </Boton>
            </div>
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

        {enMapa && (
          <Suspense fallback={null}>
            <MapaParcelas
              contornos={parcelas.flatMap((p) => (p.contorno ? [p.contorno] : []))}
              alCerrar={() => setEnMapa(false)}
              alAnadir={anadirRecintos}
            />
          </Suspense>
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
