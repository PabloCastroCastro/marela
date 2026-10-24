import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, Copy, Plus, Tractor } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { api, datos, erroresPorCampo } from '../api/cliente'
import type { components } from '../api/esquema'
import { useSesion } from '../auth/sesion'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia } from '../componentes/Etiquetas'
import { HojaInferior } from '../componentes/HojaInferior'
import { Tabla } from '../componentes/Tabla'
import {
  CamposExplotacion,
  DATOS_VACIOS,
  type DatosExplotacion,
  type Provincia,
} from '../explotaciones/CamposExplotacion'
import { CLAVE_EXPLOTACIONES } from '../explotaciones/datos'
import { fecha } from '../formato'
import estilos from './Plataforma.module.css'

type ExplotacionPlataforma = components['schemas']['ExplotacionPlataforma']
type ExplotacionCreada = components['schemas']['ExplotacionCreada']

const CLAVE_PLATAFORMA = ['plataforma', 'explotaciones'] as const

// Gestión de la plataforma, solo para su propietario: todas las explotaciones, crearlas con su primer
// administrador y desactivarlas o reactivarlas (GH-11)
export function PaginaPlataforma() {
  const sesion = useSesion()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [creando, setCreando] = useState(false)
  const [creada, setCreada] = useState<ExplotacionCreada | null>(null)

  const explotaciones = useQuery({
    queryKey: CLAVE_PLATAFORMA,
    queryFn: () => datos(api.GET('/api/plataforma/explotaciones')),
    enabled: sesion.data?.usuario.propietario === true,
  })

  const cambiarEstado = useMutation({
    mutationFn: (e: ExplotacionPlataforma) =>
      datos(
        api.PATCH('/api/plataforma/explotaciones/{explotacionId}', {
          params: { path: { explotacionId: e.id } },
          body: { activa: !e.activa },
        }),
      ),
    onSuccess: async (e) => {
      await cliente.invalidateQueries({ queryKey: CLAVE_PLATAFORMA })
      await cliente.invalidateQueries({ queryKey: CLAVE_EXPLOTACIONES })
      avisar({ tipo: 'exito', mensaje: `${e.nombre} ${e.activa ? 'reactivada' : 'desactivada'}` })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  if (!sesion.data?.usuario.propietario) return <Navigate to="/" replace />

  const alternar = async (e: ExplotacionPlataforma) => {
    if (
      e.activa &&
      !(await confirmar({
        titulo: `¿Desactivar ${e.nombre}?`,
        mensaje:
          'Sus miembros dejarán de verla y no podrán entrar en ella. No se borra ningún dato y podrás reactivarla cuando quieras.',
        textoConfirmar: 'Desactivar',
        peligrosa: true,
      }))
    ) {
      return
    }
    cambiarEstado.mutate(e)
  }

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecera}>
        <Link to="/" className={estilos.volver}>
          <ArrowLeft aria-hidden size={20} />
          Volver
        </Link>
      </header>
      <main className={estilos.contenido}>
        <div className={estilos.titulo}>
          <h1>Explotaciones de la plataforma</h1>
          <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setCreando(true)}>
            Nueva explotación
          </Boton>
        </div>

        {explotaciones.isPending ? (
          <Esqueleto bloques={[{ alto: '3rem' }, { alto: '3rem' }, { alto: '3rem' }]} />
        ) : explotaciones.isError ? (
          <EstadoError
            alReintentar={() => explotaciones.refetch()}
            reintentando={explotaciones.isFetching}
          />
        ) : explotaciones.data.length === 0 ? (
          <EstadoVacio
            icono={<Tractor size={32} />}
            titulo="Aún no hay explotaciones"
            descripcion="Crea la primera con su administrador, que después dará de alta a su equipo."
            accion={
              <Boton icono={<Plus aria-hidden size={20} />} onClick={() => setCreando(true)}>
                Nueva explotación
              </Boton>
            }
          />
        ) : (
          <Tabla
            etiqueta="Explotaciones"
            filas={explotaciones.data}
            claveFila={(e) => e.id}
            columnas={[
              {
                clave: 'nombre',
                titulo: 'Nombre',
                valor: (e) => e.nombre,
                ordenar: (e) => e.nombre,
                principal: true,
              },
              { clave: 'rega', titulo: 'REGA', valor: (e) => e.rega, ordenar: (e) => e.rega },
              {
                clave: 'lugar',
                titulo: 'Municipio',
                valor: (e) => [e.municipio, e.provincia].filter(Boolean).join(', ') || '—',
                ordenar: (e) => e.provincia,
              },
              {
                clave: 'miembros',
                titulo: 'Miembros',
                valor: (e) => e.miembros,
                ordenar: (e) => e.miembros,
                numerica: true,
              },
              {
                clave: 'creada',
                titulo: 'Alta',
                valor: (e) => fecha(e.creadaEn),
                ordenar: (e) => e.creadaEn,
              },
              {
                clave: 'estado',
                titulo: 'Estado',
                valor: (e) => (
                  <span className={estilos.estado}>
                    {e.activa ? (
                      <Insignia tipo="exito" icono={<CircleCheck aria-hidden />}>
                        Activa
                      </Insignia>
                    ) : (
                      <Insignia>Desactivada</Insignia>
                    )}
                    <Boton
                      variante={e.activa ? 'texto' : 'secundario'}
                      tamano="compacto"
                      onClick={() => alternar(e)}
                      cargando={cambiarEstado.isPending && cambiarEstado.variables?.id === e.id}
                    >
                      {e.activa ? 'Desactivar' : 'Reactivar'}
                    </Boton>
                  </span>
                ),
                ordenar: (e) => (e.activa ? 0 : 1),
              },
            ]}
            ordenInicial={{ clave: 'nombre', sentido: 'asc' }}
          />
        )}
      </main>

      <FormularioNuevaExplotacion
        abierto={creando}
        alCerrar={() => setCreando(false)}
        alCrear={(c) => {
          setCreando(false)
          setCreada(c)
        }}
      />
      <HojaInferior
        abierta={creada !== null}
        alCerrar={() => setCreada(null)}
        titulo="Explotación creada"
        pie={<Boton onClick={() => setCreada(null)}>Hecho</Boton>}
      >
        {creada && <ResumenCreada creada={creada} />}
      </HojaInferior>
    </div>
  )
}

