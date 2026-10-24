import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { PaginaCambiarContrasena } from './auth/PaginaCambiarContrasena'
import { PaginaEntrar } from './auth/PaginaEntrar'
import { RUTA_CAMBIAR_CONTRASENA, RUTA_ENTRAR, RutaProtegida } from './auth/RutaProtegida'
import { Aplicacion } from './diseno/Aplicacion'
import { SoloModulo } from './explotaciones/ExplotacionActual'
import { PaginaDatosExplotacion } from './explotaciones/PaginaDatosExplotacion'
import {
  PaginaElegirExplotacion,
  RedireccionInicial,
} from './explotaciones/PaginaElegirExplotacion'
import { PaginaInicio } from './paginas/PaginaInicio'
import { PaginaNoEncontrada } from './paginas/PaginaNoEncontrada'
import { PaginaSeccion } from './paginas/PaginaSeccion'
import { PaginaPlataforma } from './plataforma/PaginaPlataforma'

// Rutas: /entrar sin sesión; el resto exige sesión. La explotación activa va en la URL
// (/explotaciones/:explotacionId/...). Las secciones son, por ahora, páginas vacías: cada una se
// desarrolla en su propia issue.
export const rutas: RouteObject[] = [
  { path: RUTA_ENTRAR, element: <PaginaEntrar /> },
  // Catálogo de componentes: solo en desarrollo, no existe en la versión compilada
  ...(import.meta.env.DEV
    ? [
        {
          path: '/componentes',
          lazy: async () => ({
            Component: (await import('./paginas/PaginaComponentes')).PaginaComponentes,
          }),
        },
      ]
    : []),
  {
    element: <RutaProtegida />,
    children: [
      { path: '/', element: <RedireccionInicial /> },
      { path: RUTA_CAMBIAR_CONTRASENA, element: <PaginaCambiarContrasena /> },
      { path: '/explotaciones', element: <PaginaElegirExplotacion /> },
      // Gestión de las explotaciones por el propietario de la plataforma
      { path: '/plataforma', element: <PaginaPlataforma /> },
      {
        path: '/explotaciones/:explotacionId',
        element: <Aplicacion />,
        children: [
          { index: true, element: <PaginaInicio /> },
          {
            path: 'animales',
            element: (
              <SoloModulo modulo="animales">
                <PaginaSeccion titulo="Animales" />
              </SoloModulo>
            ),
          },
          {
            path: 'comida',
            element: (
              <SoloModulo modulo="comida">
                <PaginaSeccion titulo="Comida" />
              </SoloModulo>
            ),
          },
          {
            path: 'fincas',
            element: (
              <SoloModulo modulo="fincas">
                <PaginaSeccion titulo="Fincas" />
              </SoloModulo>
            ),
          },
          {
            path: 'finanzas',
            element: (
              <SoloModulo modulo="finanzas">
                <PaginaSeccion titulo="Finanzas" />
              </SoloModulo>
            ),
          },
          {
            path: 'datos',
            element: (
              <SoloModulo modulo="administracion">
                <PaginaDatosExplotacion />
              </SoloModulo>
            ),
          },
          { path: '*', element: <PaginaNoEncontrada /> },
        ],
      },
    ],
  },
  // Cualquier otra dirección lleva al inicio (que pide sesión si hace falta)
  { path: '*', element: <Navigate to="/" replace /> },
]

export const crearRouter = () => createBrowserRouter(rutas)
