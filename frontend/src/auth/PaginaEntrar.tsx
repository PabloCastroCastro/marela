import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, LogIn } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Boton } from '../componentes/Boton'
import { Campo } from '../componentes/Campo'
import { Cargando } from '../componentes/Estados'
import estilos from './Autenticacion.module.css'
import type { DesdeDonde } from './RutaProtegida'
import { CLAVE_SESION, iniciarSesion, obtenerSesion, useSesion } from './sesion'

// Inicio de sesión con nombre de usuario o email. No hay registro: los usuarios los crea el
// administrador de la explotación.
export function PaginaEntrar() {
  const sesion = useSesion()
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const desde = (useLocation().state as DesdeDonde | null)?.desde
  const [identificador, setIdentificador] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verContrasena, setVerContrasena] = useState(false)
  const [errores, setErrores] = useState<{ identificador?: string; contrasena?: string }>({})

  const entrar = useMutation({
    mutationFn: async () => {
      await iniciarSesion(identificador, contrasena)
      return obtenerSesion()
    },
    onSuccess: (nueva) => {
      // Datos de otro usuario que pudieran quedar en caché
      cliente.clear()
      cliente.setQueryData(CLAVE_SESION, nueva)
      // Con varias explotaciones se elige; con una, esa pantalla entra directamente
      navegar(desde ?? '/explotaciones', { replace: true })
    },
  })

  if (sesion.isPending) return <Cargando />
  // Ya con sesión, no tiene sentido volver a entrar
  if (sesion.data && !entrar.isPending && !entrar.isSuccess)
    return <Navigate to={desde ?? '/'} replace />

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    const faltan = {
      identificador: identificador.trim() ? undefined : 'Escribe tu usuario o tu email',
      contrasena: contrasena ? undefined : 'Escribe tu contraseña',
    }
    setErrores(faltan)
    if (!faltan.identificador && !faltan.contrasena) entrar.mutate()
  }

  return (
    <main className={estilos.pantalla}>
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <div className={estilos.marca}>
          <img src="/logo.svg" alt="" width={64} height={64} />
          <h1>Marela</h1>
          <p>Gestión de la ganadería</p>
        </div>

        {entrar.error && (
          <p className={estilos.error} role="alert">
            <CircleAlert aria-hidden size={20} />
            {entrar.error.message}
          </p>
        )}

        <Campo
          etiqueta="Usuario o email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          error={errores.identificador}
          required
        />
        <div className={estilos.contrasena}>
          <Campo
            etiqueta="Contraseña"
            type={verContrasena ? 'text' : 'password'}
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            error={errores.contrasena}
            required
          />
          <Boton
            variante="texto"
            tamano="compacto"
            className={estilos.ver}
            aria-pressed={verContrasena}
            onClick={() => setVerContrasena((v) => !v)}
          >
            {verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          </Boton>
        </div>

        <Boton
          type="submit"
          anchoCompleto
          icono={<LogIn aria-hidden size={20} />}
          cargando={entrar.isPending}
        >
          Entrar
        </Boton>
        <p className={estilos.nota}>
          ¿Has olvidado la contraseña? Pide al administrador de tu explotación que te dé una nueva.
        </p>
      </form>
    </main>
  )
}
