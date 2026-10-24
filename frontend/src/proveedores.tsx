import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorApi } from './api/cliente'
import { ProveedorAvisos } from './componentes/Avisos'
import { ProveedorConfirmacion } from './componentes/Confirmacion'

export function crearClienteConsultas() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // En el campo la cobertura falla: un reintento (salvo errores 4xx), y los datos valen 30 s
        retry: (fallos, error) =>
          !(error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) && fallos < 1,
        staleTime: 30_000,
      },
    },
  })
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
