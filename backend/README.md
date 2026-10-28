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
  explotaciones.ts  alta, edición y desactivación de explotaciones; punto de extensión al crear
  miembros.ts     equipo de una explotación: altas, roles, desactivación y contraseñas
  animales.ts     fichas de los animales
  fechas.ts       fechas en la zona horaria de España
  config.ts       configuración validada
  errores.ts      formato de error común y ErrorApi
  peticiones.ts   log de cada petición
  db/cliente.ts   pool de PostgreSQL, Drizzle y comprobación de la base de datos
  db/schema/      esquema de Drizzle
  db/explotacion.ts  enExplotacion(): acceso a los datos de una explotación
  db/migrar.ts    migraciones al arrancar
  db/seed.ts      datos de ejemplo
  rutas/          un archivo por módulo (salud, explotaciones, miembros, plataforma, animales)
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
- **`PATCH /api/explotaciones/{explotacionId}`:** el administrador edita el nombre, el REGA, el municipio y la provincia.

Una explotación desactivada no aparece en la lista de sus miembros, y sus rutas responden 403 `explotacion_desactivada`.

## Animales

Rutas del módulo `animales` (administrador y empleado), en `src/rutas/animales.ts`:

- **`GET /api/explotaciones/{id}/animales`:** lista ordenada por crotal, con búsqueda (`q`, en crotal, nombre y raza) y filtros (`estado`, `sexo`).
- **`GET /api/explotaciones/{id}/animales/{animalId}`:** la ficha, con la madre y el padre resumidos (`{ id, crotal, nombre }`).
- **`POST /api/explotaciones/{id}/animales`:** alta. El crotal se normaliza: sin espacios y en mayúsculas.
- **`PATCH /api/explotaciones/{id}/animales/{animalId}`:** edita los datos de la ficha (solo los campos que cambian, validando la ficha completa). El estado y la baja tienen su propio flujo.
- **`POST /api/explotaciones/{id}/animales/{animalId}/baja`:** `{ tipo, fecha, causa }` da de baja un animal activo: `muerte` o `sacrificio` (queda `muerto`), `robo_extravio` u `otra` (queda `baja`; `otra` exige la causa). La fecha no puede ser futura ni anterior al nacimiento o la entrada. La venta (`vendido`) la registra Finanzas (GH-38).
- **`DELETE /api/explotaciones/{id}/animales/{animalId}/baja`:** deshace una baja registrada por error; el animal vuelve a estar activo y la baja queda en el historial. Una venta no se deshace aquí (409 `baja_por_venta`).
- **`GET /api/explotaciones/{id}/animales/razas`:** razas para sugerir: las habituales y las que ya usa la explotación.

Reglas, comprobadas en la API (con el error en su campo) y en la base de datos:

- **Crotal:** `ES` y 12 dígitos, o el código de otro país y hasta 12 dígitos. Único en toda la plataforma (409 `crotal_en_uso`). Opcional, para los terneros que aún no lo tienen (GH-23); una vez puesto no se puede quitar. Los animales sin crotal van al final de la lista; `?crotal=sin` lista solo esos.
- **Madre y padre:** su ficha en la explotación, o un texto libre, nunca los dos. La madre es una hembra y el padre, un macho (trigger `comprobar_progenitores`). La misma explotación la garantizan claves foráneas compuestas. Un animal con hijos no puede cambiar de sexo (409 `sexo_con_hijos`).
- **Origen:** nacido en la explotación, o comprado con fecha de entrada y REGA de origen.
- **Fechas:** no futuras, y la de entrada no anterior al nacimiento.
- **Baja:** un animal activo no tiene tipo, fecha ni causa de baja; uno de baja tiene tipo y fecha, con el estado que corresponde al tipo, y causa si el tipo es `otra`.

### Pesos

Pesadas de cada animal, en `src/rutas/pesos.ts` (mismo módulo `animales`):

- **`GET /api/explotaciones/{id}/animales/{animalId}/pesos`:** las pesadas, de la más antigua a la más reciente. La ganancia entre pesadas la calcula el frontend.
- **`POST /api/explotaciones/{id}/animales/{animalId}/pesos`:** `{ fecha, kg, momento }` registra una pesada. `momento` es `nacimiento`, `destete`, `venta` u `otro` (por defecto); los tres primeros, como mucho una vez por animal (409 `momento_repetido`).
- **`PUT /api/explotaciones/{id}/animales/{animalId}/pesos/{pesoId}`:** corrige una pesada.
- **`DELETE /api/explotaciones/{id}/animales/{animalId}/pesos/{pesoId}`:** borra una pesada registrada por error y la devuelve, para poder deshacerlo. Queda en el historial.

