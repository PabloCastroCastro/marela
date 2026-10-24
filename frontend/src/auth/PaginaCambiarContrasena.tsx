import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, KeyRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import estilos from './Autenticacion.module.css'
import type { DesdeDonde } from './RutaProtegida'
import { CLAVE_SESION, cambiarContrasena, obtenerSesion, useSesion } from './sesion'
import { useCerrarSesion } from './useCerrarSesion'

const LONGITUD_MINIMA = 10

type Errores = { actual?: string; nueva?: string; repetida?: string }

// Cambio de contraseña. Obligatorio, y sin poder hacer nada más, mientras la contraseña sea temporal.
export function PaginaCambiarContrasena() {
  const sesion = useSesion()
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const { avisar } = useAvisos()
  const cerrarSesion = useCerrarSesion()
  const desde = (useLocation().state as DesdeDonde | null)?.desde
  const temporal = sesion.data?.usuario.debeCambiarContrasena ?? false
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [errores, setErrores] = useState<Errores>({})

  const cambiar = useMutation({
    mutationFn: async () => {
      await cambiarContrasena(actual, nueva)
      return obtenerSesion()
    },
    onSuccess: (actualizada) => {
      cliente.setQueryData(CLAVE_SESION, actualizada)
      avisar({ tipo: 'exito', mensaje: 'Contraseña cambiada' })
      navegar(desde ?? '/', { replace: true })
    },
  })

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const nuevos: Errores = {
      actual: actual ? undefined : 'Escribe tu contraseña actual',
      nueva:
        nueva.length < LONGITUD_MINIMA
          ? `Debe tener al menos ${LONGITUD_MINIMA} caracteres`
          : nueva === actual
            ? 'Debe ser distinta de la actual'
            : undefined,
      repetida: repetida === nueva ? undefined : 'No coincide con la contraseña nueva',
    }
    setErrores(nuevos)
    if (!nuevos.actual && !nuevos.nueva && !nuevos.repetida) cambiar.mutate()
  }

  return (
    <main className={estilos.pantalla}>
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <div className={estilos.marca}>
          <h1>Cambiar la contraseña</h1>
          {temporal && (
            <p>
              Tu contraseña es temporal. Elige una nueva, de al menos {LONGITUD_MINIMA} caracteres,
              para empezar a usar Marela.
            </p>
          )}
        </div>

        {cambiar.error && (
          <p className={estilos.error} role="alert">
            <CircleAlert aria-hidden size={20} />
            {cambiar.error.message}
          </p>
        )}

        {/* Campo de usuario oculto para que el gestor de contraseñas sepa de quién es */}
        <input
          type="text"
          className="solo-lectores"
          autoComplete="username"
          defaultValue={sesion.data?.usuario.username ?? ''}
          tabIndex={-1}
          aria-hidden="true"
          readOnly
        />
        <Campo
          etiqueta={temporal ? 'Contraseña temporal' : 'Contraseña actual'}
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          error={errores.actual}
          required
        />
        <Campo
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          ayuda={`Al menos ${LONGITUD_MINIMA} caracteres`}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          error={errores.nueva}
          required
        />
        <Campo
          etiqueta="Repite la contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          error={errores.repetida}
          required
        />

        <Boton
          type="submit"
          anchoCompleto
          icono={<KeyRound aria-hidden size={20} />}
          cargando={cambiar.isPending}
        >
          Cambiar la contraseña
        </Boton>
        {temporal ? (
          <Boton variante="texto" anchoCompleto onClick={cerrarSesion}>
            Cerrar sesión
          </Boton>
        ) : (
          <Boton variante="texto" anchoCompleto onClick={() => navegar(-1)}>
            Cancelar
          </Boton>
        )}
      </form>
    </main>
  )
}