type Administrador =
  | { tipo: 'nuevo'; usuario: string; nombre: string; email: string }
  | { tipo: 'existente'; usuario: string }

function FormularioNuevaExplotacion({
  abierto,
  alCerrar,
  alCrear,
}: {
  abierto: boolean
  alCerrar: () => void
  alCrear: (creada: ExplotacionCreada) => void
}) {
  const cliente = useQueryClient()
  const [explotacion, setExplotacion] = useState<DatosExplotacion>(DATOS_VACIOS)
  const [admin, setAdmin] = useState<Administrador>({
    tipo: 'nuevo',
    usuario: '',
    nombre: '',
    email: '',
  })

  const crear = useMutation({
    mutationFn: () =>
      datos(
        api.POST('/api/plataforma/explotaciones', {
          body: {
            ...explotacion,
            provincia: explotacion.provincia as Provincia,
            administrador: admin,
          },
        }),
      ),
    onSuccess: async (creada) => {
      await cliente.invalidateQueries({ queryKey: CLAVE_PLATAFORMA })
      await cliente.invalidateQueries({ queryKey: CLAVE_EXPLOTACIONES })
      setExplotacion(DATOS_VACIOS)
      setAdmin({ tipo: 'nuevo', usuario: '', nombre: '', email: '' })
      crear.reset()
      alCrear(creada)
    },
  })

  const errores = erroresPorCampo(crear.error)
  const errorAdmin = (campo: string) => errores[`administrador.${campo}`]
  // Errores que no son de un campo concreto
  const errorGeneral = crear.error && Object.keys(errores).length === 0 ? crear.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    crear.mutate()
  }

  return (
    <HojaInferior
      abierta={abierto}
      alCerrar={alCerrar}
      titulo="Nueva explotación"
      pie={
        <>
          <Boton variante="texto" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form="nueva-explotacion" cargando={crear.isPending}>
            Crear explotación
          </Boton>
        </>
      }
    >
      <form id="nueva-explotacion" className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <CamposExplotacion datos={explotacion} alCambiar={setExplotacion} errores={errores} />

        <fieldset className={estilos.grupo}>
          <legend>Primer administrador</legend>
          <Chips
            etiqueta="Primer administrador"
            opciones={[
              { valor: 'nuevo', texto: 'Usuario nuevo' },
              { valor: 'existente', texto: 'Usuario que ya existe' },
            ]}
            seleccion={admin.tipo}
            alCambiar={(tipo) =>
              setAdmin(
                tipo === 'nuevo'
                  ? { tipo, usuario: admin.usuario, nombre: '', email: '' }
                  : { tipo, usuario: admin.usuario },
              )
            }
          />
          <Campo
            etiqueta="Nombre de usuario"
            ayuda={
              admin.tipo === 'nuevo'
                ? 'Letras, números, punto y guion bajo. Con él inicia sesión.'
                : 'El de un usuario que ya trabaja en otra explotación'
            }
            autoCapitalize="none"
            spellCheck={false}
            value={admin.usuario}
            onChange={(e) => setAdmin({ ...admin, usuario: e.target.value })}
            error={errorAdmin('usuario')}
            required
          />
          {admin.tipo === 'nuevo' && (
            <>
              <Campo
                etiqueta="Nombre y apellidos"
                value={admin.nombre}
                onChange={(e) => setAdmin({ ...admin, nombre: e.target.value })}
                error={errorAdmin('nombre')}
                required
              />
              <Campo
                etiqueta="Email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                value={admin.email}
                onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                error={errorAdmin('email')}
                required
              />
            </>
          )}
        </fieldset>
      </form>
    </HojaInferior>
  )
}

function ResumenCreada({ creada }: { creada: ExplotacionCreada }) {
  const { avisar } = useAvisos()
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar({ tipo: 'exito', mensaje: 'Contraseña copiada' })
    } catch {
      avisar({ tipo: 'error', mensaje: 'No se ha podido copiar; apúntala a mano' })
    }
  }

  return (
    <div className={estilos.resumen}>
      <p>
        <strong>{creada.explotacion.nombre}</strong> ya está dada de alta, con{' '}
        <strong>{creada.administrador.nombre}</strong> ({creada.administrador.usuario}) como
        administrador.
      </p>
      {creada.contrasenaTemporal ? (
        <>
          <p>Dale esta contraseña temporal. La cambiará la primera vez que entre.</p>
          <div className={estilos.contrasena}>
            <code>{creada.contrasenaTemporal}</code>
            <Boton
              variante="secundario"
              tamano="compacto"
              icono={<Copy aria-hidden size={18} />}
              onClick={() => copiar(creada.contrasenaTemporal ?? '')}
            >
              Copiar
            </Boton>
          </div>
          <p className={estilos.aviso} role="note">
            Apúntala ahora: no se volverá a mostrar.
          </p>
        </>
      ) : (
        <p>Ya puede entrar con su usuario y su contraseña de siempre.</p>
      )}
    </div>
  )
}
