import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { useFincas } from '../fincas/datos'
import { fecha as formatoFecha, hoy } from '../formato'
import estilos from './Comida.module.css'
import {
  type Almacen,
  CLAVE_COMIDA,
  type DatosMovimiento,
  cantidad as formatoCantidad,
  leerCantidad,
  type Movimiento,
  ORIGENES_ENTRADA,
  type OrigenEntrada,
  TIPOS_AJUSTE,
  type TipoAjuste,
  type TipoMovimiento,
} from './datos'

const TITULOS: Record<TipoMovimiento, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste: 'Ajuste',
}

const EXITO: Record<TipoMovimiento, string> = {
  entrada: 'Entrada registrada',
  salida: 'Salida registrada',
  ajuste: 'Ajuste registrado',
}

const BORRADO: Record<TipoMovimiento, string> = {
  entrada: 'Entrada borrada',
  salida: 'Salida borrada',
  ajuste: 'Ajuste borrado',
}

const aTexto = (n: number) => String(n).replace('.', ',')

// Registrar una entrada, una salida (ración) o un ajuste de inventario en un almacén, o corregir o
// borrar un movimiento (GH-30). Si el stock va a quedar en negativo, lo avisa, pero deja guardar.
export function FormularioMovimiento({
  almacen,
  tipo,
  movimiento,
  alCerrar,
}: {
  almacen: Almacen
  tipo: TipoMovimiento
  // Para corregirlo o borrarlo
  movimiento?: Movimiento
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const fincas = useFincas(explotacion.id, { activa: 'true' })
  const [f, setF] = useState({
    fecha: movimiento?.fecha ?? hoy(),
    cantidad: movimiento ? aTexto(movimiento.cantidad) : '',
    origen: movimiento?.origen ?? undefined,
    fincaId: movimiento?.finca?.id ?? '',
    ajuste: movimiento?.ajuste ?? undefined,
    motivo: movimiento?.motivo ?? '',
    observaciones: movimiento?.observaciones ?? '',
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const ruta = { explotacionId: explotacion.id, almacenId: almacen.id }
  const refrescar = () => cliente.invalidateQueries({ queryKey: [...CLAVE_COMIDA, explotacion.id] })

  // Tras guardar o borrar, el stock como queda, para avisar si es negativo
  const stockActual = async () =>
    (
      await datos(
        api.GET('/api/explotaciones/{explotacionId}/almacenes/{almacenId}', {
          params: { path: ruta },
        }),
      )
    ).stock

  const avisarStock = (mensaje: string, stock: number) =>
    stock < 0
      ? avisar({
          tipo: 'aviso',
          mensaje: `${mensaje}. El stock queda en ${formatoCantidad(stock, almacen.unidad)}`,
        })
      : avisar({ tipo: 'exito', mensaje })

  const cuerpo = (): DatosMovimiento => ({
    tipo,
    fecha: f.fecha,
    cantidad: leerCantidad(f.cantidad),
    origen: tipo === 'entrada' ? f.origen : null,
    fincaId: tipo === 'entrada' && f.origen === 'produccion_propia' && f.fincaId ? f.fincaId : null,
    ajuste: tipo === 'ajuste' ? f.ajuste : null,
    motivo: tipo === 'ajuste' ? f.motivo : null,
    observaciones: f.observaciones,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (movimiento)
        await datos(
          api.PUT(
            '/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos/{movimientoId}',
            { params: { path: { ...ruta, movimientoId: movimiento.id } }, body: cuerpo() },
          ),
        )
      else
        await datos(
          api.POST('/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos', {
            params: { path: ruta },
            body: cuerpo(),
          }),
        )
      return stockActual()
    },
    onSuccess: async (stock) => {
      await refrescar()
      avisarStock(movimiento ? 'Movimiento corregido' : EXITO[tipo], stock)
      alCerrar()
    },
  })

  // Para deshacer un borrado se vuelve a registrar el mismo movimiento
  const recuperar = useMutation({
    mutationFn: (m: Movimiento) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos', {
          params: { path: ruta },
          body: {
            tipo: m.tipo,
            fecha: m.fecha,
            cantidad: m.cantidad,
            origen: m.origen,
            fincaId: m.finca?.id ?? null,
            ajuste: m.ajuste,
            motivo: m.motivo,
            observaciones: m.observaciones,
          },
        }),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: async (m: Movimiento) => {
      await datos(
        api.DELETE(
          '/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos/{movimientoId}',
          { params: { path: { ...ruta, movimientoId: m.id } } },
        ),
      )
      return m
    },
    onSuccess: async (m) => {
      await refrescar()
      avisar({
        mensaje: `${BORRADO[m.tipo]} (${formatoFecha(m.fecha)})`,
        accion: { texto: 'Deshacer', alPulsar: () => recuperar.mutate(m) },
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

  // Lo que dejaría el stock un movimiento nuevo con la fecha de hoy: si es negativo, se avisa antes
  // de guardar
  const n = leerCantidad(f.cantidad)
  const previsto =
    movimiento || !f.cantidad.trim() || Number.isNaN(n)
      ? null
      : tipo === 'salida' || f.ajuste === 'merma'
        ? almacen.stock - n
        : f.ajuste === 'recuento'
          ? n
          : null

  const recuento = tipo === 'ajuste' && f.ajuste === 'recuento'
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    if (!f.cantidad.trim() || Number.isNaN(n) || n < 0 || (n === 0 && !recuento))
      locales.cantidad = recuento
        ? 'Indica la cantidad contada, por ejemplo 80'
        : 'Indica la cantidad, por ejemplo 120'
    if (tipo === 'entrada' && !f.origen) locales.origen = 'Indica si es compra o producción propia'
    if (tipo === 'ajuste' && !f.ajuste) locales.ajuste = 'Indica si es un recuento o una merma'
    if (tipo === 'ajuste' && !f.motivo.trim()) locales.motivo = 'Indica el motivo del ajuste'
    setErroresLocales(locales)
    if (Object.keys(locales).length === 0) guardar.mutate()
  }

  const unidad = almacen.unidad === 'kg' ? 'kg' : 'unidades'
  const etiquetaCantidad = recuento
    ? `Cantidad contada (${unidad})`
    : f.ajuste === 'merma'
      ? `Cantidad perdida (${unidad})`
      : `Cantidad (${unidad})`

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={`${movimiento ? 'Corregir · ' : ''}${TITULOS[tipo]} · ${almacen.nombre}`}
      pie={
        <>
          {movimiento && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Trash2 aria-hidden size={18} />}
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(movimiento)}
            >
              Borrar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-movimiento" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-movimiento" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {tipo === 'ajuste' && (
          <fieldset className={estilos.grupo}>
            <legend>Tipo de ajuste</legend>
            <Chips
              etiqueta="Tipo de ajuste"
              opciones={(Object.keys(TIPOS_AJUSTE) as TipoAjuste[]).map((a) => ({
                valor: a,
                texto: TIPOS_AJUSTE[a],
              }))}
              seleccion={f.ajuste}
              alCambiar={(a) => cambiar('ajuste', a)}
            />
            <p className={estilos.suave}>
              {f.ajuste === 'merma'
                ? 'Lo que se ha perdido o estropeado: se resta del stock.'
                : 'Lo que hay de verdad en el almacén: el stock pasa a ser esa cantidad.'}
            </p>
            {errores.ajuste && (
              <p className={estilos.error} role="alert">
                {errores.ajuste}
              </p>
            )}
          </fieldset>
        )}
        <CampoFecha
          etiqueta="Fecha"
          value={f.fecha}
          max={hoy()}
          onChange={(e) => cambiar('fecha', e.target.value)}
          error={errores.fecha}
          required
        />
        <Campo
          etiqueta={etiquetaCantidad}
          inputMode="decimal"
          autoComplete="off"
          value={f.cantidad}
          onChange={(e) => cambiar('cantidad', e.target.value)}
          error={errores.cantidad}
          required
        />
        {previsto !== null && previsto < 0 && (
          <p className={estilos.aviso} role="status">
            <TriangleAlert aria-hidden size={18} />
            El stock quedará en {formatoCantidad(previsto, almacen.unidad)}. Se guarda igualmente:
            revisa si falta apuntar alguna entrada.
          </p>
        )}
        {tipo === 'entrada' && (
          <fieldset className={estilos.grupo}>
            <legend>Origen</legend>
            <Chips
              etiqueta="Origen"
              opciones={(Object.keys(ORIGENES_ENTRADA) as OrigenEntrada[]).map((o) => ({
                valor: o,
                texto: ORIGENES_ENTRADA[o],
              }))}
              seleccion={f.origen}
              alCambiar={(o) => cambiar('origen', o)}
            />
            {errores.origen && (
              <p className={estilos.error} role="alert">
                {errores.origen}
              </p>
            )}
          </fieldset>
        )}
        {tipo === 'entrada' && f.origen === 'produccion_propia' && (
          <Selector
            etiqueta="Finca de origen"
            ayuda="Si viene de varias fincas, déjala sin elegir"
            value={f.fincaId}
            onChange={(e) => cambiar('fincaId', e.target.value)}
            error={errores.fincaId}
          >
            <option value="">Sin indicar</option>
            {/* La del movimiento, aunque ya no esté activa */}
            {movimiento?.finca && !fincas.data?.some((x) => x.id === movimiento.finca?.id) && (
              <option value={movimiento.finca.id}>{movimiento.finca.nombre}</option>
            )}
            {fincas.data?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </Selector>
        )}
        {tipo === 'ajuste' && (
          <Campo
            etiqueta="Motivo"
            ayuda="Por ejemplo: recuento de fin de mes, pacas mojadas"
            value={f.motivo}
            onChange={(e) => cambiar('motivo', e.target.value)}
            error={errores.motivo}
            required
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