Reglas: kilos mayores que 0 y hasta 2.000, con un decimal, y fecha no futura, entre el nacimiento y la baja del animal (trigger `comprobar_fecha_pesada`, migración `0009`).

### Reproducción

Eventos reproductivos, en `src/rutas/reproduccion.ts` (mismo módulo `animales`):

- **`GET /api/explotaciones/{id}/animales/{animalId}/reproduccion`:** su historial, del más reciente al más antiguo y con los anulados: sus eventos y los destetes de sus hijos.
- **`POST /api/explotaciones/{id}/reproduccion`:** `{ animalIds, tipo, fecha, padreId? | padreTexto?, metodo?, resultado?, pesoDestete?, observaciones? }` registra el mismo evento a uno o varios animales (hasta 500), todos o ninguno. `tipo` es `cubricion`, `inseminacion` (con el padre: un toro de la explotación o un texto), `diagnostico` (con `metodo` y `resultado`), `aborto` o `destete`. Los cuatro primeros, solo en hembras. Un destete con `pesoDestete` guarda también la pesada al destete.
- **`POST /api/explotaciones/{id}/reproduccion/{eventoId}/anulacion`:** `{ motivo }` anula un evento registrado por error (409 `ya_anulado`).

Como los tratamientos, un evento **no se corrige ni se borra** (trigger `proteger_evento_reproductivo`, migración `0013`). El trigger `comprobar_evento_reproductivo` exige hembra, fecha en la vida del animal y padre macho; un ternero se desteta una vez.

**Gestación:** `fecha_prevista_parto` es una columna generada, la fecha de la cubrición o inseminación más 283 días. La función `gestacion(animal)` da la gestación en curso: la última cubrición o inseminación posterior al último aborto o diagnóstico negativo, confirmada si hay un diagnóstico positivo. Las fichas de los animales llevan `gestacion` (`{ desde, fechaPrevistaParto, confirmada }` o `null`) y el listado se filtra con `?gestacion=en_curso`, ordenado por fecha prevista de parto.

### Partos

Partos, en `src/rutas/partos.ts` (mismo módulo `animales`):

- **`GET /api/explotaciones/{id}/animales/{animalId}/partos`:** los de una vaca, del más reciente al más antiguo, anulados incluidos, con sus terneros.
- **`POST /api/explotaciones/{id}/animales/{animalId}/partos`:** `{ fecha, tipo, padreId? | padreTexto?, observaciones?, terneros: [{ crotal?, sexo, estado, raza, peso? }] }` registra el parto y crea en la misma transacción la ficha de cada ternero (de 1 a 4), con `parto_id`. `tipo` es `normal` (por defecto), `con_ayuda` o `cesarea`; `estado`, `vivo` (por defecto) o `muerto`, que deja la ficha muerta con baja por muerte. Los terneros se enlazan a la madre y al padre de la gestación en curso; el padre del cuerpo solo cuenta si no la hay. El peso se guarda como su pesada al nacer. Un crotal repetido da 409 `crotal_en_uso` en `terneros.<n>.crotal`.
- **`POST /api/explotaciones/{id}/partos/{partoId}/anulacion`:** `{ motivo }` anula el parto y borra las fichas de sus terneros y sus pesadas al nacer, que quedan en el historial de cambios. 409 `terneros_con_datos` si algún ternero tiene otras pesadas, tratamientos, eventos o hijos.

Un parto no se corrige ni se borra (trigger `proteger_parto`, migración `0015`); `comprobar_parto` exige madre hembra, padre macho y fecha en la vida de la madre. El parto cierra la gestación en curso: la función `gestacion()` lo cuenta como cierre, como el aborto y el diagnóstico negativo, y devuelve también el padre de la cubrición o inseminación.

### Tratamientos

Tratamientos sanitarios, en `src/rutas/tratamientos.ts` (mismo módulo `animales`):

- **`GET /api/explotaciones/{id}/animales/{animalId}/tratamientos`:** los del animal, del más reciente al más antiguo, anulados incluidos.
- **`POST /api/explotaciones/{id}/tratamientos`:** `{ animalIds, fecha, producto, motivo, diasSupresion, dosis?, via?, diagnostico?, aplicadoPorId? | aplicadoPorTexto?, lote?, observaciones? }` registra el mismo tratamiento a uno o varios animales (hasta 500): uno por animal, todos o ninguno. `motivo` es `enfermedad`, `vacuna`, `desparasitacion` u `otro`. Quien lo administra es una persona del equipo (`aplicadoPorId`) o un nombre escrito (`aplicadoPorTexto`, el veterinario).
- **`POST /api/explotaciones/{id}/tratamientos/{tratamientoId}/anulacion`:** `{ motivo }` anula un tratamiento registrado por error (409 `ya_anulado` si ya lo está).
- **`GET /api/explotaciones/{id}/tratamientos/opciones`:** las personas activas del equipo y los productos ya usados, para el formulario.

