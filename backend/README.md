# Marela · Backend

API REST de Marela en **Node.js 24 + TypeScript** con **Hono**. Incluye la base de datos PostgreSQL (esquema y migraciones con Drizzle, separación por explotación y datos de ejemplo) y la autenticación con Better Auth.

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
| `npm run db:generate -- --name <descripcion>` | Genera la migración de un cambio del esquema |
| `npm run db:migrate` | Aplica las migraciones pendientes (el backend también lo hace al arrancar) |
| `npm run db:check` | Falla si el esquema tiene cambios sin migración (lo ejecuta la CI) |
| `npm run db:seed` | Carga los datos de ejemplo; se niega con `ENTORNO=produccion` |
| `npm run crear-propietario` | Crea el propietario de la plataforma (ver "Autenticación") |

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `ENTORNO` | | Obligatoria: `desarrollo`, `pruebas` o `produccion`. En producción no se publica la documentación de la API |
| `DATABASE_URL` | | Obligatoria. Cadena de conexión a PostgreSQL |
| `TZ` | | Obligatoria y debe ser `Europe/Madrid` |
| `PORT` | `3000` | Puerto HTTP |
| `DB_POOL_MAX` | `10` | Conexiones máximas del pool de PostgreSQL |
| `DB_TIMEOUT_CONEXION_MS` | `5000` | Tiempo máximo para obtener una conexión |
| `BETTER_AUTH_SECRET` | | Obligatoria. Clave de al menos 32 caracteres con la que se firman las sesiones, distinta en cada entorno (`openssl rand -base64 32`) |
| `URL_PUBLICA` | | Obligatoria. Dirección desde la que se abre la aplicación (`https://servidor.tailnet.ts.net:8444`). Solo se aceptan peticiones de autenticación desde ella |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `TEST_DATABASE_URL` | | Base de datos de los tests; debe terminar en `_test`. Si no está, se usa `DATABASE_URL` |
| `CHOKIDAR_USEPOLLING` | `false` | `true` para que `npm run dev` detecte cambios por sondeo (código montado desde Windows). En Compose se activa con `RECARGA_POLLING` |

La configuración se valida al arrancar (`src/config.ts`): si falta una variable o no es válida, el backend no arranca y dice cuál.

## API

