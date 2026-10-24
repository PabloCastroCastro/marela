import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, KeyRound, Plus, UserRoundCheck, UserRoundX, Users } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import type { components } from '../api/esquema'
import { useSesion } from '../auth/sesion'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { useConfirmacion } from '../componentes/Confirmacion'
import { ContrasenaTemporal } from '../componentes/ContrasenaTemporal'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { Tabla } from '../componentes/Tabla'
import { CLAVE_EXPLOTACIONES } from './datos'
import estilos from './Equipo.module.css'
import { useExplotacionActual } from './ExplotacionActual'

type Miembro = components['schemas']['Miembro']
type Rol = Miembro['rol']

const ROLES: { valor: Rol; texto: string }[] = [
  { valor: 'empleado', texto: 'Empleado' },
  { valor: 'administrador', texto: 'Administrador' },
]

const NOMBRE_ROL: Record<Rol, string> = { administrador: 'Administrador', empleado: 'Empleado' }

// Equipo de la explotación, que gestiona su administrador: añadir personas, cambiar su rol,
// desactivarlas o reactivarlas y restablecer su contraseña (GH-12)
export function PaginaEquipo() {
  const explotacion = useExplotacionActual()
  const sesion = useSesion()
  const [anadiendo, setAnadiendo] = useState(false)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [nuevaContrasena, setNuevaContrasena] = useState<{
    nombre: string
    contrasena: string
  } | null>(null)
  const clave = ['equipo', explotacion.id]

  const miembros = useQuery({
    queryKey: clave,
    queryFn: () =>
      datos(
        api.GET('/api/explotaciones/{explotacionId}/miembros', {
          params: { path: { explotacionId: explotacion.id } },
        }),
      ),
  })

  const yo = sesion.data?.usuario.id
  const elegido = miembros.data?.find((m) => m.id === seleccionado) ?? null

  return (
    <section className={estilos.equipo}>
      <div className={estilos.titulo}>
        <h1>Equipo</h1>
        <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setAnadiendo(true)}>
          Añadir persona
        </Boton>
      </div>

      {miembros.isPending ? (
        <Esqueleto bloques={[{ alto: '3rem' }, { alto: '3rem' }, { alto: '3rem' }]} />
      ) : miembros.isError ? (
        <EstadoError alReintentar={() => miembros.refetch()} reintentando={miembros.isFetching} />
      ) : miembros.data.length === 0 ? (
        <EstadoVacio icono={<Users size={32} />} titulo="Aún no hay nadie en el equipo" />
      ) : (
        <Tabla
          etiqueta="Equipo"
          filas={miembros.data}
          claveFila={(m) => m.id}
          ordenInicial={{ clave: 'nombre', sentido: 'asc' }}
          alSeleccionar={(m) => setSeleccionado(m.id)}
          columnas={[
            {
              clave: 'nombre',
              titulo: 'Nombre',
              valor: (m) => (m.usuarioId === yo ? `${m.nombre} (tú)` : m.nombre),
              ordenar: (m) => m.nombre,
              principal: true,
            },
            {
              clave: 'usuario',
              titulo: 'Usuario',
              valor: (m) => m.usuario ?? '—',
              ordenar: (m) => m.usuario,
            },
            { clave: 'rol', titulo: 'Rol', valor: (m) => NOMBRE_ROL[m.rol], ordenar: (m) => m.rol },
            {
              clave: 'estado',
              titulo: 'Estado',
              valor: (m) =>
                m.activo ? (
                  <Insignia tipo="exito" icono={<CircleCheck aria-hidden />}>
                    Activo
                  </Insignia>
                ) : (
                  <Insignia>Desactivado</Insignia>
                ),
              ordenar: (m) => (m.activo ? 0 : 1),
            },
          ]}
        />
      )}

      <FormularioAnadir
        abierto={anadiendo}
        alCerrar={() => setAnadiendo(false)}
        alAnadir={(nombre, contrasena) => {
          setAnadiendo(false)
          if (contrasena) setNuevaContrasena({ nombre, contrasena })
        }}
      />
      <HojaMiembro
        miembro={elegido}
        esUsted={elegido?.usuarioId === yo}
        alCerrar={() => setSeleccionado(null)}
      />
      <HojaInferior
        abierta={nuevaContrasena !== null}
        alCerrar={() => setNuevaContrasena(null)}
        titulo={`${nuevaContrasena?.nombre ?? ''} ya está en el equipo`}
        pie={<Boton onClick={() => setNuevaContrasena(null)}>Hecho</Boton>}
      >
        {nuevaContrasena && <ContrasenaTemporal contrasena={nuevaContrasena.contrasena} />}
      </HojaInferior>
    </section>
  )
}

