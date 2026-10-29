import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { PaginaAnimal } from './animales/PaginaAnimal'
import { PaginaAnimales } from './animales/PaginaAnimales'
import { PaginaHistorial } from './animales/PaginaHistorial'
import { PaginaCambiarContrasena } from './auth/PaginaCambiarContrasena'
import { PaginaEntrar } from './auth/PaginaEntrar'
import { RUTA_CAMBIAR_CONTRASENA, RUTA_ENTRAR, RutaProtegida } from './auth/RutaProtegida'
import { PaginaAlmacen } from './comida/PaginaAlmacen'
import { PaginaComida } from './comida/PaginaComida'
import { Aplicacion } from './diseno/Aplicacion'
import { SoloModulo } from './explotaciones/ExplotacionActual'
import { PaginaDatosExplotacion } from './explotaciones/PaginaDatosExplotacion'
import {
  PaginaElegirExplotacion,
  RedireccionInicial,
} from './explotaciones/PaginaElegirExplotacion'
import { PaginaEquipo } from './explotaciones/PaginaEquipo'
import { PaginaApunte } from './finanzas/PaginaApunte'
import { PaginaFactura } from './finanzas/PaginaFactura'
import { PaginaFinanzas } from './finanzas/PaginaFinanzas'
import { PaginaVenta } from './finanzas/PaginaVenta'
import { PaginaFinca } from './fincas/PaginaFinca'
import { PaginaFincas } from './fincas/PaginaFincas'
import { PaginaFichaEquipo } from './mantenimiento/PaginaFichaEquipo'
import { PaginaMantenimiento } from './mantenimiento/PaginaMantenimiento'
import { PaginaInicio } from './paginas/PaginaInicio'
import { PaginaNoEncontrada } from './paginas/PaginaNoEncontrada'
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
                <PaginaAnimales />
              </SoloModulo>
            ),
          },
          {
            path: 'animales/:animalId',
            element: (
              <SoloModulo modulo="animales">
                <PaginaAnimal />
              </SoloModulo>
            ),
          },
          {
            path: 'animales/:animalId/historial',
            element: (
              <SoloModulo modulo="animales">
                <PaginaHistorial />
              </SoloModulo>
            ),
          },
          {
            path: 'comida',
            element: (
              <SoloModulo modulo="comida">
                <PaginaComida />
              </SoloModulo>
            ),
          },
          {
            path: 'comida/:almacenId',
            element: (
              <SoloModulo modulo="comida">
                <PaginaAlmacen />
              </SoloModulo>
            ),
          },
          {
            path: 'mantenimiento',
            element: (
              <SoloModulo modulo="mantenimiento">
                <PaginaMantenimiento />
              </SoloModulo>
            ),
          },
          {
            path: 'mantenimiento/:equipoId',
            element: (
              <SoloModulo modulo="mantenimiento">
                <PaginaFichaEquipo />
              </SoloModulo>
            ),
          },
          {
            path: 'fincas',
            element: (
              <SoloModulo modulo="fincas">
                <PaginaFincas />
              </SoloModulo>
            ),
          },
          {
            path: 'fincas/:fincaId',
            element: (
              <SoloModulo modulo="fincas">
                <PaginaFinca />
              </SoloModulo>
            ),
          },
          {
            path: 'finanzas',
            element: (
              <SoloModulo modulo="finanzas">
                <PaginaFinanzas />
              </SoloModulo>
            ),
          },
          {
            path: 'finanzas/ventas/:ventaId',
            element: (
              <SoloModulo modulo="finanzas">
                <PaginaVenta />
              </SoloModulo>
            ),
          },
          {
            path: 'finanzas/apuntes/:apunteId',
            element: (
              <SoloModulo modulo="finanzas">
                <PaginaApunte />
              </SoloModulo>
            ),
          },
          {
            path: 'finanzas/facturas/:facturaId',
            element: (
              <SoloModulo modulo="finanzas">
                <PaginaFactura />
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
          {
            path: 'equipo',
            element: (
              <SoloModulo modulo="administracion">
                <PaginaEquipo />
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
