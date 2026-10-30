import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha, Selector } from '../componentes/Campo'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hoy } from '../formato'
import {
  type Apunte,
  CATEGORIAS,
  type CategoriaApunte,
  CLAVE_FINANZAS,
  type DatosApunte,
  leerImporte,
  subirArchivoApunte,
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_APUNTE,
  type TipoApunte,
  tamano,
} from './datos'
import estilos from './Finanzas.module.css'
import { ElegirArchivo } from './FormularioFactura'

const texto = (n: number) => String(n).replace('.', ',')

// Registrar un ingreso o un gasto sin factura (GH-37), o corregirlo. El archivo (el ticket, la
// resolución de la ayuda…) es opcional y se sube al guardar.
export function FormularioApunte({
  apunte,
  alCerrar,
  alGuardar,
}: {
  // Para corregirlo
  apunte?: Apunte
  alCerrar: () => void
  alGuardar?: (a: Apunte) => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [f, setF] = useState({
    tipo: (apunte?.tipo ?? 'ingreso') as TipoApunte,
    categoria: (apunte?.categoria ?? 'subvencion') as CategoriaApunte,
    fecha: apunte?.fecha ?? hoy(),
    concepto: apunte?.concepto ?? '',
    importe: apunte ? texto(apunte.importe) : '',
    observaciones: apunte?.observaciones ?? '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [propios, setPropios] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const guardar = useMutation({
    mutationFn: async (cuerpo: DatosApunte) => {
      const guardado = await datos(
        apunte
          ? api.PUT('/api/explotaciones/{explotacionId}/apuntes/{apunteId}', {
              params: { path: { explotacionId: explotacion.id, apunteId: apunte.id } },
              body: cuerpo,
            })
          : api.POST('/api/explotaciones/{explotacionId}/apuntes', {
              params: { path: { explotacionId: explotacion.id } },
              body: cuerpo,
            }),
      )
      if (!archivo) return { apunte: guardado, errorArchivo: null }
      // Ya está guardado: si el archivo falla, se avisa y se puede subir desde la ficha
      try {
        return {
          apunte: await subirArchivoApunte(explotacion.id, guardado.id, archivo),
          errorArchivo: null,
        }
      } catch (error) {
        return { apunte: guardado, errorArchivo: (error as Error).message }
      }
    },
    onSuccess: async ({ apunte: guardado, errorArchivo }) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })
      avisar(
        errorArchivo
          ? { tipo: 'error', mensaje: `Guardado, pero sin el archivo: ${errorArchivo}` }
          : {
              tipo: 'exito',
              mensaje: apunte
                ? 'Corregido'
                : `${TIPOS_APUNTE[guardado.tipo]} registrado: ${guardado.concepto}`,
            },
      )
      alGuardar?.(guardado)
      alCerrar()
    },
  })

  const errores = { ...erroresPorCampo(guardar.error), ...propios }
  const errorGeneral =
    guardar.error && Object.keys(erroresPorCampo(guardar.error)).length === 0
      ? guardar.error.message
      : null

  // Al cambiar de tipo, la primera categoría del nuevo
  const cambiarTipo = (tipo: TipoApunte) =>
    setF((v) => ({ ...v, tipo, categoria: CATEGORIAS[tipo][0]?.[0] ?? v.categoria }))

  const elegirArchivo = (elegido: File | undefined) => {
    if (!elegido) return
    if (elegido.size > TAMANO_MAXIMO_ARCHIVO) {
      setPropios((e) => ({ ...e, archivo: 'El archivo ocupa más de 10 MB' }))
      return
    }
    setPropios(({ archivo: _, ...e }) => e)
    setArchivo(elegido)
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const importe = leerImporte(f.importe)
    const nuevos: Record<string, string> = {}
    if (!f.concepto.trim()) nuevos.concepto = 'Indica el concepto, por ejemplo "Pago básico PAC"'
    if (!Number.isFinite(importe) || importe <= 0) nuevos.importe = 'Indica el importe, mayor que 0'
    setPropios(nuevos)
    if (Object.keys(nuevos).length > 0) return
    guardar.mutate({
      tipo: f.tipo,
      categoria: f.categoria,
      fecha: f.fecha,
      concepto: f.concepto,
      importe,
      observaciones: f.observaciones,
    })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={apunte ? 'Corregir' : 'Nuevo ingreso o gasto'}
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-apunte" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-apunte" className={estilos.formulario} onSubmit={enviar} noValidate>
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
              { valor: 'ingreso' as const, texto: TIPOS_APUNTE.ingreso },
              { valor: 'gasto' as const, texto: TIPOS_APUNTE.gasto },
            ]}
            seleccion={f.tipo}
            alCambiar={cambiarTipo}
          />
        </fieldset>
        <Selector
          etiqueta="Categoría"
          value={f.categoria}
          onChange={(e) => cambiar('categoria', e.target.value as CategoriaApunte)}
          error={errores.categoria}
        >
          {CATEGORIAS[f.tipo].map(([valor, nombre]) => (
            <option key={valor} value={valor}>
              {nombre}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Concepto"
          autoComplete="off"
          value={f.concepto}
          onChange={(e) => cambiar('concepto', e.target.value)}
          error={errores.concepto}
          required
        />
        <div className={estilos.fila}>
          <CampoFecha
            etiqueta="Fecha"
            value={f.fecha}
            onChange={(e) => cambiar('fecha', e.target.value)}
            error={errores.fecha}
            required
          />
          <Campo
            etiqueta="Importe (€)"
            inputMode="decimal"
            autoComplete="off"
            value={f.importe}
            onChange={(e) => cambiar('importe', e.target.value)}
            error={errores.importe}
            required
          />
        </div>
        <AreaTexto
          etiqueta="Observaciones"
          value={f.observaciones}
          onChange={(e) => cambiar('observaciones', e.target.value)}
          error={errores.observaciones}
        />
        {!apunte?.archivo && (
          <div className={estilos.grupo}>
            <span className={estilos.etiqueta}>Archivo (opcional)</span>
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
              <ElegirArchivo alElegir={elegirArchivo} />
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
