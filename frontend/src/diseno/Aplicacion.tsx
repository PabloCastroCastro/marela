import { Beef, Euro, Tractor, Wheat } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { ActualizacionPwa } from '../pwa/ActualizacionPwa'
import estilos from './Aplicacion.module.css'

const secciones = [
  { ruta: '/animales', texto: 'Animales', icono: Beef },
  { ruta: '/comida', texto: 'Comida', icono: Wheat },
  { ruta: '/fincas', texto: 'Fincas', icono: Tractor },
  { ruta: '/finanzas', texto: 'Finanzas', icono: Euro },
]

// Estructura de las pantallas: en el móvil, cabecera, contenido y navegación inferior (pensada para
// una mano); en pantalla ancha, menú lateral con las secciones y contenido más ancho para tablas
export function Aplicacion() {
  return (
    <div className={estilos.aplicacion}>
      <a href="#contenido" className="saltar-al-contenido">
        Saltar al contenido
      </a>
      <header className={estilos.cabecera}>
        <NavLink to="/" className={estilos.marca}>
          <img src="/logo.svg" alt="" width={32} height={32} className={estilos.logo} />
          <span>Marela</span>
        </NavLink>
      </header>

      <nav className={estilos.navegacion} aria-label="Secciones">
        {secciones.map(({ ruta, texto, icono: Icono }) => (
          <NavLink
            key={ruta}
            to={ruta}
            className={({ isActive }) =>
              [estilos.enlace, isActive && estilos.activo].filter(Boolean).join(' ')
            }
          >
            <Icono aria-hidden size={24} />
            <span>{texto}</span>
          </NavLink>
        ))}
      </nav>

      <main id="contenido" className={estilos.contenido}>
        <Outlet />
      </main>

      <ActualizacionPwa />
    </div>
  )
}