```
src/
  index.ts        arranque del servidor y cierre ordenado
  app.ts          crearApp(): middleware, errores, rutas y documentación
  auth.ts         Better Auth: inicio de sesión, sesiones y rutas publicadas
  usuarios.ts     alta, desactivación y reactivación de usuarios
  permisos.ts     autorización por explotación y rol
  config.ts       configuración validada
  errores.ts      formato de error común y ErrorApi
  peticiones.ts   log de cada petición
  db/cliente.ts   pool de PostgreSQL, Drizzle y comprobación de la base de datos
  db/schema/      esquema de Drizzle
  db/explotacion.ts  enExplotacion(): acceso a los datos de una explotación
  db/migrar.ts    migraciones al arrancar
  db/seed.ts      datos de ejemplo
  rutas/          un archivo por módulo (salud, explotaciones)
  scripts/        exportación del contrato OpenAPI y crear-propietario
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

## Autenticación

Con [Better Auth](https://www.better-auth.com), en `src/auth.ts`, con los plugins de nombre de usuario y de organizaciones (cada organización es una explotación).

| Ruta | Qué hace |
|---|---|
| `POST /api/auth/sign-in/username` | Inicia sesión con `{ username, password }`; el usuario no distingue mayúsculas |
| `POST /api/auth/sign-in/email` | Inicia sesión con `{ email, password }` |
| `POST /api/auth/sign-out` | Cierra la sesión |
| `GET /api/auth/get-session` | Sesión y usuario actuales, o `null` |
| `POST /api/auth/change-password` | Cambia la contraseña con `{ currentPassword, newPassword }` |

Las demás rutas de Better Auth (registro, recuperación por email, gestión de organizaciones…) responden 404: lo que haga falta se expone con rutas propias. Los errores de estas rutas tienen el formato de Better Auth, `{ code, message }`.

- **Sesión:**
  - En una cookie `HttpOnly` y `SameSite=Lax`, `Secure` salvo en desarrollo (entonces se llama `marela.session_token`; con `Secure`, `__Secure-marela.session_token`).
  - Dura 30 días y se renueva con el uso una vez al día.
- **Seguridad:**
  - Las peticiones `POST` solo se aceptan desde `URL_PUBLICA` (403 `origen_no_permitido` desde otro origen).
  - Límite de intentos de inicio de sesión: 5 por minuto desde cada IP (429). La IP es la de `X-Real-IP`, que fija nginx.
- **Contraseñas:**
  - De al menos 10 caracteres.
  - Los usuarios se crean con una contraseña temporal (`debeCambiarContrasena` en el usuario de la sesión). Al cambiarla deja de serlo. GH-8 impedirá usar el resto de la API mientras sea temporal.
- **Usuarios desactivados:** `desactivarUsuario()` (`src/usuarios.ts`) cierra todas sus sesiones, y ya no pueden iniciar sesión (403 `USUARIO_DESACTIVADO`) hasta que se reactiven.
- **Logs:** los mensajes de Better Auth van al log de la aplicación.

### Crear el propietario de la plataforma

No hay registro público. El propietario se crea desde el servidor, y él crea después las explotaciones y sus administradores:

```
docker compose exec backend node dist/scripts/crear-propietario.js       # servidor
docker compose -f docker-compose.dev.yml exec backend npm run crear-propietario   # desarrollo
```

Pregunta el nombre de usuario, el nombre y el email, o se pueden indicar con `--usuario`, `--nombre` y `--email`. Muestra una contraseña temporal, que se pide cambiar en el primer inicio de sesión.

## Permisos

Toda la autorización está en `src/permisos.ts` y se aplica siempre en el backend; el frontend solo oculta lo que el usuario no puede hacer.

| Middleware | Para | Responde |
|---|---|---|
| `requiereSesion()` | rutas del usuario | 401 `no_autenticado` sin sesión; 403 `cambio_contrasena_obligatorio` con la contraseña temporal sin cambiar |
| `soloPropietario()` | rutas de la plataforma (crear explotaciones…) | además, 403 `sin_permiso` si no es el propietario |
| `permitir(modulo?)` | rutas `/explotaciones/{explotacionId}/...` | además, 404 `explotacion_no_encontrada` si no existe o no se pertenece a ella (tampoco el propietario, si no es miembro), y 403 `sin_permiso` si el rol no da acceso al módulo |

Módulos y roles (`PERMISOS`):

| Módulo | administrador | empleado |
|---|---|---|
| `animales`, `comida`, `fincas` | sí | sí |
| `finanzas` | sí | no |
| `administracion` (equipo y datos de la explotación) | sí | no |

Una ruta de datos se declara así, y sus consultas pasan por `enLaExplotacion`, que aplica la Row-Level Security con la explotación y el usuario de la petición:

```ts
const ruta = createRoute({
  method: 'get',
  path: '/explotaciones/{explotacionId}/animales',
  middleware: [permitir('animales')] as const,
  // ...
})
app.openapi(ruta, async (c) => c.json(await enLaExplotacion(c, (tx) => tx.select().from(animales)), 200))
```

Las peticiones que modifican datos en `/explotaciones/*` solo se aceptan desde `URL_PUBLICA`.

Rutas:

- **`GET /api/explotaciones`:** las explotaciones del usuario, con su rol, para elegir con cuál trabajar.
- **`GET /api/explotaciones/{explotacionId}`:** los datos de una explotación, el rol del usuario y los módulos a los que tiene acceso, para mostrar u ocultar secciones.

## Tests

```
docker compose -f docker-compose.dev.yml exec backend npm test      # desde la raíz del repositorio
```

- `test/api.test.ts`: salud, documentación y rutas inexistentes (con la base de datos sustituida).
- `test/config.test.ts`: validación de la configuración.
- `test/auth.test.ts`: inicio de sesión con usuario o email, cookie, límite de intentos, origen, cierre, caducidad y renovación de la sesión, usuario desactivado, cambio de contraseña y alta de usuarios.
- `test/permisos.test.ts`: la matriz de permisos con usuarios y sesiones reales: módulos por rol, pertenencia, propietario, contraseña temporal, origen y la explotación aplicada a la Row-Level Security.
- `test/separacion.test.ts`: separación por explotación, auditoría y reglas del esquema, contra PostgreSQL.

Los tests usan la base de datos de `TEST_DATABASE_URL`, que se crea si no existe y recibe las migraciones antes de empezar. Su nombre debe terminar en `_test`, porque los tests escriben en ella.

## Base de datos

PostgreSQL 18 con Drizzle ORM. Los identificadores son UUID v7 generados por PostgreSQL (`uuidv7()`). Las migraciones están en `drizzle/` y el backend aplica las pendientes al arrancar.

### Usuarios y explotaciones

Son las tablas de Better Auth (`user`, `session`, `account`, `verification`) con sus plugins:

- **Usuario:** inicio de sesión con nombre de usuario o email, los dos obligatorios y únicos. `propietario` identifica al propietario de la plataforma, `activo` permite desactivarlo y `debeCambiarContrasena` marca una contraseña temporal.
- **Organizaciones:** cada `organization` es una explotación, con su código REGA (`ES` y 12 dígitos, único). `member` guarda el rol del usuario en cada explotación: `administrador` o `empleado`.

### Separación por explotación

Todas las explotaciones comparten la base de datos, y Row-Level Security de PostgreSQL impide que una vea los datos de otra. Cada tabla de datos (animales, comida, fincas, finanzas) se define con las piezas de `src/db/schema/explotacion.ts`:

```ts
export const animales = pgTable(
  'animales',
  { id: id(), ...deExplotacion(), crotal: text('crotal').notNull(), ...auditoria() },
  (t) => [index('animales_explotacion_idx').on(t.explotacionId), separacionPorExplotacion()],
)
```

- `deExplotacion()`: columna `explotacion_id`, que al insertar toma la explotación de la transacción.
- `auditoria()`: `creado_en`, `creado_por`, `modificado_en` y `modificado_por`. El usuario sale de la transacción.
- `separacionPorExplotacion()`: activa Row-Level Security con una política que solo deja leer y escribir filas de la explotación de la transacción.

Las consultas a esas tablas se hacen siempre dentro de `enExplotacion`:

```ts
const animales = await enExplotacion({ explotacionId, usuarioId }, (tx) => tx.select().from(animales))
```

`enExplotacion` abre una transacción con el rol `marela_app` y fija en ella la explotación y el usuario. La política se aplica a ese rol. Sin explotación fijada no se ve ninguna fila, y fuera de `enExplotacion` el backend usa el rol de la conexión, al que la política no se aplica. La migración `0000_rol_aplicacion` crea el rol y las funciones `explotacion_actual()` y `usuario_actual()`.

La modificación de la auditoría se actualiza en los `update` de Drizzle, no en SQL escrito a mano.

### Cambiar el esquema

1. Modifica `src/db/schema/`.
2. Genera la migración: `npm run db:generate -- --name descripcion_del_cambio`.
3. Revisa el SQL generado en `drizzle/` y súbelo junto con el cambio del esquema.

Para SQL que Drizzle no genera (funciones, permisos), crea una migración vacía con `npm run db:generate -- --custom --name descripcion` y escríbelo en ella.

### Datos de ejemplo

`npm run db:seed` carga dos explotaciones con sus usuarios. Es idempotente: se puede ejecutar varias veces sin duplicar nada. Todos los usuarios tienen la contraseña `marela-dev` y su email es `<usuario>@marela.test`.

| Usuario | Acceso |
|---|---|
| `propietario` | Propietario de la plataforma |
| `ana` | Administradora de A Veiga y empleada de O Souto |
| `xose` | Administrador de O Souto |
| `maria` | Empleada de A Veiga |
| `brais` | Empleado de O Souto |

## Desarrollo

Lo habitual es arrancarlo con el resto de servicios desde la raíz del repositorio (ver el README principal):

```
docker compose -f docker-compose.dev.yml up
```

Para trabajar solo en el backend, sin Docker: `npm install` y `npm run dev`, con `DATABASE_URL` apuntando a un PostgreSQL 18. La API queda en `http://localhost:3000/api/health`.

## Imagen Docker

El `Dockerfile` tiene varias etapas:

- `dev`: dependencias completas; ejecuta `npm run dev` con el código montado desde el host.
- `runtime` (la final): solo el código compilado, las migraciones y las dependencias de producción, con el usuario `node` sin privilegios.

```
docker build -t marela-backend .
```
