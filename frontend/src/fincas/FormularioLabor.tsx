import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import type { components } from '../api/esquema'
import { useSesion } from '../auth/sesion'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hectareas, hoy, numero } from '../formato'
import { nuevoId, type Pendiente, reemplazar } from '../sinConexion/cola'
import { AVISO_GUARDADO, useRegistrar } from '../sinConexion/useRegistrar'
import { CLAVE_FINCAS } from './datos'
import estilos from './Fincas.module.css'
import {
  CULTIVOS_HABITUALES,
  LABORES_HABITUALES,
  type Labor,
  TIPOS_LABOR,
  type TipoLabor,
  tituloLabor,
  UNIDADES,
  type UnidadCosecha,
  useOpcionesLabor,
} from './labores'

type FincaDeLaLabor = { id: string; nombre: string; superficie: number }

// Valor del selector de quién la realiza para escribir un nombre
const OTRA_PERSONA = 'otra'

// "1,25" → 1.25; null si no es un número
const leerNumero = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

const sinCeros = (n: number, decimales: number) => numero(n, decimales).replace(/,?0+$/, '')

// El formulario de una labor sin enviar, para corregirla (GH-32)
const desdeCuerpo = (c: CuerpoLabor) => ({
  tipo: c.tipo,
  fecha: c.fecha,
  cultivo: c.cultivo ?? '',
  labor: c.labor ?? '',
  superficie: c.superficie != null ? sinCeros(c.superficie, 4) : '',
  cantidad: c.cantidad != null ? sinCeros(c.cantidad, 2) : '',
  unidad: (c.unidad ?? 'kg') as UnidadCosecha,
  realizadaPor: c.realizadaPorId ?? (c.realizadaPorTexto ? OTRA_PERSONA : ''),
  realizadaPorTexto: c.realizadaPorTexto ?? '',
  observaciones: c.observaciones ?? '',
})

type CuerpoLabor = components['schemas']['DatosLabor']

// "Siega · 01/06/2026 · Agra de abaixo", para la lista de pendientes (GH-32)
const descripcion = (c: CuerpoLabor, fincas: FincaDeLaLabor[]) =>
  [
    c.tipo === 'otra' ? c.labor || TIPOS_LABOR.otra : `${TIPOS_LABOR[c.tipo]}: ${c.cultivo}`,
    formatoFecha(c.fecha),
    fincas.length === 1 ? fincas[0]?.nombre : `${fincas.length} fincas`,
  ].join(' · ')

