import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useId, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useSesion } from '../auth/sesion'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hectareas, hoy, numero } from '../formato'
import {
  ABONOS_HABITUALES,
  TIPOS_ABONO,
  TIPOS_APLICACION,
  type TipoAbono,
  type TipoAplicacion,
  UNIDADES_DOSIS,
  type UnidadDosis,
  useOpcionesAplicacion,
} from './aplicaciones'
import { CLAVE_FINCAS } from './datos'
import estilos from './Fincas.module.css'

type FincaDeLaAplicacion = { id: string; nombre: string; superficie: number }

// Valor del selector de quién lo aplica para escribir un nombre
const OTRA_PERSONA = 'otra'

// "1,25" → 1.25; null si no es un número
const leerNumero = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

// Primer día en que se puede cosechar o pastar: la fecha más los días del plazo
const finSeguridad = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

// Unidad de la dosis con la que empieza cada tipo
const UNIDAD_INICIAL: Record<TipoAplicacion, UnidadDosis> = {
  abono: 'kg_ha',
  fitosanitario: 'l_ha',
}

// Registrar un abonado o un tratamiento fitosanitario en una o varias fincas (GH-27). No se
// corrige: uno registrado por error se anula desde la ficha y se registra de nuevo.
export function FormularioAplicacion({
  fincas,
  tipoInicial = 'abono',
  alCerrar,
  alGuardar,
}: {
  fincas: FincaDeLaAplicacion[]
  tipoInicial?: TipoAplicacion
  alCerrar: () => void
  alGuardar?: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const sesion = useSesion()
  const opciones = useOpcionesAplicacion(explotacion.id)
  const [idProductos, idPlagas, idEquipos] = [useId(), useId(), useId()]
  const yo = sesion.data?.usuario
  const [unica] = fincas
  const varias = fincas.length > 1

  const [f, setF] = useState({
    tipo: tipoInicial,
    fecha: hoy(),
    producto: '',
    tipoAbono: undefined as TipoAbono | undefined,
    dosis: '',
    unidadDosis: UNIDAD_INICIAL[tipoInicial],
    superficie: unica && !varias ? numero(unica.superficie, 4).replace(/,?0+$/, '') : '',
    plaga: '',
    diasSeguridad: '',
    aplicadoPor: yo?.id ?? '',
    aplicadoPorTexto: '',
    ropo: '',
    equipo: '',
    lote: '',
    observaciones: '',
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))
  const fito = f.tipo === 'fitosanitario'

  const guardar = useMutation({
    mutationFn: async () => {
      const otra = f.aplicadoPor === OTRA_PERSONA
      const creadas = await datos(
        api.POST('/api/explotaciones/{explotacionId}/aplicaciones', {
          params: { path: { explotacionId: explotacion.id } },
          body: {
            fincaIds: fincas.map((x) => x.id),
            tipo: f.tipo,
            fecha: f.fecha,
            producto: f.producto,
            tipoAbono: fito ? null : (f.tipoAbono ?? null),
            dosis: leerNumero(f.dosis) ?? 0,
            unidadDosis: f.unidadDosis,
            superficie: varias ? null : leerNumero(f.superficie),
            plaga: fito ? f.plaga : null,
            diasSeguridad: fito ? leerNumero(f.diasSeguridad) : null,
            aplicadoPorId: !otra && f.aplicadoPor ? f.aplicadoPor : null,
            aplicadoPorTexto: otra ? f.aplicadoPorTexto : null,
            ropo: fito ? f.ropo : null,
            equipo: fito ? f.equipo : null,
            lote: f.lote,
            observaciones: f.observaciones,
          },
        }),
      )
      const que = fito ? 'Tratamiento fitosanitario registrado' : 'Abonado registrado'
      return creadas.length === 1 ? que : `${que} en ${creadas.length} fincas`
    },
    onSuccess: async (mensaje) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })
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
  const personas = opciones.data?.personas ?? (yo ? [{ id: yo.id, nombre: yo.name }] : [])
  const productos = fito
    ? (opciones.data?.fitosanitarios ?? [])
    : [...new Set([...ABONOS_HABITUALES, ...(opciones.data?.abonos ?? [])])]
  const dias = leerNumero(f.diasSeguridad)

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    if (!f.producto.trim()) locales.producto = 'Indica el producto'
    if (!fito && !f.tipoAbono) locales.tipoAbono = 'Indica si es mineral u orgánico'
    if (!(leerNumero(f.dosis) && (leerNumero(f.dosis) ?? 0) > 0))
      locales.dosis = 'Indica la dosis por hectárea, por ejemplo 1,5'
    if (!varias && leerNumero(f.superficie) === null)
      locales.superficie = 'Indica la superficie en hectáreas, por ejemplo 1,25'
    if (fito && !f.plaga.trim()) locales.plaga = 'Indica la plaga o el motivo'
    if (fito && (dias === null || !Number.isInteger(dias)))
      locales.diasSeguridad = 'Indica el plazo de seguridad en días (0 si no tiene)'
    setErroresLocales(locales)
    if (Object.keys(locales).length === 0) guardar.mutate()
  }

  const titulo = varias
    ? `Registrar en ${fincas.length} fincas`
    : `Registrar · ${unica?.nombre ?? ''}`

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
          <Boton type="submit" form="formulario-aplicacion" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-aplicacion" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {varias && <p className={estilos.suave}>{fincas.map((x) => x.nombre).join(', ')}</p>}
        {errores.fincaIds && (
          <p className={estilos.error} role="alert">
            {errores.fincaIds}
          </p>
        )}
        <fieldset className={estilos.grupo}>
          <legend>Tipo</legend>
          <Chips
            etiqueta="Tipo"
            opciones={(Object.keys(TIPOS_APLICACION) as TipoAplicacion[]).map((t) => ({
              valor: t,
              texto: TIPOS_APLICACION[t],
            }))}
            seleccion={f.tipo}
            alCambiar={(t) => setF((v) => ({ ...v, tipo: t, unidadDosis: UNIDAD_INICIAL[t] }))}
          />
        </fieldset>
        <CampoFecha
          etiqueta="Fecha"
          value={f.fecha}
          max={hoy()}
          onChange={(e) => cambiar('fecha', e.target.value)}
          error={errores.fecha}
          required
        />
        <Campo
          etiqueta={fito ? 'Producto fitosanitario' : 'Abono'}
          ayuda={fito ? 'El nombre comercial o la materia activa' : 'Elige uno o escribe otro'}
          list={idProductos}
          autoComplete="off"
          value={f.producto}
          onChange={(e) => cambiar('producto', e.target.value)}
          error={errores.producto}
          required
        />
        <datalist id={idProductos}>
          {productos.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {!fito && (
          <fieldset className={estilos.grupo}>
            <legend>Tipo de abono</legend>
            <Chips
              etiqueta="Tipo de abono"
              opciones={(Object.keys(TIPOS_ABONO) as TipoAbono[]).map((t) => ({
                valor: t,
                texto: TIPOS_ABONO[t],
              }))}
              seleccion={f.tipoAbono}
              alCambiar={(t) => cambiar('tipoAbono', t)}
            />
            {errores.tipoAbono && (
              <p className={estilos.error} role="alert">
                {errores.tipoAbono}
              </p>
            )}
          </fieldset>
        )}
        {fito && (
          <>
            <Campo
              etiqueta="Plaga o motivo"
              ayuda="Por ejemplo: romaza, pulgón o malas hierbas"
              list={idPlagas}
              autoComplete="off"
              value={f.plaga}
              onChange={(e) => cambiar('plaga', e.target.value)}
              error={errores.plaga}
              required
            />
            <datalist id={idPlagas}>
              {(opciones.data?.plagas ?? []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </>
        )}
        <div className={estilos.dosCampos}>
          <Campo
            etiqueta="Dosis por hectárea"
            inputMode="decimal"
            autoComplete="off"
            value={f.dosis}
            onChange={(e) => cambiar('dosis', e.target.value)}
            error={errores.dosis}
            required
          />
          <Selector
            etiqueta="Unidad"
            value={f.unidadDosis}
            onChange={(e) => cambiar('unidadDosis', e.target.value as UnidadDosis)}
            error={errores.unidadDosis}
          >
            {(Object.keys(UNIDADES_DOSIS) as UnidadDosis[]).map((u) => (
              <option key={u} value={u}>
                {UNIDADES_DOSIS[u]}
              </option>
            ))}
          </Selector>
        </div>
        {!varias && (
          <Campo
            etiqueta="Superficie tratada (ha)"
            ayuda={unica ? `La finca tiene ${hectareas(unica.superficie)}` : undefined}
            inputMode="decimal"
            autoComplete="off"
            value={f.superficie}
            onChange={(e) => cambiar('superficie', e.target.value)}
            error={errores.superficie}
            required
          />
        )}
        {fito && (
          <Campo
            etiqueta="Plazo de seguridad (días)"
            inputMode="numeric"
            autoComplete="off"
            ayuda={
              dias
                ? `Sin cosechar ni pastar hasta el ${formatoFecha(finSeguridad(f.fecha, dias))}`
                : 'Los de la etiqueta; 0 si no tiene'
            }
            value={f.diasSeguridad}
            onChange={(e) => cambiar('diasSeguridad', e.target.value)}
            error={errores.diasSeguridad}
            required
          />
        )}
        <Selector
          etiqueta="Quién lo aplica"
          value={f.aplicadoPor}
          onChange={(e) => cambiar('aplicadoPor', e.target.value)}
          error={errores.aplicadoPorId}
        >
          <option value="">Sin indicar</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
          <option value={OTRA_PERSONA}>Otra persona (escribir el nombre)</option>
        </Selector>
        {f.aplicadoPor === OTRA_PERSONA && (
          <Campo
            etiqueta="Nombre de quien lo aplica"
            ayuda="Por ejemplo, la cooperativa o el contratista"
            value={f.aplicadoPorTexto}
            onChange={(e) => cambiar('aplicadoPorTexto', e.target.value)}
            error={errores.aplicadoPorTexto}
          />
        )}
        {fito && (
          <div className={estilos.dosCampos}>
            <Campo
              etiqueta="Número ROPO del aplicador"
              ayuda="Opcional"
              autoComplete="off"
              value={f.ropo}
              onChange={(e) => cambiar('ropo', e.target.value)}
              error={errores.ropo}
            />
            <Campo
              etiqueta="Equipo de aplicación"
              ayuda="Opcional"
              list={idEquipos}
              autoComplete="off"
              value={f.equipo}
              onChange={(e) => cambiar('equipo', e.target.value)}
              error={errores.equipo}
            />
            <datalist id={idEquipos}>
              {(opciones.data?.equipos ?? []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        )}
        <Campo
          etiqueta="Número de lote"
          ayuda="Opcional"
          autoComplete="off"
          value={f.lote}
          onChange={(e) => cambiar('lote', e.target.value)}
          error={errores.lote}
        />
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
