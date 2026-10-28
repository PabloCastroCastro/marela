import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { Boton, BotonIcono } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Animales.module.css'
import { SEXOS, type Sexo, useRazas } from './datos'
import type { DatosParto } from './reproduccion'

// Los terneros de un parto en el formulario de registro (GH-23): de uno a cuatro, cada uno con su
// crotal (opcional), sexo, estado al nacer, raza y peso

const TERNEROS_MAXIMO = 4

export type TerneroFormulario = {
  crotal: string
  sexo: Sexo | ''
  estado: 'vivo' | 'muerto'
  raza: string
  peso: string
}

export const terneroNuevo = (raza: string): TerneroFormulario => ({
  crotal: '',
  sexo: '',
  estado: 'vivo',
  raza,
  peso: '',
})

// "38,5" → 38.5; null si no es un número
export const leerKg = (texto: string) => {
  const n = Number(texto.trim().replace(/\./g, '').replace(',', '.'))
  return texto.trim() && Number.isFinite(n) ? n : null
}

// Errores que se ven antes de enviar, con las mismas claves que los de la API
export function erroresTerneros(terneros: TerneroFormulario[]) {
  const errores: Record<string, string> = {}
  terneros.forEach((t, i) => {
    if (!t.sexo) errores[`terneros.${i}.sexo`] = 'Indica el sexo'
    if (t.peso.trim() && leerKg(t.peso) === null)
      errores[`terneros.${i}.peso`] = 'Indica el peso en kg, por ejemplo 38,5'
  })
  return errores
}

export const datosTerneros = (terneros: TerneroFormulario[]): DatosParto['terneros'] =>
  terneros.map((t) => ({
    crotal: t.crotal,
    sexo: t.sexo as Sexo,
    estado: t.estado,
    raza: t.raza,
    peso: t.peso.trim() ? leerKg(t.peso) : null,
  }))

export function CamposTerneros({
  terneros,
  razaMadre,
  alCambiar,
  errores,
}: {
  terneros: TerneroFormulario[]
  razaMadre: string
  alCambiar: (terneros: TerneroFormulario[]) => void
  errores: Record<string, string | undefined>
}) {
  const explotacion = useExplotacionActual()
  const razas = useRazas(explotacion.id)
  const idRazas = useId()
  const cambiar = <K extends keyof TerneroFormulario>(
    i: number,
    campo: K,
    valor: TerneroFormulario[K],
  ) => alCambiar(terneros.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)))

  return (
    <>
      {terneros.map((t, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: los terneros no tienen identificador hasta guardarlos
        <fieldset key={i} className={estilos.ternero}>
          <legend>{terneros.length > 1 ? `Ternero ${i + 1}` : 'Ternero'}</legend>
          {terneros.length > 1 && (
            <BotonIcono
              etiqueta={`Quitar el ternero ${i + 1}`}
              icono={<Trash2 aria-hidden size={18} />}
              className={estilos.quitarTernero}
              onClick={() => alCambiar(terneros.filter((_, j) => j !== i))}
            />
          )}
          <div className={estilos.grupo}>
            <span className={estilos.etiquetaGrupo}>Sexo *</span>
            <Chips
              etiqueta={`Sexo del ternero ${i + 1}`}
              opciones={(Object.keys(SEXOS) as Sexo[]).map((s) => ({ valor: s, texto: SEXOS[s] }))}
              seleccion={t.sexo}
              alCambiar={(s) => cambiar(i, 'sexo', s)}
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
              alCambiar={(e) => cambiar(i, 'estado', e)}
            />
          </div>
          <Campo
            etiqueta="Crotal"
            ayuda="Si aún no lo tiene, déjalo vacío y ponlo en los 20 días siguientes"
            autoCapitalize="characters"
            spellCheck={false}
            value={t.crotal}
            onChange={(e) => cambiar(i, 'crotal', e.target.value.toUpperCase())}
            error={errores[`terneros.${i}.crotal`]}
          />
          <div className={estilos.dosCampos}>
            <Campo
              etiqueta="Raza"
              list={idRazas}
              value={t.raza}
              onChange={(e) => cambiar(i, 'raza', e.target.value)}
              error={errores[`terneros.${i}.raza`]}
              required
            />
            <Campo
              etiqueta="Peso al nacer (kg)"
              ayuda="Opcional"
              inputMode="decimal"
              autoComplete="off"
              value={t.peso}
              onChange={(e) => cambiar(i, 'peso', e.target.value)}
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
            onClick={() => alCambiar([...terneros, terneroNuevo(razaMadre)])}
          >
            Añadir otro ternero
          </Boton>
        </div>
      )}
    </>
  )
}
