import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { identificacion } from '../animales/datos'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Casilla } from '../componentes/Casilla'
import { ElegirArchivo } from '../componentes/ElegirArchivo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { euros, hoy } from '../formato'
import { type AnimalElegido, BuscarAnimal } from './BuscarAnimal'
import {
  ARCHIVOS_ADMITIDOS,
  CLAVE_FINANZAS,
  cuotaDe,
  type DatosFactura,
  type Factura,
  IMPUESTOS,
  type ImpuestoFactura,
  impuestoPorDefecto,
  leerImporte,
  porcentaje,
  subirArchivo,
  TAMANO_MAXIMO_ARCHIVO,
  TERCERO,
  TIPOS_FACTURA,
  type TipoFactura,
  tamano,
  useFiscal,
  useSiguienteNumero,
} from './datos'
import estilos from './Finanzas.module.css'

type Linea = { base: string; porcentaje: number }

const LINEAS_MAXIMO = 8

const texto = (n: number) => String(n).replace('.', ',')
const centimos = (n: number) => Math.round(n * 100)

// Registrar una factura recibida o emitida, o corregirla (GH-35). Una línea por tipo de IVA (o la de
// la compensación del REAGP), con la cuota y el total calculados al momento. En las emitidas se
// propone el siguiente número del año. El archivo se sube al guardar.
export function FormularioFactura({
  factura,
  inicial,
  alCerrar,
  alGuardar,
}: {
  // Para corregirla
  factura?: Factura
  // Para una nueva, con datos ya puestos: la factura de una venta (GH-38)
  inicial?: { tipo: TipoFactura; fecha: string; tercero: string; concepto: string; base: number }
  alCerrar: () => void
  alGuardar?: (f: Factura) => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const fiscal = useFiscal(explotacion.id).data
  const regimen = fiscal?.regimen ?? 'reagp'
  const tiposIva = fiscal?.tiposIva ?? [21, 10, 4]
  const compensacion = fiscal?.compensacionReagp ?? 10.5

  const [f, setF] = useState({
    tipo: (factura?.tipo ?? inicial?.tipo ?? 'recibida') as TipoFactura,
    fecha: factura?.fecha ?? inicial?.fecha ?? hoy(),
    tercero: factura?.tercero ?? inicial?.tercero ?? '',
    nif: factura?.nif ?? '',
    nifExtranjero: factura?.nifExtranjero ?? false,
    concepto: factura?.concepto ?? inicial?.concepto ?? '',
    pagada: Boolean(factura?.pagadaEn),
    pagadaEn: factura?.pagadaEn ?? hoy(),
  })
  // Sin escribir nada, en una emitida nueva se usa el número propuesto
  const [numero, setNumero] = useState<string | null>(factura?.numero ?? null)
  const [impuesto, setImpuesto] = useState<ImpuestoFactura | null>(factura?.impuesto ?? null)
  const [lineas, setLineas] = useState<Linea[]>(
    factura?.lineas.map((l) => ({ base: texto(l.base), porcentaje: l.porcentaje })) ?? [
      { base: inicial ? texto(inicial.base) : '', porcentaje: Number.NaN },
    ],
  )
  const [animales, setAnimales] = useState<AnimalElegido[]>(factura?.animales ?? [])
  const [archivo, setArchivo] = useState<File | null>(null)
  const [erroresPropios, setErroresPropios] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const propuesto = useSiguienteNumero(
    explotacion.id,
    f.fecha,
    !factura && f.tipo === 'emitida' && numero === null,
  )
  const numeroActual = numero ?? (f.tipo === 'emitida' ? (propuesto.data?.numero ?? '') : '')
  const impuestoActual = impuesto ?? impuestoPorDefecto(f.tipo, regimen)
  // Los porcentajes que se ofrecen, y el de cada línea aunque ya no esté configurado
  const opciones = impuestoActual === 'compensacion' ? [compensacion] : tiposIva
  const porcentajeDe = (l: Linea) =>
    Number.isNaN(l.porcentaje) ? (opciones[0] ?? 0) : l.porcentaje

  // Las cuentas, al céntimo, como en el backend
  const calculadas = lineas.map((l) => {
    const base = leerImporte(l.base)
    const pct = porcentajeDe(l)
    return { base, porcentaje: pct, cuota: Number.isFinite(base) ? cuotaDe(base, pct) : 0 }
  })
  const sumaBase = calculadas.reduce(
    (s, l) => s + (Number.isFinite(l.base) ? centimos(l.base) : 0),
    0,
  )
  const sumaCuota = calculadas.reduce((s, l) => s + centimos(l.cuota), 0)

  const refrescar = () =>
    cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })

  const guardar = useMutation({
    mutationFn: async (cuerpo: DatosFactura) => {
      const guardada = await datos(
        factura
          ? api.PUT('/api/explotaciones/{explotacionId}/facturas/{facturaId}', {
              params: { path: { explotacionId: explotacion.id, facturaId: factura.id } },
              body: cuerpo,
            })
          : api.POST('/api/explotaciones/{explotacionId}/facturas', {
              params: { path: { explotacionId: explotacion.id } },
              body: cuerpo,
            }),
      )
      if (!archivo) return { factura: guardada, errorArchivo: null }
      // La factura ya está guardada: si el archivo falla, se avisa y se puede subir desde la ficha
      try {
        return {
          factura: await subirArchivo(explotacion.id, guardada.id, archivo),
          errorArchivo: null,
        }
      } catch (error) {
        return { factura: guardada, errorArchivo: (error as Error).message }
      }
    },
    onSuccess: async ({ factura: guardada, errorArchivo }) => {
      await refrescar()
      avisar(
        errorArchivo
          ? { tipo: 'error', mensaje: `Factura guardada, pero sin el archivo: ${errorArchivo}` }
          : {
              tipo: 'exito',
              mensaje: factura ? 'Factura corregida' : `Factura registrada: ${guardada.numero}`,
            },
      )
      alGuardar?.(guardada)
      alCerrar()
    },
  })

  const errores = { ...erroresPorCampo(guardar.error), ...erroresPropios }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null

  const cambiarImpuesto = (nuevo: ImpuestoFactura) => {
    setImpuesto(nuevo)
    // Los porcentajes, los del nuevo impuesto
    const pct = nuevo === 'compensacion' ? compensacion : (tiposIva[0] ?? 0)
    setLineas((ls) =>
      (nuevo === 'compensacion' ? ls.slice(0, 1) : ls).map((l) => ({ ...l, porcentaje: pct })),
    )
  }

  const cambiarLinea = (i: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)))

  const elegirArchivo = (elegido: File | undefined) => {
    if (!elegido) return
    if (elegido.size > TAMANO_MAXIMO_ARCHIVO) {
      setErroresPropios((e) => ({ ...e, archivo: 'El archivo ocupa más de 10 MB' }))
      return
    }
    setErroresPropios(({ archivo: _, ...e }) => e)
    setArchivo(elegido)
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const propios: Record<string, string> = {}
    calculadas.forEach((l, i) => {
      if (!Number.isFinite(l.base)) propios[`lineas.${i}.base`] = 'Indica la base imponible'
    })
    if (!f.tercero.trim()) propios.tercero = `Indica el ${TERCERO[f.tipo].toLowerCase()}`
    if (!numeroActual.trim()) propios.numero = 'Indica el número de la factura'
    if (!f.nif.trim()) propios.nif = 'Indica el NIF'
    if (!f.concepto.trim()) propios.concepto = 'Indica el concepto'
    setErroresPropios(propios)
    if (Object.keys(propios).length > 0) return
    guardar.mutate({
      tipo: f.tipo,
      numero: numeroActual,
      fecha: f.fecha,
      tercero: f.tercero,
      nif: f.nif,
      nifExtranjero: f.nifExtranjero,
      concepto: f.concepto,
      impuesto: impuestoActual,
      lineas: calculadas,
      total: (sumaBase + sumaCuota) / 100,
      pagadaEn: f.pagada ? f.pagadaEn : null,
      animalIds: f.tipo === 'recibida' ? animales.map((a) => a.id) : [],
    })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={factura ? 'Corregir la factura' : 'Nueva factura'}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-factura" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-factura" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <fieldset className={estilos.grupo}>
          <legend>Tipo</legend>
          <Chips
            etiqueta="Tipo"
            opciones={[
              { valor: 'recibida' as const, texto: `${TIPOS_FACTURA.recibida} (gasto)` },
              { valor: 'emitida' as const, texto: `${TIPOS_FACTURA.emitida} (ingreso)` },
            ]}
            seleccion={f.tipo}
            alCambiar={(t) => cambiar('tipo', t)}
          />
        </fieldset>
        <div className={estilos.fila}>
          <CampoFecha
            etiqueta="Fecha"
            value={f.fecha}
            onChange={(e) => cambiar('fecha', e.target.value)}
            error={errores.fecha}
            required
          />
          <Campo
            etiqueta="Número"
            ayuda={
              f.tipo === 'emitida' && !factura && numero === null
                ? 'El siguiente del año; se puede cambiar'
                : undefined
            }
            autoComplete="off"
            value={numeroActual}
            onChange={(e) => setNumero(e.target.value)}
            error={errores.numero}
            required
          />
        </div>
        <Campo
          etiqueta={TERCERO[f.tipo]}
          autoComplete="off"
          value={f.tercero}
          onChange={(e) => cambiar('tercero', e.target.value)}
          error={errores.tercero}
          required
        />
        <div className={estilos.nif}>
          <Campo
            etiqueta="NIF"
            autoComplete="off"
            autoCapitalize="characters"
            value={f.nif}
            onChange={(e) => cambiar('nif', e.target.value)}
            error={errores.nif}
            required
          />
          <Casilla
            etiqueta="NIF extranjero"
            checked={f.nifExtranjero}
            onChange={(e) => cambiar('nifExtranjero', e.target.checked)}
          />
        </div>
        <AreaTexto
          etiqueta="Concepto"
          value={f.concepto}
          onChange={(e) => cambiar('concepto', e.target.value)}
          error={errores.concepto}
          required
        />

        <fieldset className={estilos.grupo}>
          <legend>Importes</legend>
          <Chips
            etiqueta="Impuesto"
            opciones={(Object.keys(IMPUESTOS) as ImpuestoFactura[]).map((i) => ({
              valor: i,
              texto: IMPUESTOS[i],
            }))}
            seleccion={impuestoActual}
            alCambiar={cambiarImpuesto}
          />
          <ul className={estilos.lineas} aria-label="Líneas de la factura">
            {lineas.map((l, i) => {
              const pct = porcentajeDe(l)
              const calculada = calculadas[i]
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: las líneas no tienen identificador
                <li key={i}>
                  <Campo
                    etiqueta={lineas.length > 1 ? `Base imponible ${i + 1}` : 'Base imponible'}
                    inputMode="decimal"
                    autoComplete="off"
                    value={l.base}
                    onChange={(e) => cambiarLinea(i, { base: e.target.value })}
                    error={errores[`lineas.${i}.base`] ?? errores[`lineas.${i}.cuota`]}
                  />
                  <Selector
                    etiqueta={impuestoActual === 'compensacion' ? 'Compensación' : 'IVA'}
                    value={String(pct)}
                    onChange={(e) => cambiarLinea(i, { porcentaje: Number(e.target.value) })}
                  >
                    {[...new Set([...opciones, pct])].map((p) => (
                      <option key={p} value={String(p)}>
                        {porcentaje(p)}
                      </option>
                    ))}
                  </Selector>
                  <span className={estilos.cuota}>
                    <span className={estilos.suave}>Cuota</span>
                    {euros(calculada?.cuota ?? 0)}
                  </span>
                  {lineas.length > 1 && (
                    <BotonIcono
                      etiqueta={`Quitar la línea ${i + 1}`}
                      icono={<X aria-hidden size={18} />}
                      className={estilos.quitar}
                      onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          {impuestoActual === 'iva' && lineas.length < LINEAS_MAXIMO && (
            <Boton
              variante="texto"
              tamano="compacto"
              className={estilos.anadir}
              icono={<Plus aria-hidden size={18} />}
              onClick={() =>
                setLineas((ls) => [
                  ...ls,
                  {
                    base: '',
                    porcentaje:
                      tiposIva.find((t) => !ls.some((l) => porcentajeDe(l) === t)) ?? Number.NaN,
                  },
                ])
              }
            >
              Otro tipo de IVA
            </Boton>
          )}
          <dl className={estilos.totales} aria-label="Totales">
            <div>
              <dt>Base imponible</dt>
              <dd>{euros(sumaBase / 100)}</dd>
            </div>
            <div>
              <dt>{IMPUESTOS[impuestoActual]}</dt>
              <dd>{euros(sumaCuota / 100)}</dd>
            </div>
            <div className={estilos.total}>
              <dt>Total</dt>
              <dd>{euros((sumaBase + sumaCuota) / 100)}</dd>
            </div>
          </dl>
          {errores.total && (
            <p className={estilos.error} role="alert">
              {errores.total}
            </p>
          )}
        </fieldset>

        <div className={estilos.fila}>
          <Casilla
            etiqueta="Pagada"
            checked={f.pagada}
            onChange={(e) => cambiar('pagada', e.target.checked)}
          />
          {f.pagada && (
            <CampoFecha
              etiqueta="Fecha de pago"
              value={f.pagadaEn}
              onChange={(e) => cambiar('pagadaEn', e.target.value)}
              error={errores.pagadaEn}
            />
          )}
        </div>

        {f.tipo === 'recibida' && (
          <AnimalesComprados
            animales={animales}
            alCambiar={setAnimales}
            error={errores.animalIds}
          />
        )}

        {!factura?.archivo && (
          <div className={estilos.grupo}>
            <span className={estilos.etiqueta}>Archivo (PDF o foto)</span>
            {archivo ? (
              <div className={estilos.archivoElegido}>
                <Paperclip aria-hidden size={18} />
                <span>
                  {archivo.name} <span className={estilos.suave}>· {tamano(archivo.size)}</span>
                </span>
                <BotonIcono
                  etiqueta="Quitar el archivo"
                  icono={<X aria-hidden size={18} />}
                  className={estilos.quitar}
                  onClick={() => setArchivo(null)}
                />
              </div>
            ) : (
              <ElegirArchivo aceptar={ARCHIVOS_ADMITIDOS} alElegir={elegirArchivo} />
            )}
            {errores.archivo && (
              <p className={estilos.error} role="alert">
                {errores.archivo}
              </p>
            )}
          </div>
        )}
      </form>
    </HojaInferior>
  )
}

// Los animales comprados con la factura (excepcional: un toro, una novilla…), buscados por crotal o
// nombre
function AnimalesComprados({
  animales,
  alCambiar,
  error,
}: {
  animales: AnimalElegido[]
  alCambiar: (animales: AnimalElegido[]) => void
  error?: string
}) {
  return (
    <fieldset className={estilos.grupo}>
      <legend>Animales comprados</legend>
      {animales.length > 0 && (
        <ul className={estilos.animales} aria-label="Animales comprados">
          {animales.map((a) => (
            <li key={a.id}>
              {identificacion(a)}
              <BotonIcono
                etiqueta={`Quitar ${identificacion(a)}`}
                icono={<X aria-hidden size={16} />}
                className={estilos.quitar}
                onClick={() => alCambiar(animales.filter((e) => e.id !== a.id))}
              />
            </li>
          ))}
        </ul>
      )}
      <BuscarAnimal
        elegidos={animales}
        alElegir={(a) => alCambiar([...animales, a])}
        ayuda="Solo si es una compra de animales; por crotal o nombre"
        error={error}
      />
    </fieldset>
  )
}
