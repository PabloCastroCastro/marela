import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PowerOff } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Chips } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Comida.module.css'
import {
  type Almacen,
  CLAVE_COMIDA,
  TIPOS_ALMACEN,
  type TipoAlmacen,
  UNIDADES_ALMACEN,
  type UnidadAlmacen,
} from './datos'

// La unidad que suele llevar cada comida: las pacas se cuentan y lo demás se pesa
const UNIDAD_HABITUAL: Record<TipoAlmacen, UnidadAlmacen> = {
  hierba_verde: 'unidades',
  hierba_seca: 'unidades',
  maiz: 'kg',
  pienso: 'kg',
  otro: 'kg',
}

// Crear un almacén, o cambiar o desactivar uno (GH-29). Solo para el administrador.
export function FormularioAlmacen({
  almacen,
  alCerrar,
}: {
  // Para editarlo
  almacen?: Almacen
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [f, setF] = useState<{ nombre: string; tipo?: TipoAlmacen; unidad?: UnidadAlmacen }>({
    nombre: almacen?.nombre ?? '',
    tipo: almacen?.tipo,
    unidad: almacen?.unidad,
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})

  const refrescar = () => cliente.invalidateQueries({ queryKey: [...CLAVE_COMIDA, explotacion.id] })

  const guardar = useMutation({
    mutationFn: async (cuerpo: { nombre: string; tipo: TipoAlmacen; unidad: UnidadAlmacen }) => {
      if (almacen) {
        await datos(
          api.PUT('/api/explotaciones/{explotacionId}/almacenes/{almacenId}', {
            params: { path: { explotacionId: explotacion.id, almacenId: almacen.id } },
            body: cuerpo,
          }),
        )
        return 'Almacén guardado'
      }
      const creado = await datos(
        api.POST('/api/explotaciones/{explotacionId}/almacenes', {
          params: { path: { explotacionId: explotacion.id } },
          body: cuerpo,
        }),
      )
      return `${creado.nombre} creado`
    },
    onSuccess: async (mensaje) => {
      await refrescar()
      avisar({ tipo: 'exito', mensaje })
      alCerrar()
    },
  })

  const desactivar = useMutation({
    mutationFn: (a: Almacen) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/almacenes/{almacenId}/estado', {
          params: { path: { explotacionId: explotacion.id, almacenId: a.id } },
          body: { activo: false },
        }),
      ),
    onSuccess: async (a) => {
      await refrescar()
      avisar({ tipo: 'exito', mensaje: `${a.nombre} desactivado` })
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

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    if (!f.nombre.trim()) locales.nombre = 'Indica el nombre, por ejemplo "Silo de pienso"'
    if (!f.tipo) locales.tipo = 'Indica qué comida guarda'
    if (!f.unidad) locales.unidad = 'Indica si se mide en unidades o en kilos'
    setErroresLocales(locales)
    if (f.tipo && f.unidad && Object.keys(locales).length === 0)
      guardar.mutate({ nombre: f.nombre, tipo: f.tipo, unidad: f.unidad })
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={almacen ? `Editar · ${almacen.nombre}` : 'Nuevo almacén'}
      pie={
        <>
          {almacen && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<PowerOff aria-hidden size={18} />}
              cargando={desactivar.isPending}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: `¿Desactivar ${almacen.nombre}?`,
                  mensaje:
                    'Deja de aparecer en el stock. Sus datos y su historial se conservan, y se puede reactivar.',
                  textoConfirmar: 'Desactivar',
                })
                if (ok) desactivar.mutate(almacen)
              }}
            >
              Desactivar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-almacen" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-almacen" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Campo
          etiqueta="Nombre"
          autoComplete="off"
          value={f.nombre}
          onChange={(e) => setF((v) => ({ ...v, nombre: e.target.value }))}
          error={errores.nombre}
          required
        />
        <fieldset className={estilos.grupo}>
          <legend>Qué comida guarda</legend>
          <Chips
            etiqueta="Qué comida guarda"
            envolver
            opciones={(Object.keys(TIPOS_ALMACEN) as TipoAlmacen[]).map((t) => ({
              valor: t,
              texto: TIPOS_ALMACEN[t],
            }))}
            seleccion={f.tipo}
            // Al elegir la comida, la unidad habitual, si aún no se ha elegido
            alCambiar={(t) =>
              setF((v) => ({ ...v, tipo: t, unidad: v.unidad ?? UNIDAD_HABITUAL[t] }))
            }
          />
          {errores.tipo && (
            <p className={estilos.error} role="alert">
              {errores.tipo}
            </p>
          )}
        </fieldset>
        <fieldset className={estilos.grupo}>
          <legend>Se mide en</legend>
          {/* Con movimientos, la unidad ya no cambia: sus cantidades dejarían de tener sentido */}
          {almacen?.conMovimientos ? (
            <p className={estilos.suave}>
              {UNIDADES_ALMACEN[almacen.unidad]}. No se puede cambiar: ya tiene movimientos.
            </p>
          ) : (
            <Chips
              etiqueta="Se mide en"
              opciones={(Object.keys(UNIDADES_ALMACEN) as UnidadAlmacen[]).map((u) => ({
                valor: u,
                texto: UNIDADES_ALMACEN[u],
              }))}
              seleccion={f.unidad}
              alCambiar={(u) => setF((v) => ({ ...v, unidad: u }))}
            />
          )}
          {errores.unidad && (
            <p className={estilos.error} role="alert">
              {errores.unidad}
            </p>
          )}
        </fieldset>
      </form>
    </HojaInferior>
  )
}