function useActualizarEquipo() {
  const cliente = useQueryClient()
  const { id } = useExplotacionActual()
  return async () => {
    await cliente.invalidateQueries({ queryKey: ['equipo', id] })
    await cliente.invalidateQueries({ queryKey: CLAVE_EXPLOTACIONES })
  }
}

type Persona =
  | { tipo: 'nuevo'; usuario: string; nombre: string; email: string; rol: Rol }
  | { tipo: 'existente'; usuario: string; rol: Rol }

const VACIA: Persona = { tipo: 'nuevo', usuario: '', nombre: '', email: '', rol: 'empleado' }

function FormularioAnadir({
  abierto,
  alCerrar,
  alAnadir,
}: {
  abierto: boolean
  alCerrar: () => void
  alAnadir: (nombre: string, contrasena?: string) => void
}) {
  const explotacion = useExplotacionActual()
  const actualizar = useActualizarEquipo()
  const { avisar } = useAvisos()
  const [persona, setPersona] = useState<Persona>(VACIA)

  const anadir = useMutation({
    mutationFn: () =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/miembros', {
          params: { path: { explotacionId: explotacion.id } },
          body: persona,
        }),
      ),
    onSuccess: async ({ miembro, contrasenaTemporal }) => {
      await actualizar()
      setPersona(VACIA)
      anadir.reset()
      if (!contrasenaTemporal)
        avisar({ tipo: 'exito', mensaje: `${miembro.nombre} ya está en el equipo` })
      alAnadir(miembro.nombre, contrasenaTemporal)
    },
  })

  const errores = erroresPorCampo(anadir.error)
  const errorGeneral =
    anadir.error && Object.keys(errores).length === 0 ? anadir.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    anadir.mutate()
  }

  return (
    <HojaInferior
      abierta={abierto}
      alCerrar={alCerrar}
      titulo="Añadir persona"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="anadir-persona" cargando={anadir.isPending}>
            Añadir al equipo
          </Boton>
        </>
      }
    >
      <form id="anadir-persona" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <Chips
          etiqueta="Quién"
          opciones={[
            { valor: 'nuevo', texto: 'Persona nueva' },
            { valor: 'existente', texto: 'Ya usa Marela' },
          ]}
          seleccion={persona.tipo}
          alCambiar={(tipo) =>
            setPersona(
              tipo === 'nuevo'
                ? { tipo, usuario: persona.usuario, nombre: '', email: '', rol: persona.rol }
                : { tipo, usuario: persona.usuario, rol: persona.rol },
            )
          }
        />
        <Campo
          etiqueta="Nombre de usuario"
          ayuda={
            persona.tipo === 'nuevo'
              ? 'Letras, números, punto y guion bajo. Con él inicia sesión.'
              : 'El que usa en otra explotación'
          }
          autoCapitalize="none"
          spellCheck={false}
          value={persona.usuario}
          onChange={(e) => setPersona({ ...persona, usuario: e.target.value })}
          error={errores.usuario}
          required
        />
        {persona.tipo === 'nuevo' && (
          <>
            <Campo
              etiqueta="Nombre y apellidos"
              value={persona.nombre}
              onChange={(e) => setPersona({ ...persona, nombre: e.target.value })}
              error={errores.nombre}
              required
            />
            <Campo
              etiqueta="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={persona.email}
              onChange={(e) => setPersona({ ...persona, email: e.target.value })}
              error={errores.email}
              required
            />
          </>
        )}
        <fieldset className={estilos.grupo}>
          <legend>Rol</legend>
          <Chips
            etiqueta="Rol"
            opciones={ROLES}
            seleccion={persona.rol}
            alCambiar={(rol) => setPersona({ ...persona, rol })}
          />
          <p className={estilos.ayuda}>
            {persona.rol === 'administrador'
              ? 'Accede a todo, también a Finanzas y al equipo.'
              : 'Accede a Animales, Comida y Fincas, pero no a Finanzas.'}
          </p>
        </fieldset>
      </form>
    </HojaInferior>
  )
}

