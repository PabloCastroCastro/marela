import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { crearClienteConsultas, Proveedores } from './proveedores'
import { crearRouter } from './rutas'
import { cargarCola } from './sinConexion/cola'
import { guardarConsultas, restaurarConsultas } from './sinConexion/persistencia'
import './estilos/tokens.css'
import './estilos/base.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Antes de pintar nada, lo guardado en el dispositivo (GH-31): las consultas ya descargadas, para
// abrir sin cobertura, y los registros pendientes de enviar
const cliente = crearClienteConsultas()
await Promise.all([restaurarConsultas(cliente), cargarCola()]).catch(() => undefined)
guardarConsultas(cliente)

createRoot(raiz).render(
  <StrictMode>
    <Proveedores cliente={cliente}>
      <RouterProvider router={crearRouter()} />
    </Proveedores>
  </StrictMode>,
)
