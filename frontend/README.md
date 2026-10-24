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
  proveedores.tsx   TanStack Query
  api/              cliente de la API: esquema.ts (generado) y cliente.ts
  diseno/           estructura común: cabecera y navegación adaptable
  paginas/          inicio, secciones (provisionales) y página no encontrada
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

- **Tokens** en `src/estilos/tokens.css`: colores (verde campo y paja), tipografía, espaciado, radios y medidas. Los componentes usan solo estas variables, nunca colores sueltos.
- **Modo claro y oscuro** automático según el sistema (`prefers-color-scheme`).
- **CSS Modules** por componente, sin librerías de estilos.
- **Navegación adaptable**: en el móvil, cabecera y navegación inferior con las cuatro secciones, respetando el área segura (`safe-area-inset`); desde 64rem de ancho, menú lateral y contenido más ancho para tablas y filtros.
- Objetivos táctiles de al menos 44 px.
- **Accesibilidad**: foco visible con teclado, enlace para saltar al contenido y `prefers-reduced-motion`.
- Iconos de [Lucide](https://lucide.dev) (`lucide-react`).

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

- **Manifest**: nombre, color `#2e6b30`, pantalla completa e iconos (normales, *maskable* para Android y `apple-touch-icon` para iOS).
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
