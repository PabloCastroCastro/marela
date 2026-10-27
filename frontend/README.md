# Marela · Frontend

Aplicación web de Marela: una **PWA** instalable en el móvil, en **React 19 + TypeScript + Vite**.

Es un proyecto independiente: tiene sus propias dependencias y no importa código de `backend/` ni de `proxy/`. Su relación con el resto es:

- **Con el backend:** llama a la API bajo `/api` en el mismo origen, con un cliente tipado generado del contrato `backend/openapi.json`.
- **Con el proxy:** `npm ci && npm run build` deja los estáticos en `dist/`. La imagen de `proxy/` los compila así y los sirve con nginx.

## Estructura

```
src/
  main.tsx          punto de entrada
  rutas.tsx         rutas (React Router)
  proveedores.tsx   TanStack Query, avisos y confirmación
  auth/             sesión, inicio de sesión, cambio de contraseña y rutas protegidas
  explotaciones/    explotaciones del usuario, elección, explotación activa y sus datos
  plataforma/       gestión de las explotaciones por el propietario
  animales/         lista, ficha, alta y edición de animales
  api/              cliente de la API: esquema.ts (generado) y cliente.ts
  diseno/           estructura de una explotación: cabecera, selector, cuenta y navegación adaptable
  componentes/      componentes comunes (botones, campos, hoja inferior, avisos, tabla…)
  paginas/          inicio, secciones (provisionales), catálogo de componentes y página no encontrada
  formato.ts        fechas, números, kilos y euros en español
  pwa/              aviso de versión nueva
  estilos/          tokens.css (variables de diseño) y base.css
public/             logo.svg e iconos de la PWA (generados)
test/               tests con Vitest y Testing Library
```

Cada sección (`animales/`, `comida/`, `fincas/`, `finanzas/`) tendrá su carpeta en `src/` cuando se desarrolle.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite en `http://localhost:5173` |
| `npm run build` | Comprueba los tipos y genera los estáticos y el service worker en `dist/` |
| `npm run preview` | Sirve localmente la versión compilada |
| `npm test` | Tests con Vitest |
| `npm run lint` / `npm run format` | Lint y formato con Biome |
| `npm run typecheck` | Comprueba los tipos |
| `npm run api:generar` | Regenera `src/api/esquema.ts` desde `../backend/openapi.json` |
| `npm run api:check` | Falla si `src/api/esquema.ts` no coincide con el contrato (lo ejecuta la CI) |
| `npm run iconos` | Genera los iconos de la PWA desde `public/logo.svg` |

## Diseño

