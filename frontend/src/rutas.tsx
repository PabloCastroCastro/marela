import { createBrowserRouter } from 'react-router'
import { Aplicacion } from './diseno/Aplicacion'
import { PaginaInicio } from './paginas/PaginaInicio'
import { PaginaNoEncontrada } from './paginas/PaginaNoEncontrada'
import { PaginaSeccion } from './paginas/PaginaSeccion'

// Las secciones son, por ahora, páginas vacías: cada una se desarrolla en su propia issue
export const rutas = [
  {
    path: '/',
    element: <Aplicacion />,
    children: [
      { index: true, element: <PaginaInicio /> },
      { path: 'animales', element: <PaginaSeccion titulo="Animales" /> },
      { path: 'comida', element: <PaginaSeccion titulo="Comida" /> },
      { path: 'fincas', element: <PaginaSeccion titulo="Fincas" /> },
      { path: 'finanzas', element: <PaginaSeccion titulo="Finanzas" /> },
      // Catálogo de componentes: solo en desarrollo, no existe en la versión compilada
      ...(import.meta.env.DEV
        ? [
            {
              path: 'componentes',
              lazy: async () => ({
                Component: (await import('./paginas/PaginaComponentes')).PaginaComponentes,
              }),
            },
          ]
        : []),
      { path: '*', element: <PaginaNoEncontrada /> },
    ],
  },
]

export const crearRouter = () => createBrowserRouter(rutas)