function HojaMiembro({
  miembro,
  esUsted,
  alCerrar,
}: {
  miembro: Miembro | null
  esUsted: boolean
  alCerrar: () => void
}) {
  const explotacion = useExplotacionActual()
  const actualizar = useActualizarEquipo()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [contrasena, setContrasena] = useState<string | null>(null)

  const ruta = { explotacionId: explotacion.id, miembroId: miembro?.id ?? '' }

  const cambiar = useMutation({
    mutationFn: (cambio: { rol?: Rol; activo?: boolean }) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/miembros/{miembroId}', {
          params: { path: ruta },
          body: cambio,
        }),
      ),
    onSuccess: async (m, cambio) => {
      await actualizar()
      avisar({
        tipo: 'exito',
        mensaje:
          cambio.activo === undefined
            ? `Rol de ${m.nombre}: ${NOMBRE_ROL[m.rol].toLowerCase()}`
            : `Se ha ${m.activo ? 'reactivado' : 'desactivado'} a ${m.nombre}`,
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const restablecer = useMutation({
    mutationFn: () =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/miembros/{miembroId}/restablecer-contrasena', {
          params: { path: ruta },
        }),
      ),
    onSuccess: (r) => setContrasena(r.contrasenaTemporal ?? null),
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const cerrar = () => {
    setContrasena(null)
    restablecer.reset()
    alCerrar()
  }

  if (!miembro) return null

  const desactivar = async () => {
    const ok = await confirmar({
      titulo: `¿Desactivar a ${miembro.nombre}?`,
      mensaje:
        'Dejará de poder entrar en esta explotación. Lo que haya registrado se conserva y podrás reactivarlo cuando quieras.',
      textoConfirmar: 'Desactivar',
      peligrosa: true,
    })
    if (ok) cambiar.mutate({ activo: false })
  }

  const darContrasena = async () => {
    const ok = await confirmar({
      titulo: `¿Dar una contraseña nueva a ${miembro.nombre}?`,
      mensaje: 'La actual dejará de servir y tendrá que volver a entrar con la nueva.',
      textoConfirmar: 'Dar contraseña nueva',
    })
    if (ok) restablecer.mutate()
  }

  return (
    <HojaInferior abierta alCerrar={cerrar} titulo={miembro.nombre}>
      <p className={estilos.datos}>
        {miembro.usuario} · {miembro.email}
      </p>
      {contrasena ? (
        <ContrasenaTemporal contrasena={contrasena} />
      ) : (
        <>
          <fieldset className={estilos.grupo} disabled={!miembro.activo || cambiar.isPending}>
            <legend>Rol</legend>
            <Chips
              etiqueta="Rol"
              opciones={ROLES}
              seleccion={miembro.rol}
              alCambiar={(rol) => rol !== miembro.rol && cambiar.mutate({ rol })}
            />
          </fieldset>
          <div className={estilos.acciones}>
            {!esUsted && (
              <Boton
                variante="secundario"
                anchoCompleto
                icono={<KeyRound aria-hidden size={20} />}
                cargando={restablecer.isPending}
                onClick={darContrasena}
              >
                Dar contraseña nueva
              </Boton>
            )}
            {miembro.activo ? (
              <Boton
                variante="texto"
                anchoCompleto
                className={estilos.peligro}
                icono={<UserRoundX aria-hidden size={20} />}
                cargando={cambiar.isPending && cambiar.variables?.activo === false}
                onClick={desactivar}
              >
                Desactivar
              </Boton>
            ) : (
              <Boton
                variante="secundario"
                anchoCompleto
                icono={<UserRoundCheck aria-hidden size={20} />}
                cargando={cambiar.isPending}
                onClick={() => cambiar.mutate({ activo: true })}
              >
                Reactivar
              </Boton>
            )}
          </div>
        </>
      )}
    </HojaInferior>
  )
}
