import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorApi } from './api/cliente'
import { CLAVE_SESION } from './auth/sesion'
import { ProveedorAvisos } from './componentes/Avisos'
import { ProveedorConfirmacion } from './componentes/Confirmacion'

export function crearClienteConsultas() {
  const cliente: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (!(error instanceof ErrorApi)) return
        // Sesión caducada o cerrada en otro sitio: sin sesión, las rutas protegidas llevan al inicio
        if (error.estado === 401) cliente.setQueryData(CLAVE_SESION, null)
        // Contraseña temporal: se vuelve a leer la sesión, que lleva a cambiarla
        if (error.codigo === 'cambio_contrasena_obligatorio') {
          cliente.invalidateQueries({ queryKey: CLAVE_SESION })
        }
      },
    }),
    defaultOptions: {
      queries: {
        // En el campo la cobertura falla: un reintento (salvo errores 4xx), y los datos valen 30 s
        retry: (fallos, error) =>
          !(error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) && fallos < 1,
        staleTime: 30_000,
      },
    },
  })
  return cliente
}

// Contextos comunes de la aplicación (también los usan los tests)
export function Proveedores({ children, cliente }: { children: ReactNode; cliente: QueryClient }) {
  return (
    <QueryClientProvider client={cliente}>
      <ProveedorAvisos>
        <ProveedorConfirmacion>{children}</ProveedorConfirmacion>
      </ProveedorAvisos>
    </QueryClientProvider>
  )
}
