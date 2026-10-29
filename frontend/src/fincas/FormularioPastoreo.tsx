import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import type { components } from '../api/esquema'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { AreaTexto, Campo, CampoFecha } from '../componentes/Campo'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha as formatoFecha, hoy } from '../formato'
import { nuevoId, type Pendiente, reemplazar } from '../sinConexion/cola'
import { AVISO_GUARDADO, useRegistrar } from '../sinConexion/useRegistrar'
import { CLAVE_FINCAS, type Finca } from './datos'
import estilos from './Fincas.module.css'
import { animales, type Pastoreo } from './pastoreos'

type CuerpoPastoreo = components['schemas']['DatosPastoreo']

// Lo que el formulario necesita de la finca: también sirve la que se guardó con un pendiente
export type FincaPastoreo = Pick<Finca, 'id' | 'nombre' | 'finSeguridad'>

// "Entrada a pastar · 12 animales · 01/06/2026 · Agra de abaixo", para la lista de pendientes
// (GH-32)
const descripcion = (c: CuerpoPastoreo, finca: FincaPastoreo) =>
  `Entrada a pastar · ${animales(c.animales)} · ${formatoFecha(c.fechaEntrada)} · ${finca.nombre}`

// Registrar la entrada de animales a pastar en una finca, o corregir o borrar un pastoreo (GH-28).
// Si la finca está en plazo de seguridad, lo avisa, pero deja guardar. Sin conexión, la entrada se
// guarda en el móvil y se envía sola al recuperarla; con `pendiente`, se corrige la que no se pudo
// enviar (GH-32).
export function FormularioPastoreo({
  finca,
  pastoreo,
  pendiente,
  alCerrar,
}: {
  finca: FincaPastoreo
  // Para corregirlo o borrarlo
  pastoreo?: Pastoreo
  pendiente?: Pendiente
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const registrar = useRegistrar()
  const previo = pastoreo ?? (pendiente?.cuerpo as CuerpoPastoreo | undefined)
  // El id del pastoreo nuevo, el mismo en cada intento: reenviarlo no lo duplica
  const [id] = useState(() => pendiente?.id ?? nuevoId())
  const [f, setF] = useState({
    fechaEntrada: previo?.fechaEntrada ?? hoy(),
    fechaSalida: previo?.fechaSalida ?? '',
    animales: previo ? String(previo.animales) : '',
    observaciones: previo?.observaciones ?? '',
  })
  const [erroresLocales, setErroresLocales] = useState<Record<string, string>>({})
  const cambiar = <K extends keyof typeof f>(campo: K, valor: (typeof f)[K]) =>
    setF((v) => ({ ...v, [campo]: valor }))

  const refrescar = () => cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })

  const cuerpo = () => ({
    fechaEntrada: f.fechaEntrada,
    fechaSalida: f.fechaSalida || null,
    animales: Number(f.animales),
    observaciones: f.observaciones,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (pastoreo) {
        await datos(
          api.PUT('/api/explotaciones/{explotacionId}/pastoreos/{pastoreoId}', {
            params: { path: { explotacionId: explotacion.id, pastoreoId: pastoreo.id } },
            body: cuerpo(),
          }),
        )
        return 'Pastoreo corregido'
      }
      const nuevo: CuerpoPastoreo = { fincaId: finca.id, id, ...cuerpo() }
      if (pendiente) {
        reemplazar(pendiente.id, nuevo, descripcion(nuevo, finca))
        return 'Pastoreo corregido: se volverá a enviar'
      }
      const resultado = await registrar(
        {
          id,
          tipo: 'pastoreo',
          ruta: `/api/explotaciones/${explotacion.id}/pastoreos`,
          cuerpo: nuevo,
          descripcion: descripcion(nuevo, finca),
          contexto: {
            fincaId: finca.id,
            finca: JSON.stringify({
              id: finca.id,
              nombre: finca.nombre,
              finSeguridad: finca.finSeguridad,
            }),
          },
          claves: [[...CLAVE_FINCAS, explotacion.id]],
        },
        () =>
          datos(
            api.POST('/api/explotaciones/{explotacionId}/pastoreos', {
              params: { path: { explotacionId: explotacion.id } },
              body: nuevo,
            }),
          ),
      )
      return 'enviado' in resultado ? 'Pastoreo registrado' : AVISO_GUARDADO
    },
    onSuccess: async (mensaje) => {
      // En la cola, o corregido en ella: no ha cambiado nada en el servidor, y sin conexión
      // refrescar se quedaría esperando
      const enCola = mensaje === AVISO_GUARDADO || Boolean(pendiente)
      if (!enCola) await refrescar()
      avisar({ tipo: enCola ? 'info' : 'exito', mensaje })
      alCerrar()
    },
  })

  // Para deshacer un borrado se vuelve a registrar el mismo pastoreo
  const recuperar = useMutation({
    mutationFn: (p: Pastoreo) =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/pastoreos', {
          params: { path: { explotacionId: explotacion.id } },
          body: {
            fincaId: p.fincaId,
            fechaEntrada: p.fechaEntrada,
            fechaSalida: p.fechaSalida,
            animales: p.animales,
            observaciones: p.observaciones,
          },
        }),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const borrar = useMutation({
    mutationFn: (p: Pastoreo) =>
      datos(
        api.DELETE('/api/explotaciones/{explotacionId}/pastoreos/{pastoreoId}', {
          params: { path: { explotacionId: explotacion.id, pastoreoId: p.id } },
        }),
      ),
    onSuccess: async (p) => {
      await refrescar()
      avisar({
        mensaje: `Pastoreo del ${formatoFecha(p.fechaEntrada)} borrado`,
        accion: { texto: 'Deshacer', alPulsar: () => recuperar.mutate(p) },
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
  const enPlazo = finca.finSeguridad && f.fechaEntrada < finca.finSeguridad

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const locales: Record<string, string> = {}
    const n = Number(f.animales)
    if (!f.animales.trim() || !Number.isInteger(n) || n < 1)
      locales.animales = 'Indica cuántos animales, por ejemplo 12'
    if (f.fechaSalida && f.fechaSalida < f.fechaEntrada)
      locales.fechaSalida = 'La salida no puede ser antes de la entrada'
    setErroresLocales(locales)
    if (Object.keys(locales).length === 0) guardar.mutate()
  }

  return (
    <HojaInferior
      abierta
      alCerrar={alCerrar}
      titulo={pastoreo ? 'Corregir · Pastoreo' : `Pastoreo · ${finca.nombre}`}
      pie={
        <>
          {pastoreo && (
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Trash2 aria-hidden size={18} />}
              cargando={borrar.isPending}
              onClick={() => borrar.mutate(pastoreo)}
            >
              Borrar
            </Boton>
          )}
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="formulario-pastoreo" cargando={guardar.isPending}>
            Guardar
          </Boton>
        </>
      }
    >
      <form id="formulario-pastoreo" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        {errores.fincaId && (
          <p className={estilos.error} role="alert">
            {errores.fincaId}
          </p>
        )}
        <CampoFecha
          etiqueta="Fecha de entrada"
          value={f.fechaEntrada}
          max={hoy()}
          onChange={(e) => cambiar('fechaEntrada', e.target.value)}
          error={errores.fechaEntrada}
          required
        />
        {enPlazo && finca.finSeguridad && (
          <p className={estilos.aviso} role="status">
            <TriangleAlert aria-hidden size={18} />
            La finca está en plazo de seguridad hasta el {formatoFecha(finca.finSeguridad)}:
            comprueba que el producto permite pastar.
          </p>
        )}
        <Campo
          etiqueta="Número de animales"
          inputMode="numeric"
          autoComplete="off"
          value={f.animales}
          onChange={(e) => cambiar('animales', e.target.value)}
          error={errores.animales}
          required
        />
        <CampoFecha
          etiqueta="Fecha de salida"
          ayuda="Déjala vacía si los animales siguen en la finca"
          value={f.fechaSalida}
          min={f.fechaEntrada}
          max={hoy()}
          onChange={(e) => cambiar('fechaSalida', e.target.value)}
          error={errores.fechaSalida}
        />
        <AreaTexto
          etiqueta="Observaciones"
          ayuda="Por ejemplo: vacas con sus crías"
          value={f.observaciones}
          onChange={(e) => cambiar('observaciones', e.target.value)}
          error={errores.observaciones}
        />
      </form>
    </HojaInferior>
  )
}
