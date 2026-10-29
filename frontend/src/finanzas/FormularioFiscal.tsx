import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { CLAVE_FINANZAS, type Fiscal, porcentaje, REGIMENES, type RegimenFiscal } from './datos'
import estilos from './Finanzas.module.css'

// "10,5" → 10.5; null si no es un número
const leer = (texto: string) => {
  const n = Number(texto.trim().replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

const texto = (n: number) => String(n).replace('.', ',')

// Cambiar el régimen fiscal de la explotación y sus porcentajes (GH-34): la compensación del REAGP y
// los tipos de IVA que se ofrecerán en las facturas. Solo el administrador.
export function FormularioFiscal({ fiscal, alCerrar }: { fiscal: Fiscal; alCerrar: () => void }) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [regimen, setRegimen] = useState<RegimenFiscal>(fiscal.regimen)
  const [compensacion, setCompensacion] = useState(texto(fiscal.compensacionReagp))
  const [tipos, setTipos] = useState<number[]>(fiscal.tiposIva)
  const [nuevoTipo, setNuevoTipo] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})

  const guardar = useMutation({
    mutationFn: (cuerpo: {
      regimen: RegimenFiscal
      compensacionReagp: number
      tiposIva: number[]
    }) =>
      datos(
        api.PUT('/api/explotaciones/{explotacionId}/fiscal', {
          params: { path: { explotacionId: explotacion.id } },
          body: cuerpo,
        }),
      ),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })
      avisar({ tipo: 'exito', mensaje: 'Régimen fiscal guardado' })
      alCerrar()
    },
  })

  const deApi = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(deApi).length === 0 ? guardar.error.message : null

  const anadirTipo = () => {
    const n = leer(nuevoTipo)
    if (n === null || n < 0 || n > 100) {
      setErrores((e) => ({ ...e, nuevoTipo: 'Indica un porcentaje entre 0 y 100, por ejemplo 5' }))
      return
    }
    setErrores(({ nuevoTipo: _, ...e }) => e)
    setTipos((t) => [...new Set([...t, n])].sort((a, b) => b - a))
    setNuevoTipo('')
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    const n = leer(compensacion)
    if (n === null || n < 0 || n > 100)
      locales.compensacionReagp = 'Indica un porcentaje entre 0 y 100, por ejemplo 10,5'
    if (tipos.length === 0) locales.tiposIva = 'Deja al menos un tipo de IVA'
    setErrores(locales)
    if (n !== null && Object.keys(locales).length === 0)
      guardar.mutate({ regimen, compensacionReagp: n, tiposIva: tipos })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo="Régimen fiscal"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-fiscal" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-fiscal" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <fieldset className={estilos.grupo}>
          <legend>Régimen</legend>
          <Chips
            etiqueta="Régimen"
            envolver
            opciones={(Object.keys(REGIMENES) as RegimenFiscal[]).map((r) => ({
              valor: r,
              texto: REGIMENES[r],
            }))}
            seleccion={regimen}
            alCambiar={setRegimen}
          />
          <p className={estilos.suave}>
            {regimen === 'reagp'
              ? 'Las ventas llevan un recibo de compensación en lugar de una factura con IVA.'
              : 'Las ventas llevan una factura con IVA.'}
          </p>
        </fieldset>
        <Campo
          etiqueta="Compensación del REAGP (%)"
          ayuda="Para la ganadería, el 10,5 %"
          inputMode="decimal"
          autoComplete="off"
          value={compensacion}
          onChange={(e) => setCompensacion(e.target.value)}
          error={errores.compensacionReagp ?? deApi.compensacionReagp}
          required
        />
        <fieldset className={estilos.grupo}>
          <legend>Tipos de IVA</legend>
          <ul className={estilos.tipos} aria-label="Tipos de IVA">
            {tipos.map((t) => (
              <li key={t}>
                {porcentaje(t)}
                <BotonIcono
                  etiqueta={`Quitar el ${porcentaje(t)}`}
                  icono={<X aria-hidden size={16} />}
                  className={estilos.quitar}
                  onClick={() => setTipos((ts) => ts.filter((x) => x !== t))}
                />
              </li>
            ))}
          </ul>
          {(errores.tiposIva ?? deApi.tiposIva) && (
            <p className={estilos.error} role="alert">
              {errores.tiposIva ?? deApi.tiposIva}
            </p>
          )}
          <div className={estilos.nuevoTipo}>
            <Campo
              etiqueta="Otro tipo de IVA (%)"
              inputMode="decimal"
              autoComplete="off"
              value={nuevoTipo}
              onChange={(e) => setNuevoTipo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  anadirTipo()
                }
              }}
              error={errores.nuevoTipo}
            />
            <Boton
              variante="secundario"
              icono={<Plus aria-hidden size={18} />}
              onClick={anadirTipo}
            >
              Añadir
            </Boton>
          </div>
        </fieldset>
      </form>
    </HojaInferior>
  )
}
