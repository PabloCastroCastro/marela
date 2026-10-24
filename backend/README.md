# Marela · Backend

API REST de Marela en **Node.js 24 + TypeScript** con **Hono**. Incluirá la base de datos PostgreSQL (esquema y migraciones con Drizzle) y la autenticación con Better Auth.

Es un proyecto independiente: tiene sus propias dependencias y no importa código de `frontend/` ni de `proxy/`. Su contrato con el frontend es la API HTTP bajo `/api`, descrita en OpenAPI en [`openapi.json`](openapi.json).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arranca con recarga en caliente (`tsx watch`) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Arranca la versión compilada |
| `npm run lint` | Lint y formato con Biome; falla también con avisos |
| `npm run format` | Aplica el formato y las correcciones seguras de Biome |
| `npm run typecheck` | Comprueba los tipos sin compilar |
| `npm test` | Tests con Vitest |
| `npm run openapi` | Exporta el contrato a `openapi.json` |
| `npm run openapi:check` | Falla si `openapi.json` no coincide con la API (lo ejecuta la CI) |

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `ENTORNO` | | Obligatoria: `desarrollo`, `pruebas` o `produccion`. En producción no se publica la documentación de la API |
| `DATABASE_URL` | | Obligatoria. Cadena de conexión a PostgreSQL |
| `TZ` | | Obligatoria y debe ser `Europe/Madrid` |
| `PORT` | `3000` | Puerto HTTP |
| `DB_POOL_MAX` | `10` | Conexiones máximas del pool de PostgreSQL |
| `DB_TIMEOUT_CONEXION_MS` | `5000` | Tiempo máximo para obtener una conexión |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `TEST_DATABASE_URL` | | Base de datos de los tests |
| `CHOKIDAR_USEPOLLING` | `false` | `true` para que `npm run dev` detecte cambios por sondeo (código montado desde Windows). En Compose se activa con `RECARGA_POLLING` |

La configuración se valida al arrancar (`src/config.ts`): si falta una variable o no es válida, el backend no arranca y dice cuál.

## API

```
src/
  index.ts        arranque del servidor y cierre ordenado
  app.ts          crearApp(): middleware, errores, rutas y documentación
  config.ts       configuración validada
  errores.ts      formato de error común y ErrorApi
  peticiones.ts   log de cada petición
  db/cliente.ts   pool de PostgreSQL y comprobación de la base de datos
  rutas/          un archivo por módulo (por ahora, salud)
  scripts/        exportación del contrato OpenAPI
```

- **Rutas** con `@hono/zod-openapi`: el esquema de Zod valida la petición y a la vez genera el contrato OpenAPI.
- **Errores** con el formato `{ error: { codigo, mensaje, detalles? } }`:
  - validación → 400 `validacion`, con los campos que fallan en `detalles` y los mensajes de Zod en español;
  - ruta inexistente → 404 `no_encontrado`;
  - `throw new ErrorApi(409, 'crotal_en_uso', 'El crotal ya está registrado')` → ese estado y código;
  - cualquier otro error → 500 `error_interno`, sin detalles internos (que sí quedan en el log).
- **`GET /api/health`**: 200 si la API y la base de datos funcionan; 503 si PostgreSQL no responde, lo que marca el contenedor como no sano.
- **Documentación** interactiva en `/api/docs` (Scalar) y contrato en `/api/openapi.json`, salvo con `ENTORNO=produccion`. Tras cambiar la API, actualiza el contrato versionado con `npm run openapi`.
- **Logs** con pino: JSON de una línea en pruebas y producción, legibles en desarrollo. Cada petición registra método, ruta, estado y duración, sin cuerpos, cabeceras ni parámetros; los healthchecks solo con `LOG_LEVEL=debug`.

## Tests

```
docker compose -f docker-compose.dev.yml exec backend npm test      # desde la raíz del repositorio
```

- `test/api.test.ts`: salud, documentación y rutas inexistentes (con la base de datos sustituida).
- `test/config.test.ts`: validación de la configuración.

## Desarrollo

Lo habitual es arrancarlo con el resto de servicios desde la raíz del repositorio (ver el README principal):

```
docker compose -f docker-compose.dev.yml up
```

Para trabajar solo en el backend, sin Docker: `npm install` y `npm run dev`, con `DATABASE_URL` apuntando a un PostgreSQL 18. La API queda en `http://localhost:3000/api/health`.

## Imagen Docker

El `Dockerfile` tiene varias etapas:

- `dev`: dependencias completas; ejecuta `npm run dev` con el código montado desde el host.
- `runtime` (la final): solo el código compilado y las dependencias de producción, con el usuario `node` sin privilegios.

```
docker build -t marela-backend .
```