// Registrar una siembra, una cosecha u otra labor en una o varias fincas, o corregir o borrar una
// (GH-26). Sin conexión, la nueva se guarda en el móvil y se envía sola al recuperarla; con
// `pendiente`, se corrige la que no se pudo enviar (GH-32).
export function FormularioLabor({
  fincas,
  labor,
  pendiente,
  tipoInicial = 'otra',
  alCerrar,
  alGuardar,
}: {
  fincas: FincaDeLaLabor[]
  // Para corregirla o borrarla
  labor?: Labor
  pendiente?: Pendiente
  tipoInicial?: TipoLabor
  alCerrar: () => void
  alGuardar?: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const sesion = useSesion()
  const opciones = useOpcionesLabor(explotacion.id)
  const idSugerencias = useId()
  const yo = sesion.data?.usuario
  const [unica] = fincas
  const varias = fincas.length > 1

  const registrar = useRegistrar()
  // Uno por finca, los mismos en cada intento: reenviarla no la duplica
  const previa = pendiente?.cuerpo as CuerpoLabor | undefined
  const [ids] = useState(() => previa?.ids ?? fincas.map(() => nuevoId()))
  const [f, setF] = useState(() =>
    previa
      ? desdeCuerpo(previa)
      : {
          tipo: labor?.tipo ?? tipoInicial,
          fecha: labor?.fecha ?? hoy(),
          cultivo: labor?.cultivo ?? '',
          labor: labor?.labor ?? '',
          superficie: labor
            ? sinCeros(labor.superficie, 4)
            : unica && !varias
              ? sinCeros(unica.superficie, 4)
              : '',
          cantidad: labor?.cantidad != null ? sinCeros(labor.cantidad, 2) : '',
          unidad: (labor?.unidad ?? 'kg') as UnidadCosecha,
          realizadaPor: labor
            ? labor.realizadaPor
              ? (labor.realizadaPor.id ?? OTRA_PERSONA)
              : ''
            : (yo?.id ?? ''),
          realizadaPorTexto:
            labor?.realizadaPor && !labor.realizadaPor.id ? labor.realizadaPor.nombre : '',
          observaciones: labor?.observaciones ?? '',
        },
  )
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const refrescar = () => cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })

  const cuerpo = () => {
    const otra = f.realizadaPor === OTRA_PERSONA
    return {
      tipo: f.tipo,
      fecha: f.fecha,
      cultivo: f.tipo === 'otra' ? null : f.cultivo,
      labor: f.tipo === 'otra' ? f.labor : null,
      superficie: varias ? null : leerNumero(f.superficie),
      cantidad: f.tipo === 'cosecha' ? leerNumero(f.cantidad) : null,
      unidad: f.tipo === 'cosecha' && f.cantidad.trim() ? f.unidad : null,
      realizadaPorId: !otra && f.realizadaPor ? f.realizadaPor : null,
      realizadaPorTexto: otra ? f.realizadaPorTexto : null,
      observaciones: f.observaciones,
    }
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (labor) {
        await datos(
          api.PUT('/api/explotaciones/{explotacionId}/labores/{laborId}', {
            params: { path: { explotacionId: explotacion.id, laborId: labor.id } },
            body: cuerpo(),
          }),
        )
        return 'Labor corregida'
      }
      const nueva: CuerpoLabor = { fincaIds: fincas.map((x) => x.id), ids, ...cuerpo() }
      if (pendiente) {
        reemplazar(pendiente.id, nueva, descripcion(nueva, fincas))
        return 'Labor corregida: se volverá a enviar'
      }
      const resultado = await registrar(
        {
          id: ids[0] ?? nuevoId(),
          tipo: 'labor',
          ruta: `/api/explotaciones/${explotacion.id}/labores`,
          cuerpo: nueva,
          descripcion: descripcion(nueva, fincas),
          contexto: {
            fincas: JSON.stringify(
              fincas.map(({ id, nombre, superficie }) => ({ id, nombre, superficie })),
            ),
          },
          claves: [[...CLAVE_FINCAS, explotacion.id]],
        },
        () =>
          datos(
            api.POST('/api/explotaciones/{explotacionId}/labores', {
              params: { path: { explotacionId: explotacion.id } },
              body: nueva,
            }),
          ),
      )
      if (!('enviado' in resultado)) return AVISO_GUARDADO
      const creadas = resultado.enviado
      const que = f.tipo === 'otra' ? f.labor || 'Labor' : TIPOS_LABOR[f.tipo]
      return creadas.length === 1
        ? `${que} registrada`
        : `${que} registrada en ${creadas.length} fincas`
    },
    onSuccess: async (mensaje) => {
      // En la cola, o corregido en ella: no ha cambiado nada en el servidor, y sin conexión
      // refrescar se quedaría esperando
      const enCola = mensaje === AVISO_GUARDADO || Boolean(pendiente)
      if (!enCola) await refrescar()
      avisar({ tipo: enCola ? 'info' : 'exito', mensaje })
      alGuardar?.()
      alCerrar()
    },
  })

  // Para deshacer un borrado se vuelve a registrar la misma labor en su finca
  const recuperar = useMutation({
    mutationFn: (l: Labor) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/labores', {
          params: { path: { explotacionId: explotacion.id } },
          body: {
            fincaIds: [l.fincaId],
            tipo: l.tipo,
            fecha: l.fecha,
            cultivo: l.cultivo,
            labor: l.labor,
            superficie: l.superficie,
            cantidad: l.cantidad,
            unidad: l.unidad,
            realizadaPorId: l.realizadaPor?.id ?? null,
            realizadaPorTexto: l.realizadaPor && !l.realizadaPor.id ? l.realizadaPor.nombre : null,
            observaciones: l.observaciones,
          },
        }),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: (l: Labor) =>
      datos(
        api.DELETE('/api/explotaciones/{explotacionId}/labores/{laborId}', {
          params: { path: { explotacionId: explotacion.id, laborId: l.id } },
        }),
      ),
    onSuccess: async (l) => {
      await refrescar()
      avisar({
        mensaje: `${tituloLabor(l)} del ${formatoFecha(l.fecha)} borrada`,
        accion: { texto: 'Deshacer', alPulsar: () => recuperar.mutate(l) },
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
  const personas = opciones.data?.personas ?? (yo ? [{ id: yo.id, nombre: yo.name }] : [])
  const sugerencias = [
    ...new Set([
      ...(f.tipo === 'otra' ? LABORES_HABITUALES : CULTIVOS_HABITUALES),
      ...((f.tipo === 'otra' ? opciones.data?.labores : opciones.data?.cultivos) ?? []),
    ]),
  ]

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    if (f.tipo === 'otra' && !f.labor.trim()) locales.labor = 'Indica la labor'
    if (f.tipo !== 'otra' && !f.cultivo.trim()) locales.cultivo = 'Indica el cultivo'
    if (!varias && leerNumero(f.superficie) === null)
      locales.superficie = 'Indica la superficie en hectáreas, por ejemplo 1,25'
    if (f.tipo === 'cosecha' && f.cantidad.trim() && leerNumero(f.cantidad) === null)
      locales.cantidad = 'Indica la cantidad, por ejemplo 42'
    setErroresLocales(locales)
    if (Object.keys(locales).length === 0) guardar.mutate()
  }

  const titulo = labor
    ? `Corregir · ${tituloLabor(labor)}`
    : varias
      ? `Registrar en ${fincas.length} fincas`
      : `Registrar · ${unica?.nombre ?? ''}`

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={titulo}
      pie={
        <>
          {labor && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Trash2 aria-hidden size={18} />}
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(labor)}
            >
              Borrar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-labor" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-labor" className={estilos.formulario} onSubmit={enviar} noValidate>
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
            opciones={(Object.keys(TIPOS_LABOR) as TipoLabor[]).map((t) => ({
              valor: t,
              texto: TIPOS_LABOR[t],
            }))}
            seleccion={f.tipo}
            alCambiar={(t) => cambiar('tipo', t)}
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
        {f.tipo === 'otra' ? (
          <Campo
            etiqueta="Labor"
            ayuda="Elige una o escribe otra"
            list={idSugerencias}
            autoComplete="off"
            value={f.labor}
            onChange={(e) => cambiar('labor', e.target.value)}
            error={errores.labor}
            required
          />
        ) : (
          <Campo
            etiqueta="Cultivo"
            ayuda="Elige uno o escribe otro"
            list={idSugerencias}
            autoComplete="off"
            value={f.cultivo}
            onChange={(e) => cambiar('cultivo', e.target.value)}
            error={errores.cultivo}
            required
          />
        )}
        <datalist id={idSugerencias}>
          {sugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {!varias && (
          <Campo
            etiqueta="Superficie (ha)"
            ayuda={unica ? `La finca tiene ${hectareas(unica.superficie)}` : undefined}
            inputMode="decimal"
            autoComplete="off"
            value={f.superficie}
            onChange={(e) => cambiar('superficie', e.target.value)}
            error={errores.superficie}
            required
          />
        )}
        {f.tipo === 'cosecha' && (
          <div className={estilos.dosCampos}>
            <Campo
              etiqueta="Cantidad cosechada"
              ayuda="Opcional"
              inputMode="decimal"
              autoComplete="off"
              value={f.cantidad}
              onChange={(e) => cambiar('cantidad', e.target.value)}
              error={errores.cantidad}
            />
            <Selector
              etiqueta="Unidad"
              value={f.unidad}
              onChange={(e) => cambiar('unidad', e.target.value as UnidadCosecha)}
              error={errores.unidad}
            >
              {(Object.keys(UNIDADES) as UnidadCosecha[]).map((u) => (
                <option key={u} value={u}>
                  {UNIDADES[u]}
                </option>
              ))}
            </Selector>
          </div>
        )}
        <Selector
          etiqueta="Quién la realiza"
          value={f.realizadaPor}
          onChange={(e) => cambiar('realizadaPor', e.target.value)}
          error={errores.realizadaPorId}
        >
          <option value="">Sin indicar</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
          <option value={OTRA_PERSONA}>Otra persona (escribir el nombre)</option>
        </Selector>
        {f.realizadaPor === OTRA_PERSONA && (
          <Campo
            etiqueta="Nombre de quien la realiza"
            ayuda="Por ejemplo, el contratista"
            value={f.realizadaPorTexto}
            onChange={(e) => cambiar('realizadaPorTexto', e.target.value)}
            error={errores.realizadaPorTexto}
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
