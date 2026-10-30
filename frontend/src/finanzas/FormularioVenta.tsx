import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { CLAVE_ANIMALES, identificacion } from '../animales/datos'
import { api, datos, ErrorApi, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, hoy, kilos, numero } from '../formato'
import { type AnimalElegido, BuscarAnimal } from './BuscarAnimal'
import {
  CLAVE_FINANZAS,
  calcularImportes,
  type DatosVenta,
  leerImporte,
  MODOS_PRECIO,
  type ModoPrecio,
  useFacturas,
  type Venta,
} from './datos'
import estilos from './Finanzas.module.css'

type Vendido = { animal: AnimalElegido; kg: string }

const texto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

const ETIQUETA_PRECIO: Record<ModoPrecio, string> = {
  total: 'Precio total (€)',
  por_animal: 'Precio por animal (€)',
  por_kg: 'Precio por kg (€/kg)',
}

// Registrar una venta de animales (GH-38), o corregirla. El precio se escribe como total, por animal o
// por kg, y el resto se calcula al momento; por kg, hay que pesar todos. Sin IVA ni compensación, que
// van en la factura. Al guardar, los animales pasan a vendidos; si alguno tiene la supresión en curso,
// no se guarda (sin excepciones) y se dice cuál y hasta cuándo.
export function FormularioVenta({
  venta,
  animalesIniciales = [],
  alCerrar,
  alGuardar,
}: {
  // Para corregirla
  venta?: Venta
  // Los elegidos en la lista de animales
  animalesIniciales?: AnimalElegido[]
  alCerrar: () => void
  alGuardar?: (v: Venta) => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [f, setF] = useState({
    fecha: venta?.fecha ?? hoy(),
    comprador: venta?.comprador ?? '',
    modo: (venta?.modoPrecio ?? 'total') as ModoPrecio,
    precio: texto(venta?.precio),
    facturaId: venta?.factura?.id ?? '',
    observaciones: venta?.observaciones ?? '',
  })
  const [vendidos, setVendidos] = useState<Vendido[]>(
    venta?.animales.map((a) => ({ animal: a, kg: texto(a.kg) })) ??
      animalesIniciales.map((animal) => ({ animal, kg: '' })),
  )
  const [propios, setPropios] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))
  // Las emitidas sin venta, y la de esta
  const emitidas = useFacturas(explotacion.id, { tipo: 'emitida' }).data?.filter(
    (fa) => !fa.ventaId || fa.ventaId === venta?.id,
  )

  const kgs = vendidos.map((v) => {
    const kg = leerImporte(v.kg)
    return Number.isFinite(kg) && kg > 0 ? kg : null
  })
  const precio = leerImporte(f.precio)
  const { importes, total } = calcularImportes(f.modo, precio, kgs)
  const pesados = kgs.every((kg) => kg !== null) && kgs.length > 0
  const kgTotal = kgs.reduce<number>((s, kg) => s + (kg ?? 0), 0)

  const guardar = useMutation({
    mutationFn: (cuerpo: DatosVenta) =>
      datos(
        venta
          ? api.PUT('/api/explotaciones/{explotacionId}/ventas/{ventaId}', {
              params: { path: { explotacionId: explotacion.id, ventaId: venta.id } },
              body: cuerpo,
            })
          : api.POST('/api/explotaciones/{explotacionId}/ventas', {
              params: { path: { explotacionId: explotacion.id } },
              body: cuerpo,
            }),
      ),
    onSuccess: async (v) => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] }),
        // Los animales pasan a vendidos
        cliente.invalidateQueries({ queryKey: [...CLAVE_ANIMALES, explotacion.id] }),
      ])
      avisar({
        tipo: 'exito',
        mensaje: venta
          ? 'Venta corregida'
          : `Venta registrada: ${v.animales.length === 1 ? '1 animal' : `${v.animales.length} animales`}, ${euros(v.total)}`,
      })
      alGuardar?.(v)
      alCerrar()
    },
  })

  const errores = { ...erroresPorCampo(guardar.error), ...propios }
  // La supresión en curso se dice arriba, con todos los animales, y en cada uno
  const errorGeneral =
    guardar.error &&
    (Object.keys(erroresPorCampo(guardar.error)).length === 0 ||
      (guardar.error instanceof ErrorApi && guardar.error.codigo === 'supresion_en_curso'))
      ? guardar.error.message
      : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const nuevos: Record<string, string> = {}
    if (!f.comprador.trim()) nuevos.comprador = 'Indica el comprador'
    if (vendidos.length === 0) nuevos.animales = 'Elige al menos un animal'
    if (!Number.isFinite(precio) || precio <= 0) nuevos.precio = 'Indica el precio, mayor que 0'
    vendidos.forEach((v, i) => {
      if (v.kg.trim() && kgs[i] === null) nuevos[`animales.${i}.kg`] = 'Peso no válido'
      else if (f.modo === 'por_kg' && kgs[i] === null)
        nuevos[`animales.${i}.kg`] = 'Con el precio por kg, indica el peso'
    })
    setPropios(nuevos)
    if (Object.keys(nuevos).length > 0) return
    guardar.mutate({
      fecha: f.fecha,
      comprador: f.comprador,
      modoPrecio: f.modo,
      precio,
      animales: vendidos.map((v, i) => ({ animalId: v.animal.id, kg: kgs[i] })),
      facturaId: f.facturaId || null,
      observaciones: f.observaciones,
    })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={venta ? 'Corregir la venta' : 'Nueva venta'}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-venta" cargando={guardar.isPending}>
            {venta ? 'Guardar' : 'Vender'}
          </Boton>
        </>
      }
    >
      <form id="formulario-venta" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <div className={estilos.fila}>
          <CampoFecha
            etiqueta="Fecha"
            value={f.fecha}
            max={hoy()}
            onChange={(e) => cambiar('fecha', e.target.value)}
            error={errores.fecha}
            required
          />
          <Campo
            etiqueta="Comprador"
            autoComplete="off"
            value={f.comprador}
            onChange={(e) => cambiar('comprador', e.target.value)}
            error={errores.comprador}
            required
          />
        </div>

        <fieldset className={estilos.grupo}>
          <legend>Animales vendidos</legend>
          {vendidos.length > 0 && (
            <ul className={estilos.vendidos} aria-label="Animales vendidos">
              {vendidos.map((v, i) => (
                <li key={v.animal.id}>
                  <span className={estilos.nombreVendido}>{identificacion(v.animal)}</span>
                  <Campo
                    etiqueta="Peso (kg)"
                    aria-label={`Peso de ${identificacion(v.animal)} (kg)`}
                    className={estilos.pesoVendido}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="kg"
                    value={v.kg}
                    onChange={(e) =>
                      setVendidos((vs) =>
                        vs.map((x, j) => (j === i ? { ...x, kg: e.target.value } : x)),
                      )
                    }
                    error={errores[`animales.${i}.kg`]}
                  />
                  <span className={estilos.cuota}>
                    <span className={estilos.suave}>Importe</span>
                    {euros(importes[i] ?? 0)}
                  </span>
                  <BotonIcono
                    etiqueta={`Quitar ${identificacion(v.animal)}`}
                    icono={<X aria-hidden size={18} />}
                    className={estilos.quitar}
                    onClick={() => setVendidos((vs) => vs.filter((_, j) => j !== i))}
                  />
                  {errores[`animales.${i}.animalId`] && (
                    <p className={estilos.errorVendido}>{errores[`animales.${i}.animalId`]}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <BuscarAnimal
            elegidos={vendidos.map((v) => v.animal)}
            alElegir={(animal) => setVendidos((vs) => [...vs, { animal, kg: '' }])}
            filtros={{ estado: 'activo' }}
            ayuda="Los activos, por crotal o nombre. El peso es opcional, salvo con el precio por kg."
            error={errores.animales}
          />
        </fieldset>

        <fieldset className={estilos.grupo}>
          <legend>Precio, sin IVA ni compensación</legend>
          <Chips
            etiqueta="Cómo se indica el precio"
            opciones={(Object.keys(MODOS_PRECIO) as ModoPrecio[]).map((m) => ({
              valor: m,
              texto: MODOS_PRECIO[m],
            }))}
            seleccion={f.modo}
            alCambiar={(m) => cambiar('modo', m)}
          />
          <Campo
            etiqueta={ETIQUETA_PRECIO[f.modo]}
            inputMode="decimal"
            autoComplete="off"
            value={f.precio}
            onChange={(e) => cambiar('precio', e.target.value)}
            error={errores.precio}
            required
          />
          <dl className={estilos.totales} aria-label="Totales de la venta">
            <div>
              <dt>Animales</dt>
              <dd>{vendidos.length}</dd>
            </div>
            {pesados && (
              <>
                <div>
                  <dt>Peso total</dt>
                  <dd>{kilos(kgTotal, 1)}</dd>
                </div>
                <div>
                  <dt>Precio por kg</dt>
                  <dd>{total > 0 ? `${numero(total / kgTotal, 3)} €/kg` : '—'}</dd>
                </div>
              </>
            )}
            <div>
              <dt>Precio por animal</dt>
              <dd>{vendidos.length > 0 ? euros(total / vendidos.length) : '—'}</dd>
            </div>
            <div className={estilos.total}>
              <dt>Total</dt>
              <dd>{euros(total)}</dd>
            </div>
          </dl>
        </fieldset>

        <Selector
          etiqueta="Factura"
          ayuda="Una emitida que ya exista; si no, se crea desde la venta una vez guardada"
          value={f.facturaId}
          onChange={(e) => cambiar('facturaId', e.target.value)}
          error={errores.facturaId}
        >
          <option value="">Sin factura</option>
          {emitidas?.map((fa) => (
            <option key={fa.id} value={fa.id}>
              {fa.numero} · {fa.tercero} · {euros(fa.total)}
            </option>
          ))}
        </Selector>
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
