import {
  Building2,
  ChevronsUpDown,
  CircleUserRound,
  Euro,
  KeyRound,
  LogOut,
  Settings,
  Tractor,
  Users,
  Wheat,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { RUTA_CAMBIAR_CONTRASENA } from '../auth/RutaProtegida'
import { useSesion } from '../auth/sesion'
import { useCerrarSesion } from '../auth/useCerrarSesion'
import { Boton, BotonIcono } from '../componentes/Boton'
import { clases } from '../componentes/clases'
import { Cargando, EstadoError, EstadoVacio } from '../componentes/Estados'
import { HojaInferior } from '../componentes/HojaInferior'
import { Vaca } from '../componentes/iconos'
import {
  type DetalleExplotacion,
  guardarUltimaExplotacion,
  type Modulo,
  rutaExplotacion,
  useExplotacion,
  useExplotaciones,
} from '../explotaciones/datos'
import { ProveedorExplotacion, useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { ListaExplotaciones } from '../explotaciones/PaginaElegirExplotacion'
import { ActualizacionPwa } from '../pwa/ActualizacionPwa'
import estilos from './Aplicacion.module.css'

const secciones: { ruta: string; texto: string; icono: typeof Vaca; modulo: Modulo }[] = [
  { ruta: 'animales', texto: 'Animales', icono: Vaca, modulo: 'animales' },
  { ruta: 'comida', texto: 'Comida', icono: Wheat, modulo: 'comida' },
  { ruta: 'fincas', texto: 'Fincas', icono: Tractor, modulo: 'fincas' },
  { ruta: 'finanzas', texto: 'Finanzas', icono: Euro, modulo: 'finanzas' },
]

// Estructura de las pantallas de una explotación (/explotaciones/:explotacionId/...): en el móvil,
// cabecera con el selector de explotación, contenido y navegación inferior (pensada para una mano);
// en pantalla ancha, menú lateral con el selector y las secciones, y contenido más ancho para tablas.
// Solo aparecen las secciones a las que da acceso el rol.
export function Aplicacion() {
  const { explotacionId = '' } = useParams()
  const explotacion = useExplotacion(explotacionId)

  useEffect(() => {
    if (explotacion.data) guardarUltimaExplotacion(explotacion.data.id)
  }, [explotacion.data])

  if (explotacion.isPending) return <Cargando />
  if (explotacion.isError) {
    const error = explotacion.error instanceof ErrorApi ? explotacion.error : null
    const desactivada = error?.codigo === 'explotacion_desactivada'
    const sinAcceso = error?.codigo === 'miembro_desactivado'
    return (
      <main className={estilos.sinExplotacion}>
        {error?.estado === 404 || desactivada || sinAcceso ? (
          <EstadoVacio
            titulo={
              desactivada
                ? 'Esta explotación está desactivada'
                : 'No tienes acceso a esta explotación'
            }
            descripcion={
              desactivada
                ? 'No se puede entrar en ella mientras esté desactivada. Sus datos se conservan.'
                : sinAcceso
                  ? 'Tu acceso a esta explotación está desactivado. Habla con su administrador.'
                  : 'No existe o no perteneces a ella.'
            }
            accion={
              <Link to="/explotaciones" className={estilos.enlaceBoton}>
                Ver mis explotaciones
              </Link>
            }
          />
        ) : (
          <EstadoError
            alReintentar={() => explotacion.refetch()}
            reintentando={explotacion.isFetching}
          />
        )}
      </main>
    )
  }

  return <Estructura explotacion={explotacion.data} />
}

function Estructura({ explotacion }: { explotacion: DetalleExplotacion }) {
  const base = rutaExplotacion(explotacion.id)
  const [cuentaAbierta, setCuentaAbierta] = useState(false)
  const visibles = secciones.filter((s) => explotacion.modulos.includes(s.modulo))

  return (
    <ProveedorExplotacion value={explotacion}>
      <div className={estilos.aplicacion}>
        <a href="#contenido" className="saltar-al-contenido">
          Saltar al contenido
        </a>
        <header className={estilos.cabecera}>
          <Link to={base} className={estilos.marca} aria-label="Marela, inicio de la explotación">
            <img src="/logo.svg" alt="" width={32} height={32} className={estilos.logo} />
            <span className={estilos.nombreMarca}>Marela</span>
          </Link>
          <div className={estilos.selectorMovil}>
            <SelectorExplotacion explotacion={explotacion} />
          </div>
          <BotonIcono
            etiqueta="Tu cuenta"
            icono={<CircleUserRound aria-hidden size={24} />}
            className={estilos.cuenta}
            onClick={() => setCuentaAbierta(true)}
          />
        </header>

        <nav className={estilos.navegacion} aria-label="Secciones">
          <div className={estilos.selectorAncho}>
            <SelectorExplotacion explotacion={explotacion} />
          </div>
          {visibles.map(({ ruta, texto, icono: Icono }) => (
            <NavLink
              key={ruta}
              to={`${base}/${ruta}`}
              className={({ isActive }) => clases(estilos.enlace, isActive && estilos.activo)}
            >
              <span className={estilos.icono}>
                <Icono aria-hidden size={24} />
              </span>
              <span>{texto}</span>
            </NavLink>
          ))}
        </nav>

        <main id="contenido" className={estilos.contenido}>
          <Outlet />
        </main>

        <HojaCuenta abierta={cuentaAbierta} alCerrar={() => setCuentaAbierta(false)} />
        <ActualizacionPwa />
      </div>
    </ProveedorExplotacion>
  )
}

// Nombre de la explotación actual. Si el usuario tiene varias, abre la lista para cambiar.
function SelectorExplotacion({ explotacion }: { explotacion: DetalleExplotacion }) {
  const explotaciones = useExplotaciones()
  const [abierto, setAbierto] = useState(false)
  const varias = (explotaciones.data?.length ?? 0) > 1

  if (!varias) {
    return (
      <span className={estilos.selector}>
        <span className={estilos.nombreExplotacion}>{explotacion.nombre}</span>
      </span>
    )
  }
  return (
    <>
      <button
        type="button"
        className={clases(estilos.selector, estilos.selectorBoton)}
        onClick={() => setAbierto(true)}
        aria-label={`Explotación: ${explotacion.nombre}. Cambiar de explotación`}
      >
        <span className={estilos.nombreExplotacion}>{explotacion.nombre}</span>
        <ChevronsUpDown aria-hidden size={18} />
      </button>
      <HojaInferior
        abierta={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Cambiar de explotación"
      >
        <ListaExplotaciones
          explotaciones={explotaciones.data ?? []}
          actual={explotacion.id}
          alElegir={() => setAbierto(false)}
        />
      </HojaInferior>
    </>
  )
}

function HojaCuenta({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const sesion = useSesion()
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const cerrarSesion = useCerrarSesion()
  const usuario = sesion.data?.usuario
  const ir = (ruta: string) => {
    alCerrar()
    navegar(ruta)
  }

  return (
    <HojaInferior abierta={abierta} alCerrar={alCerrar} titulo="Tu cuenta">
      {usuario && (
        <div className={estilos.usuario}>
          <span className={estilos.nombreUsuario}>{usuario.name}</span>
          <span className={estilos.datosUsuario}>
            {usuario.username} · {usuario.email}
          </span>
        </div>
      )}
      {explotacion.modulos.includes('administracion') && (
        <Boton
          variante="secundario"
          anchoCompleto
          icono={<Users aria-hidden size={20} />}
          onClick={() => ir(`${rutaExplotacion(explotacion.id)}/equipo`)}
        >
          Equipo
        </Boton>
      )}
      {explotacion.modulos.includes('administracion') && (
        <Boton
          variante="secundario"
          anchoCompleto
          icono={<Settings aria-hidden size={20} />}
          onClick={() => ir(`${rutaExplotacion(explotacion.id)}/datos`)}
        >
          Datos de la explotación
        </Boton>
      )}
      {usuario?.propietario && (
        <Boton
          variante="secundario"
          anchoCompleto
          icono={<Building2 aria-hidden size={20} />}
          onClick={() => ir('/plataforma')}
        >
          Gestionar las explotaciones
        </Boton>
      )}
      <Boton
        variante="secundario"
        anchoCompleto
        icono={<KeyRound aria-hidden size={20} />}
        onClick={() => ir(RUTA_CAMBIAR_CONTRASENA)}
      >
        Cambiar la contraseña
      </Boton>
      <Boton
        variante="texto"
        anchoCompleto
        className={estilos.salir}
        icono={<LogOut aria-hidden size={20} />}
        onClick={() => {
          alCerrar()
          cerrarSesion()
        }}
      >
        Cerrar sesión
      </Boton>
    </HojaInferior>
  )
}