Un tratamiento **no se corrige ni se borra**: se anula con un motivo y sigue en la ficha (trigger `proteger_tratamiento`, migración `0011`). La fecha, no futura y entre el nacimiento y la baja de cada animal, y quien lo administra, del equipo de la explotación (trigger `comprobar_tratamiento`).

**Supresión:** `fin_supresion` es una columna generada, la fecha más los días de supresión: el día en que termina. Un animal está en supresión mientras alguno de sus tratamientos sin anular termine después de hoy. Las fichas de los animales llevan `finSupresion` (el más lejano, o `null`) y el listado se filtra con `?supresion=en_curso`.

## Fincas

Fincas de la explotación y sus parcelas, en `src/rutas/fincas.ts` (módulo `fincas`):

- **`GET /api/explotaciones/{id}/fincas`:** lista por nombre, con búsqueda (`q`, en nombre y municipio) y filtros (`activa=true|false`, sin él todas; `seguridad=en_curso`). Cada finca lleva su superficie (la suma de sus parcelas), su número de parcelas y el fin de su plazo de seguridad en curso (`finSeguridad`).
- **`GET /api/explotaciones/{id}/fincas/{fincaId}`:** la ficha, con sus parcelas.
- **`POST /api/explotaciones/{id}/fincas`:** `{ nombre, municipio?, provincia?, regimen, observaciones?, parcelas: [{ provincia?, municipio?, poligono?, parcela?, recinto?, referenciaCatastral?, superficie }] }` da de alta la finca con al menos una parcela. `regimen` es `propiedad` (por defecto), `arrendamiento`, `aparceria`, `cesion` u `otro`.
- **`PUT /api/explotaciones/{id}/fincas/{fincaId}`:** cambia los datos y las parcelas: las que llegan con `id` se corrigen, las nuevas se añaden y las que faltan se quitan.
- **`PATCH /api/explotaciones/{id}/fincas/{fincaId}/estado`:** `{ activa }` desactiva o reactiva. Una finca no se borra.

Reglas: cada parcela, con la referencia SIGPAC completa (provincia, municipio, polígono, parcela y recinto, solo números) o la catastral, y superficie en hectáreas mayor que 0, con cuatro decimales. El nombre no se repite en la explotación (409 `nombre_en_uso`), ni un recinto SIGPAC en dos fincas (409 `recinto_en_uso`). Los cambios quedan en el historial (migración `0017`).

### Labores

Siembras, cosechas y otras labores de las fincas, en `src/rutas/labores.ts` (mismo módulo `fincas`):

- **`GET /api/explotaciones/{id}/fincas/{fincaId}/labores`:** las de una finca, de la más reciente a la más antigua.
- **`POST /api/explotaciones/{id}/labores`:** `{ fincaIds, tipo, fecha, cultivo?, labor?, superficie?, cantidad?, unidad?, realizadaPorId? | realizadaPorTexto?, observaciones? }` registra la misma labor en una o varias fincas activas, una por finca, todas o ninguna. `tipo` es `siembra` o `cosecha` (con `cultivo`) u `otra` (con `labor`: siega, laboreo…). Sin `superficie`, la de cada finca entera; con ella, solo para una finca y sin pasar de la suya. La cosecha admite `cantidad` con su `unidad`: `kg`, `t`, `pacas`, `rolos` o `remolques`.
- **`PUT /api/explotaciones/{id}/labores/{laborId}`:** corrige una labor.
- **`DELETE /api/explotaciones/{id}/labores/{laborId}`:** la borra y la devuelve, para poder deshacerlo.
- **`GET /api/explotaciones/{id}/labores/opciones`:** las personas activas del equipo y los cultivos y labores ya usados, para el formulario.

No son datos sanitarios: se corrigen y se borran, y los cambios quedan en el historial (migración `0019`, que comprueba también que quien la realiza es del equipo).

### Abono y fitosanitarios

Abonados y tratamientos fitosanitarios de las fincas, en `src/rutas/aplicaciones.ts` (mismo módulo `fincas`):