- **Guía de diseño** en la skill [`diseno-frontend`](../.claude/skills/diseno-frontend/SKILL.md): normas (WCAG 2.2 AA, Material 3 y Apple HIG), paleta, componentes, plantillas de pantalla, animaciones y lista de accesibilidad.
- **Tokens** en `src/estilos/tokens.css`: colores (verde oliva con acento ciruela, sobre grises con un toque verdoso), tipografía, espaciado, radios, elevación, medidas y movimiento. Los componentes usan solo estas variables, nunca colores sueltos.
- **Modo claro y oscuro** automático según el sistema (`prefers-color-scheme`).
- **CSS Modules** por componente, sin librerías de estilos.
- **Navegación adaptable**: en el móvil, cabecera y navegación inferior con las cuatro secciones, respetando el área segura (`safe-area-inset`); desde 64rem de ancho, menú lateral y contenido más ancho para tablas y filtros.
- Objetivos táctiles de al menos 44 px.
- **Accesibilidad**: foco visible con teclado, enlace para saltar al contenido y `prefers-reduced-motion`.
- Iconos de [Lucide](https://lucide.dev) (`lucide-react`).

## Sesión y explotaciones

| Ruta | Pantalla |
|---|---|
| `/entrar` | Inicio de sesión con usuario o email (sin sesión) |
| `/cambiar-contrasena` | Cambio de contraseña; obligatorio, sin poder ir a otra pantalla, mientras sea temporal |
| `/` | Abre la única explotación o la última usada en este dispositivo; si no, a elegir |
| `/explotaciones` | Elegir explotación (con una sola, entra directamente) |
| `/explotaciones/:explotacionId/...` | La aplicación, dentro de una explotación: inicio, `animales` (lista) y `animales/:animalId` (ficha), `comida`, `fincas`, `finanzas`, y para el administrador `datos` (los de la explotación) y `equipo` (personas, roles, desactivación y contraseñas) |
| `/plataforma` | Gestión por el propietario de la plataforma: lista de explotaciones, alta con su primer administrador, desactivar o reactivar, y restablecer la contraseña de cualquier usuario |

- **Rutas protegidas:** todas menos `/entrar` exigen sesión (`RutaProtegida`). Sin ella llevan al inicio de sesión y, al entrar, se vuelve a donde se estaba. Si una consulta responde 401 (sesión caducada), la sesión se da por cerrada y pasa lo mismo.
- **Sesión:** se consulta con `useSesion()` (`src/auth/sesion.ts`), que llama a las rutas de Better Auth (`/api/auth/...`). No están en el contrato OpenAPI, así que sus errores se traducen ahí.
- **Explotación activa:** va en la URL. `useExplotacionActual()` da su nombre, el rol y los módulos a los que da acceso. Se recuerda la última usada en `localStorage`.
- **Rol:** la navegación muestra solo las secciones de los módulos del rol (el empleado no ve Finanzas), y `<SoloModulo>` bloquea la sección si se entra por la dirección. El backend lo comprueba igualmente.
- **Selector y cuenta:** el selector de explotación está en la cabecera en el móvil y en el menú lateral en pantalla ancha. La cuenta (cambiar contraseña y cerrar sesión) se abre desde el icono de la cabecera.

Las pantallas se prueban con una API simulada (`test/simulacion.ts`) que reproduce la sesión y las explotaciones.

## Componentes

Componentes propios en `src/componentes/`, cada uno con su `.module.css`, según la skill [`diseno-frontend`](../.claude/skills/diseno-frontend/SKILL.md):

| Archivo | Componentes |
|---|---|
| `Boton.tsx` | `Boton` (`primario`, `secundario`, `texto`, `peligro`; `compacto`, `normal`, `grande`; `cargando`) y `BotonIcono` |
| `Campo.tsx` | `Campo`, `CampoFecha`, `AreaTexto` y `Selector`, con etiqueta, ayuda y error |
| `HojaInferior.tsx` | Hoja que sube desde abajo en el móvil (se cierra arrastrando el asa) y diálogo centrado desde 40rem |
| `Confirmacion.tsx` | `useConfirmacion()`: `await confirmar({ titulo, textoConfirmar, peligrosa })` |
| `Avisos.tsx` | `useAvisos()`: `avisar({ tipo, mensaje, accion })`; los de éxito duran 4 s y los de error se quedan |
| `Estados.tsx` | `EstadoVacio`, `EstadoError` (con Reintentar), `Cargando` y `Esqueleto` |
| `Etiquetas.tsx` | `Insignia`, `Chip`, `Chips` (selección única) y `Tarjeta` |
| `Tabla.tsx` | Tabla con ordenación desde 40rem; en el móvil, lista de tarjetas |
| `Filtros.tsx` | `BarraFiltros`, `Buscador` (avisa 300 ms después de dejar de escribir) y `FiltroDesplegable` ("Estado: Activos ▾": un desplegable nativo con forma de chip, marcado cuando no está en su valor por defecto) |
| `BotonFlotante.tsx` | Acción de crear en el móvil, encima de la barra inferior; en pantalla ancha no se muestra |
| `iconos.ts` | Iconos propios con el estilo de Lucide (`Vaca`) |

`useAvisos` y `useConfirmacion` necesitan sus proveedores, que ya pone `Proveedores` (`src/proveedores.tsx`).

**Catálogo:** en desarrollo, `/componentes` muestra todos los componentes con ejemplos, y un selector para verlos en claro u oscuro sin cambiar el sistema (`data-tema` en `<html>`). No existe en la versión compilada. Cada componente común nuevo se añade al catálogo.

`test/estilos.test.ts` comprueba que ningún `.module.css` usa colores sueltos, que ninguna clase se define dos veces en un módulo y que el tema oscuro forzado tiene los mismos valores que el del sistema.

## API

```ts
import { api, datos } from './api/cliente'

const salud = useQuery({ queryKey: ['salud'], queryFn: () => datos(api.GET('/api/health')) })
```

- `api` es un cliente de [openapi-fetch](https://openapi-ts.dev/openapi-fetch/) tipado con `src/api/esquema.ts`: una ruta, un parámetro o un campo que no existan no compilan.
- `datos()` devuelve los datos o lanza un `ErrorApi` con el `codigo`, el `mensaje` y los `detalles` del formato de error común. `enviar()` hace lo mismo para respuestas sin datos (204), y `erroresPorCampo()` convierte los errores de validación en `{ campo: mensaje }`.
- Cuando cambie la API, regenera el cliente con `npm run api:generar` y súbelo junto con el cambio; la imagen del proxy compila el frontend sin el backend, así que el archivo generado se versiona.

El proyecto usa **TypeScript 5.9**: el generador (`openapi-typescript`) necesita la API de compilador de TypeScript 5.

## PWA

Con `vite-plugin-pwa`:

- **Manifest**: nombre, color `#9dad6f`, pantalla completa e iconos (normales, *maskable* para Android y `apple-touch-icon` para iOS).
- **Service worker** generado al compilar: guarda la aplicación para abrirla al instante. **La API no se cachea**. El trabajo sin conexión (Animales y Fincas) se añadirá en su propia issue.
- **Versiones nuevas**: no se activan solas; aparece el aviso "Hay una versión nueva de Marela" con el botón *Actualizar*.
- En desarrollo no hay service worker.

Para instalarla en el móvil hace falta HTTPS: en Android, *Instalar aplicación*; en iOS, Safari → *Compartir* → *Añadir a pantalla de inicio*.

## Desarrollo

Lo habitual es arrancarlo con el resto de servicios desde la raíz del repositorio (ver el README principal). Los tests también se pueden ejecutar en el contenedor:

```
docker compose -f docker-compose.dev.yml exec frontend npm test
```

Para trabajar solo en el frontend, con el backend en `localhost:3000`: `npm install` y `npm run dev`.

### Variables de entorno (desarrollo)

| Variable | Por defecto | Descripción |
|---|---|---|
| `API_PROXY_TARGET` | `http://localhost:3000` | Adónde redirige Vite las peticiones a `/api` |
| `VITE_USE_POLLING` | `false` | `true` para detectar cambios por sondeo (código montado desde Windows). En Compose se activa con `RECARGA_POLLING` |

## Imagen Docker

El `Dockerfile` tiene dos etapas:

- `dev`: ejecuta el servidor de Vite con el código montado desde el host.
- `build`: compila los estáticos en `/app/dist`, útil para comprobar la compilación de forma aislada.

```
docker build --target build -t marela-frontend-build .
```