- **`GET /api/explotaciones/{id}/fincas/{fincaId}/aplicaciones`:** los de una finca, del más reciente al más antiguo, también los anulados.
- **`POST /api/explotaciones/{id}/aplicaciones`:** `{ fincaIds, tipo, fecha, producto, tipoAbono?, dosis, unidadDosis, superficie?, aplicadoPorId? | aplicadoPorTexto?, lote?, plaga?, diasSeguridad?, ropo?, equipo?, observaciones? }` registra el mismo abonado o tratamiento en una o varias fincas activas, uno por finca, todos o ninguno. `tipo` es `abono` (con `tipoAbono`: `mineral` u `organico`) o `fitosanitario` (con `plaga` y `diasSeguridad`; `ropo` y `equipo`, opcionales). La dosis es por hectárea, en `kg_ha`, `t_ha`, `l_ha` o `m3_ha`. La superficie, como en las labores.
- **`POST /api/explotaciones/{id}/aplicaciones/{aplicacionId}/anulacion`:** `{ motivo }` lo anula (409 `ya_anulado` si ya lo está).
- **`GET /api/explotaciones/{id}/aplicaciones/opciones`:** las personas activas del equipo y los abonos, fitosanitarios, plagas y equipos ya usados, para el formulario.

Como los tratamientos de los animales, no se corrigen ni se borran: se anulan con un motivo, y los cambios quedan en el historial (migración `0021`, que lo impide en la base de datos y comprueba que quien lo aplica es del equipo).

**Plazo de seguridad:** `fin_seguridad` es una columna generada, la fecha más los días del plazo: el día en que termina, desde el que se puede cosechar o pastar. Una finca está en plazo mientras alguno de sus fitosanitarios sin anular termine después de hoy. Las fincas llevan `finSeguridad` (el más lejano, o `null`) y el listado se filtra con `?seguridad=en_curso`.

## Historial de cambios

Cada alta, cambio o borrado de una tabla de datos queda en `historial_cambios`: tabla, fila, operación (`alta`, `cambio`, `borrado`), usuario, fecha, y el estado anterior y el nuevo en JSON. Lo rellena el trigger `registrar_cambio()` (migración `0006`), que se añade a cada tabla nueva. Está separado por explotación, como los datos.

## Equipo

Rutas del administrador de la explotación (`permitir('administracion')`), en `src/rutas/miembros.ts`:

- **`GET /api/explotaciones/{id}/miembros`:** el equipo, activo y desactivado.
- **`POST /api/explotaciones/{id}/miembros`:** añade a una persona nueva (`{ tipo: 'nuevo', usuario, nombre, email, rol }`), cuya contraseña temporal se devuelve solo esta vez, o a alguien que ya usa Marela (`{ tipo: 'existente', usuario, rol }`).
- **`PATCH /api/explotaciones/{id}/miembros/{miembroId}`:** `{ rol }` o `{ activo }`.
  - Un miembro desactivado no puede entrar en la explotación (403 `miembro_desactivado`) y deja de verla en su lista. Si no tiene ninguna otra explotación, se cierran también sus sesiones.
  - La explotación nunca se queda sin un administrador activo (409 `ultimo_administrador`). Los cambios bloquean los miembros de la explotación para que dos a la vez no la dejen sin ninguno.
- **`POST /api/explotaciones/{id}/miembros/{miembroId}/restablecer-contrasena`:** contraseña temporal nueva y cierre de sus sesiones. Solo a quien pertenece únicamente a esta explotación (si no, 409 `otras_explotaciones`): así ningún administrador puede entrar como alguien que tiene acceso a explotaciones ajenas. Tampoco a uno mismo (409 `es_usted`).

## Plataforma

Rutas del propietario de la plataforma (`soloPropietario()`), en `src/rutas/plataforma.ts`:

- **`GET /api/plataforma/explotaciones`:** todas las explotaciones, activas y desactivadas, con su número de miembros.
- **`POST /api/plataforma/explotaciones`:** crea una explotación con su primer administrador, en una sola transacción. El administrador es un usuario nuevo (`{ tipo: 'nuevo', usuario, nombre, email }`), cuya contraseña temporal se devuelve solo esta vez, o uno que ya existe (`{ tipo: 'existente', usuario }`).
- **`PATCH /api/plataforma/explotaciones/{explotacionId}`:** `{ activa }` la desactiva o la reactiva. No se borra ningún dato.
- **`POST /api/plataforma/usuarios/restablecer-contrasena`:** `{ usuario }` da una contraseña temporal nueva a cualquier usuario, para quien trabaja en varias explotaciones.

El propietario no ve los datos de una explotación si no es miembro de ella.

**Punto de extensión:** lo que haya que preparar en cada explotación nueva (por ejemplo, los almacenes de comida por defecto del ciclo 5) se registra en `alCrearExplotacion` (`src/explotaciones.ts`). Se ejecuta en la misma transacción que el alta, así que si falla no se crea nada:

```ts
alCrearExplotacion.push(async (tx, explotacionId, creadorId) => {
  await enExplotacion(...) // o inserciones con tx
})
```

## Tests

```
docker compose -f docker-compose.dev.yml exec backend npm test      # desde la raíz del repositorio
```

- `test/api.test.ts`: salud, documentación y rutas inexistentes (con la base de datos sustituida).
- `test/config.test.ts`: validación de la configuración.
- `test/auth.test.ts`: inicio de sesión con usuario o email, cookie, límite de intentos, origen, cierre, caducidad y renovación de la sesión, usuario desactivado, cambio de contraseña y alta de usuarios.
- `test/animales.test.ts`: alta, búsqueda y filtros, separación por explotación, crotal, fechas y origen, madre y padre, edición, historial, razas, bajas y restricciones de la base de datos.
- `test/pesos.test.ts`: pesadas: registro, orden, validación, momento único, fechas en la vida del animal, corrección, borrado con historial, separación por explotación y restricciones.
- `test/labores.test.ts`: labores: siega en varias fincas con su superficie, siembra y cosecha con cantidad y unidad, validación, fincas desactivadas o de otra explotación, corrección y borrado con historial, opciones del formulario, separación por explotación y restricciones.
- `test/aplicaciones.test.ts`: abono y fitosanitarios: abonado en varias fincas con su superficie, plazo de seguridad en la ficha y en el filtro, validación de cada tipo, fincas desactivadas o de otra explotación, anulación con historial, opciones del formulario, separación por explotación y restricciones.
- `test/fincas.test.ts`: fincas: alta con varias parcelas y superficie total, validación, nombre y recinto únicos en la explotación, edición que corrige, añade y quita parcelas con historial, desactivación y filtro, separación por explotación y restricciones.
- `test/partos.test.ts`: partos: gemelos con el padre de la cubrición, un nacido muerto y la pesada al nacer, cierre de la gestación, padre indicado sin gestación, crotal puesto después y que no se quita, validación y todo o nada, anulación que borra los terneros, terneros con datos, separación por explotación y restricciones.
- `test/reproduccion.test.ts`: eventos reproductivos: cubrición a varias vacas y fecha prevista de parto, inseminación con dosis externa y diagnóstico positivo, cierre por diagnóstico negativo o aborto, filtro de gestantes, solo hembras y padre macho, destete con su pesada y en el historial de la madre, anulación con historial, separación por explotación y restricciones.
- `test/tratamientos.test.ts`: tratamientos: registro a varios animales, quién lo administra, validación, animales y personas de otra explotación, fechas en la vida del animal, supresión en curso y su filtro, anulación con historial, opciones del formulario, separación por explotación, y que no se corrigen ni se borran.
- `test/miembros.test.ts`: altas nuevas y existentes, roles, desactivación con y sin otras explotaciones, último administrador y restablecimiento de contraseñas (también por el propietario).
- `test/plataforma.test.ts`: alta de explotaciones con administrador nuevo o existente, validación, REGA repetido, transacción y punto de extensión, desactivación y reactivación, y edición por el administrador.
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

`npm run db:seed` carga dos explotaciones con sus usuarios, y nueve animales en A Veiga (vacas, un toro propio, un toro comprado y terneros con su madre y su padre), con pesadas de una vaca y de dos terneros, y tratamientos: una desparasitación y una vacuna de las adultas, uno anulado y una ternera con neumonía hace tres días, en supresión; y eventos reproductivos: Marela gestante confirmada, Bonita vacía y cubierta después sin confirmar, Pinta con una cubrición anulada y el destete de la ternera de Marela; y partos: el de Marela de su ternera y el de Pinta hace cuatro días, de un ternero aún sin crotal; y cuatro fincas con sus parcelas SIGPAC, una arrendada y otra desactivada, y sus labores: la pradera de Agra de abaixo, sembrada, ensilada y segada, y el maíz de Chousa do monte; y sus abonados y tratamientos: purín y NPK en Agra de abaixo, con un herbicida de hace una semana en plazo de seguridad, y una urea anulada en Chousa do monte. Es idempotente: se puede ejecutar varias veces sin duplicar nada. Todos los usuarios tienen la contraseña `marela-dev` y su email es `<usuario>@marela.test`.

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
