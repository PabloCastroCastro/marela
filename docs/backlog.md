# Marela · Plan de ciclos y backlog

Plan de trabajo de Marela: ciclos, etiquetas, milestones e issues. Las decisiones funcionales y técnicas están en el [documento de diseño](diseno.md); el flujo de trabajo, en la [guía de contribución](../CONTRIBUTING.md).

## 1. Plan de ciclos

| Ciclo | Objetivo | Versión |
|---|---|---|
| 1 · Base, usuarios y explotaciones | Tres proyectos funcionando, CI, inicio de sesión, explotaciones, usuarios y roles, componentes base y entorno de pruebas en el servidor | v0.1.0 |
| 2 · Animales: fichas | Ficha del animal, altas y bajas | v0.2.0 |
| 3 · Animales: sanidad y reproducción | Tratamientos con periodo de supresión, pesos, eventos reproductivos y partos | v0.3.0 |
| 4 · Fincas | Ficha de la finca, labores, abono y fitosanitarios, y pastoreo | v0.4.0 |
| 4b · Fincas en el mapa | Parcelas desde el mapa o por su referencia SIGPAC o catastral, y mapa de las fincas | v0.5.0 |
| 5 · Comida | Almacenes, entradas, salidas, ajustes de inventario y stock | v0.6.0 |
| 6 · Sin conexión | Registro y consulta sin cobertura en Animales y Fincas, con sincronización | v0.7.0 |
| 6b · Reposición y mantenimiento | Animales no aptos para reposición, maquinaria e infraestructuras, y tareas de mantenimiento | v0.8.0 |
| 7 · Finanzas | Régimen fiscal, facturas, otros ingresos y gastos, ventas, informes y exportación. Primera versión completa y despliegue en producción | v1.0.0 |
| 8 · Operación | Copias de seguridad automáticas, copia fuera del servidor y restauración | v1.1.0 |
| 9 · Correo | Envío de correo, invitaciones y recuperación de contraseña por email | v1.2.0 |
| 10 · Exposición pública | Dominio propio, acceso sin Tailscale y bastionado | v2.0.0 |
| Más adelante | Ideas sin ciclo asignado | — |

## 2. Etiquetas

| Nombre | Color | Descripción |
|---|---|---|
| feature | `1f8a5b` | Nueva funcionalidad |
| bug | `c93b3b` | Algo no funciona |
| hotfix | `b60205` | Fallo en producción |
| db | `5319e7` | Requiere migración de base de datos |
| backend | `0e8a16` | API Node |
| frontend | `1d76db` | React / PWA |
| infra | `fbca04` | Docker, despliegue, CI |
| seguridad | `d93f0b` | Seguridad y bastionado |
| investigacion | `c5def5` | Prueba de concepto o investigación previa |

## 3. Milestones

| Título | Descripción |
|---|---|
| Ciclo 1 · Base, usuarios y explotaciones | Tres proyectos funcionando, CI, inicio de sesión, explotaciones, usuarios y roles, componentes base y entorno de pruebas en el servidor (v0.1.0) |
| Ciclo 2 · Animales: fichas | Ficha del animal, altas y bajas (v0.2.0) |
| Ciclo 3 · Animales: sanidad y reproducción | Tratamientos con periodo de supresión, pesos, eventos reproductivos y partos (v0.3.0) |
| Ciclo 4 · Fincas | Ficha de la finca, labores, abono y fitosanitarios, y pastoreo (v0.4.0) |
| Ciclo 4b · Fincas en el mapa | Parcelas desde el mapa o por su referencia SIGPAC o catastral, y mapa de las fincas (v0.5.0) |
| Ciclo 5 · Comida | Almacenes, entradas, salidas, ajustes de inventario y stock (v0.6.0) |
| Ciclo 6 · Sin conexión | Registro y consulta sin cobertura en Animales y Fincas, con sincronización (v0.7.0) |
| Ciclo 6b · Reposición y mantenimiento | Animales no aptos para reposición, maquinaria e infraestructuras, y tareas de mantenimiento asignadas al equipo (v0.8.0) |
| Ciclo 7 · Finanzas | Régimen fiscal, facturas, otros ingresos y gastos, ventas, informes y exportación. Primera versión completa y despliegue en producción (v1.0.0) |
| Ciclo 8 · Operación | Copias de seguridad automáticas, copia fuera del servidor y restauración (v1.1.0) |
| Ciclo 9 · Correo | Envío de correo, invitaciones y recuperación de contraseña por email (v1.2.0) |
| Ciclo 10 · Exposición pública | Dominio propio, acceso sin Tailscale y bastionado (v2.0.0) |
| Más adelante | Ideas sin ciclo asignado |

## 4. Issues

Formato de cada issue: encabezado con el número previsto, línea **Título**, línea **Etiquetas** y, a continuación, el cuerpo. Las referencias "Depende de #n" se enlazan solas en GitHub.

---

### Milestone: Ciclo 1 · Base, usuarios y explotaciones

#### GH-1
**Título:** Configuración del repositorio
**Etiquetas:** feature, infra

Dejar el repositorio preparado para el flujo de trabajo del documento de diseño.

**Criterios de aceptación**
- [ ] Plantillas de issue en `.github/ISSUE_TEMPLATE/`: funcionalidad (descripción, criterios de aceptación, capas afectadas) y fallo (entorno pruebas/producción, pasos, esperado/obtenido). Issues en blanco desactivadas
- [ ] Plantilla de pull request con `Closes #`, tipo de rama y comprobaciones
- [ ] `CONTRIBUTING.md` con ramas, commits, versiones, hotfix, migraciones y definición de terminado
- [ ] `.gitignore`, `.gitattributes`, `.editorconfig` y `README.md` inicial
- [ ] Documento de diseño y backlog en `docs/`

#### GH-2
**Título:** Estructura del repositorio y Docker Compose
**Etiquetas:** feature, infra

Tres proyectos independientes en el mismo repositorio, sin workspaces ni herramientas de monorepo. Cada uno tiene sus dependencias, lockfile, scripts, Dockerfile y README.

**Criterios de aceptación**
- [ ] Proyectos `frontend/` (React + Vite), `backend/` (Node + Hono) y `proxy/` (nginx), cada uno con su Dockerfile, `.dockerignore` y README; ninguno importa código de otro
- [ ] `docker-compose.dev.yml`: PostgreSQL, y backend y frontend con recarga en caliente; Vite redirige `/api` al backend
- [ ] `docker-compose.yml`: `db`, `backend` y `proxy` (nginx con los estáticos del frontend compilados en su imagen), con `restart: unless-stopped` y healthchecks
- [ ] `docker-compose.servidor.yml`: certificado de Tailscale montado en el proxy para servir HTTPS en 8443
- [ ] nginx: rutas de la PWA a `index.html`, `/api` hacia el backend, compresión, caché de estáticos y `client_max_body_size` configurable
- [ ] Solo `proxy` publica puerto; volúmenes `db-data` y `uploads`; rotación de logs en todos los servicios
- [ ] `.env.example` documentado; ningún secreto en el repositorio
- [ ] Dockerfiles multi-stage con imágenes finales ligeras y usuario no root
- [ ] README: cómo arrancar en local con un solo comando

#### GH-3
**Título:** API base con Hono
**Etiquetas:** feature, backend

Esqueleto del backend. Depende de #2.

**Criterios de aceptación**
- [ ] Configuración por variables de entorno validadas al arrancar, incluida la zona horaria (`TZ=Europe/Madrid`)
- [ ] Conexión a PostgreSQL con pool
- [ ] `GET /api/health` devuelve el estado de la API y de la base de datos (503 si no responde)
- [ ] Validación con Zod (mensajes en español) y formato de error común `{ error: { codigo, mensaje, detalles? } }`
- [ ] Contrato OpenAPI visible en desarrollo (`/api/docs`) y exportado a `backend/openapi.json`; `npm run openapi:check` falla si está desactualizado
- [ ] Logs de peticiones con pino, sin datos personales
- [ ] Vitest configurado

#### GH-4
**Título:** Frontend base: React + Vite como PWA
**Etiquetas:** feature, frontend

Depende de #2 y #3.

**Criterios de aceptación**
- [ ] React + TypeScript + Vite, React Router y TanStack Query
- [ ] `vite-plugin-pwa`: manifest, iconos y service worker; instalable en Android e iOS; aviso de versión nueva
- [ ] Tokens de diseño como variables CSS (verde campo); modo claro y oscuro
- [ ] Cliente de API generado desde `backend/openapi.json` con script para regenerarlo y comprobarlo
- [ ] Navegación adaptable: barra inferior en el móvil con área segura y menú lateral en pantalla ancha, con Animales, Comida, Fincas y Finanzas
- [ ] Página de inicio que consulta `/api/health`
- [ ] Vitest y Testing Library configurados

#### GH-5
**Título:** CI en pull requests
**Etiquetas:** feature, infra

GitHub Actions para validar cada pull request a `develop` y `main`. Depende de #2.

**Criterios de aceptación**
- [ ] Un trabajo por proyecto (`frontend`, `backend`, `proxy`) que solo se ejecuta si cambian sus archivos
- [ ] Lint, tipos, compilación y tests en frontend y backend; tests del backend con PostgreSQL como servicio del workflow
- [ ] Comprobación de migraciones pendientes (`db:check`, en cuanto exista) y de contrato OpenAPI y cliente al día
- [ ] Build de las imágenes de `backend` y `proxy` y validación de nginx (`nginx -t`), también con HTTPS
- [ ] Prueba de humo: `docker compose up` completo y `GET /api/health` a través del proxy
- [ ] Un trabajo final de resultado, que es la comprobación exigida para mergear

#### GH-6
**Título:** Esquema inicial de base de datos y migraciones
**Etiquetas:** feature, db, backend

Primeras tablas con Drizzle y sistema de migraciones. Depende de #3.

**Criterios de aceptación**
- [ ] Drizzle ORM con el esquema en `src/db/schema/` y migraciones SQL versionadas generadas con drizzle-kit
- [ ] Migraciones aplicadas automáticamente al arrancar el backend
- [ ] Tablas de Better Auth (usuarios, sesiones, cuentas) con el plugin de organizaciones: cada organización es una explotación, con su código REGA, y cada miembro tiene un rol (`administrador` o `empleado`)
- [ ] Marca de propietario de la plataforma en el usuario
- [ ] Identificadores UUID v7 generados por PostgreSQL
- [ ] Columnas comunes de auditoría reutilizables (creado y modificado: quién y cuándo)
- [ ] Separación por explotación: identificador de explotación en cada tabla de datos y Row-Level Security de PostgreSQL, con la explotación de la petición fijada en la transacción
- [ ] Script `npm run db:check` que falla si el esquema tiene cambios sin migración (lo ejecuta la CI)
- [ ] Seed de datos de ejemplo para desarrollo y pruebas (`npm run db:seed`, idempotente y que se niega a ejecutarse en producción): propietario, dos explotaciones, un usuario con rol distinto en cada una y empleados
- [ ] Tests contra una base de datos de test que comprueban que una explotación no ve datos de otra

#### GH-7
**Título:** Autenticación
**Etiquetas:** feature, backend, seguridad

Inicio de sesión con Better Auth. Depende de #6.

**Criterios de aceptación**
- [ ] Inicio de sesión con nombre de usuario o email, más contraseña; cierre de sesión y sesión actual bajo `/api/auth`
- [ ] Sesión en cookie `HttpOnly`, `Secure` (salvo en desarrollo) y `SameSite=Lax`, de 30 días y renovada con el uso
- [ ] Registro público desactivado
- [ ] Límite de intentos fallidos de inicio de sesión
- [ ] Solo se aceptan peticiones de autenticación desde `URL_PUBLICA`
- [ ] Cambio de contraseña, obligatorio en el primer inicio de sesión si la contraseña es temporal
- [ ] Al desactivar un usuario se revocan sus sesiones
- [ ] Comando CLI para crear desde el servidor el propietario de la plataforma
- [ ] Tests de inicio correcto, incorrecto, sesión caducada y usuario desactivado

#### GH-8
**Título:** Permisos por explotación y rol
**Etiquetas:** feature, backend, seguridad

Middleware de autorización para las rutas de una explotación. Depende de #7.

**Criterios de aceptación**
- [ ] Todas las rutas de datos cuelgan de `/api/explotaciones/:id/...` y exigen sesión y pertenencia a la explotación
- [ ] Roles: el administrador accede a todo en su explotación; el empleado, a Animales, Comida y Fincas, pero no a Finanzas
- [ ] El propietario de la plataforma gestiona explotaciones, pero no ve sus datos si no es miembro
- [ ] La explotación de la petición se aplica a la Row-Level Security de PostgreSQL
- [ ] Respuestas: 401 sin sesión, 404 si la explotación no existe o no se pertenece a ella, 403 si el rol no alcanza
- [ ] Tests de la matriz de permisos con usuarios y sesiones reales

#### GH-9
**Título:** Componentes base del frontend
**Etiquetas:** feature, frontend

Componentes propios con CSS Modules. Depende de #4.

**Criterios de aceptación**
- [ ] Botón (primario, secundario, peligro, texto; estado cargando), campo con etiqueta, ayuda y error, selector y campo de fecha
- [ ] Hoja inferior en el móvil que se muestra como diálogo en pantalla ancha
- [ ] Confirmación, avisos (toast) con acción opcional, estado vacío y cargando
- [ ] Tabla con ordenación para pantalla ancha que se convierte en lista de tarjetas en el móvil
- [ ] Barra de filtros (texto, fechas, selección)
- [ ] Catálogo de componentes en `/componentes`, solo en desarrollo, en claro y oscuro
- [ ] Objetivos táctiles de al menos 44 px y accesibles con teclado y lector de pantalla

#### GH-10
**Título:** Inicio de sesión y selector de explotación
**Etiquetas:** feature, frontend

Depende de #7, #8 y #9.

**Criterios de aceptación**
- [ ] Pantalla de inicio de sesión (usuario o email, y contraseña) con errores claros
- [ ] Cambio de contraseña obligatorio cuando es temporal
- [ ] Rutas protegidas: sin sesión, al inicio de sesión y, al entrar, de vuelta a donde se estaba
- [ ] La explotación activa va en la URL; con una sola explotación se entra directamente y con varias se elige
- [ ] Selector de explotación siempre visible (cabecera en el móvil, menú lateral en pantalla ancha); se recuerda la última usada
- [ ] Al empleado no le aparece Finanzas
- [ ] Cerrar sesión

#### GH-11
**Título:** Gestión de explotaciones (propietario de la plataforma)
**Etiquetas:** feature, backend, frontend

Depende de #8 y #10.

**Criterios de aceptación**
- [ ] El propietario ve la lista de explotaciones, crea una nueva (nombre, código REGA, municipio y provincia) y la desactiva
- [ ] Al crear una explotación se crea también su primer administrador: un usuario nuevo con contraseña temporal o uno existente por su nombre de usuario
- [ ] Al crear una explotación se crean sus almacenes de comida por defecto (cuando exista el ciclo 5) mediante un punto de extensión
- [ ] El administrador edita los datos de su explotación
- [ ] Tests de API y de pantalla

#### GH-12
**Título:** Gestión de usuarios de la explotación
**Etiquetas:** feature, backend, frontend, seguridad

El administrador gestiona a su equipo. Depende de #8 y #10.

**Criterios de aceptación**
- [ ] Lista de miembros con nombre, usuario, rol y estado
- [ ] Alta de un usuario nuevo con nombre de usuario, nombre, email y contraseña temporal que se muestra una sola vez
- [ ] Añadir a un usuario de otra explotación por su nombre de usuario, con el rol que corresponda
- [ ] Cambiar el rol, desactivar (revoca sus sesiones) y reactivar
- [ ] Restablecer la contraseña de un miembro (nueva contraseña temporal)
- [ ] Una explotación nunca se queda sin administrador activo
- [ ] Tests de API y de pantalla

#### GH-13
**Título:** Entorno de pruebas en el servidor
**Etiquetas:** feature, infra

Despliegue en la Raspberry Pi, solo por Tailscale. Depende de #2.

**Criterios de aceptación**
- [ ] `docs/servidor.md`: requisitos, directorios (`/opt/marela/pruebas` y `/opt/marela/pro`), `.env` de cada entorno, puertos propios (8444 y 9444) y certificado de Tailscale (se puede compartir con otras aplicaciones del servidor)
- [ ] `scripts/backup.sh pruebas|pro`: copia comprobada de la base de datos y copia del volumen `uploads` en `/opt/marela/backups`
- [ ] `scripts/deploy.sh pruebas|pro [tag]`: actualiza el código, hace copia con `backup.sh` antes de desplegar en producción, compila, levanta, espera a que esté sano, comprueba `/api/health` por HTTPS y lo apunta en `deploys.log`
- [ ] Entorno de pruebas desplegado desde `develop` y accesible por HTTPS desde el móvil, con la PWA instalable
- [ ] Datos de ejemplo cargados en pruebas
- [ ] ShellCheck de los scripts en la CI

---

### Milestone: Ciclo 2 · Animales: fichas

#### GH-14
**Título:** Esquema y API de animales
**Etiquetas:** feature, db, backend

Depende de #8.

**Criterios de aceptación**
- [ ] Tabla `animales`: crotal, raza, sexo, fecha de nacimiento, madre (enlace o texto libre, opcional), padre (enlace a toro propio o texto libre), origen (nacido en la explotación o comprado, con fecha de entrada y REGA de origen), estado (activo, vendido, muerto…), fecha y causa de baja, y observaciones
- [ ] Crotal con formato oficial validado y único entre los animales de la plataforma
- [ ] Madre y padre enlazados de la misma explotación; la madre es hembra y el padre, macho
- [ ] API: listar con búsqueda (crotal, raza) y filtros (estado, sexo), ver, crear y editar
- [ ] Auditoría en cada cambio
- [ ] Tests de API y de restricciones

#### GH-15
**Título:** Pantallas de animales
**Etiquetas:** feature, frontend

Depende de #9, #10 y #14.

**Criterios de aceptación**
- [ ] Listado con búsqueda y filtros: tarjetas en el móvil y tabla en pantalla ancha
- [ ] Ficha del animal con sus datos, madre y padre enlazados, e hijos
- [ ] Alta y edición en hoja inferior o diálogo, con errores por campo
- [ ] Estado vacío que invita a dar de alta el primer animal

#### GH-18
**Título:** Bajas de animales
**Etiquetas:** feature, backend, frontend

Depende de #14 y #15.

**Criterios de aceptación**
- [ ] Dar de baja un animal por muerte u otra causa, con fecha y causa
- [ ] Los animales de baja no aparecen en el listado por defecto, pero se pueden consultar con un filtro
- [ ] Deshacer una baja registrada por error
- [ ] Las bajas por venta se registran desde Finanzas (#38)

---

### Milestone: Ciclo 3 · Animales: sanidad y reproducción

#### GH-20
**Título:** Tratamientos
**Etiquetas:** feature, db, backend, frontend

Depende de #15.

**Criterios de aceptación**
- [ ] Registro: fecha, producto o medicamento, dosis, vía de administración, motivo (enfermedad, vacuna, desparasitación…), quién lo administra (usuario o texto libre), número de lote, periodo de supresión en días y observaciones
- [ ] Fecha de fin de supresión calculada y visible en la ficha del animal mientras esté en curso
- [ ] Registrar el mismo tratamiento a varios animales seleccionados a la vez
- [ ] Historial de tratamientos en la ficha
- [ ] Anular un tratamiento en lugar de borrarlo, con motivo
- [ ] Listado de animales con supresión en curso

#### GH-21
**Título:** Pesos
**Etiquetas:** feature, db, backend, frontend

Depende de #15.

**Criterios de aceptación**
- [ ] Registro de pesadas: fecha, kg y momento (nacimiento, destete, venta u otro)
- [ ] Historial de pesos en la ficha del animal
- [ ] Corregir o anular una pesada

#### GH-22
**Título:** Eventos reproductivos
**Etiquetas:** feature, db, backend, frontend

Depende de #15.

**Criterios de aceptación**
- [ ] Cubrición (monta natural) e inseminación artificial, con el padre como toro propio o dosis externa
- [ ] Fecha prevista de parto calculada desde la cubrición o inseminación
- [ ] Diagnóstico de gestación: fecha, método (ecografía o palpación) y resultado; si es negativo, se anula la fecha prevista de parto
- [ ] Aborto y destete
- [ ] Solo hembras para cubrición, inseminación, diagnóstico y aborto
- [ ] Historial reproductivo en la ficha de la vaca
- [ ] Listado de partos previstos

#### GH-23
**Título:** Partos
**Etiquetas:** feature, db, backend, frontend

Depende de #22.

**Criterios de aceptación**
- [ ] Registro del parto: fecha, tipo (normal, con ayuda, cesárea) y observaciones
- [ ] Uno o varios terneros por parto, cada uno con crotal, sexo, estado al nacer (vivo o muerto) y peso al nacer opcional
- [ ] Se crea la ficha de cada ternero, enlazada a la madre y al padre de la cubrición o inseminación; los nacidos muertos, con estado "muerto"
- [ ] El parto cierra la gestación en curso
- [ ] Todo en una sola transacción

#### GH-24
**Título:** Historial del animal
**Etiquetas:** feature, frontend

Depende de #20, #21, #22 y #23.

**Criterios de aceptación**
- [ ] Línea de tiempo en la ficha con todos los eventos del animal: alta, tratamientos, pesadas, eventos reproductivos, partos, traslados y baja
- [ ] Filtro por tipo de evento
- [ ] Acceso rápido desde la ficha a registrar cada tipo de evento

---

### Milestone: Ciclo 4 · Fincas

#### GH-25
**Título:** Fichas de las fincas
**Etiquetas:** feature, db, backend, frontend

Depende de #8 y #9.

**Criterios de aceptación**
- [ ] Ficha: nombre, superficie en hectáreas, referencia catastral (texto), referencia SIGPAC (provincia, municipio, polígono, parcela y recinto, texto), municipio y provincia, régimen (propiedad, arrendamiento…) y observaciones
- [ ] Listado, alta, edición y desactivación
- [ ] Listado en tarjetas en el móvil y tabla en pantalla ancha

#### GH-26
**Título:** Siembra, cosecha y otras labores
**Etiquetas:** feature, db, backend, frontend

Depende de #25.

**Criterios de aceptación**
- [ ] Siembra y cosecha: fecha, tipo de cultivo, superficie afectada, cantidad cosechada (cosecha), quién lo realiza (usuario o texto libre) y observaciones
- [ ] Otras labores (siega, laboreo, riego…): fecha, tipo de labor, superficie, quién y observaciones
- [ ] Historial de eventos en la ficha de la finca

#### GH-27
**Título:** Abono y fitosanitarios
**Etiquetas:** feature, db, backend, frontend

Depende de #25.

**Criterios de aceptación**
- [ ] Registro: fecha, producto, dosis por hectárea, superficie tratada, quién lo aplica (usuario o texto libre) y número de lote
- [ ] Solo fitosanitarios: plaga o motivo, plazo de seguridad con su fecha de fin calculada, número ROPO del aplicador y equipo de aplicación (opcionales)
- [ ] Aviso visible en la finca mientras haya un plazo de seguridad en curso
- [ ] Anular en lugar de borrar

#### GH-28
**Título:** Pastoreo
**Etiquetas:** feature, db, backend, frontend

Depende de #25.

**Criterios de aceptación**
- [ ] Registro: fecha de entrada, fecha de salida y número de animales, sin enlazar fichas
- [ ] Pastoreo en curso (sin fecha de salida) visible en la finca, con acción para registrar la salida
- [ ] Una finca no tiene dos pastoreos en curso a la vez

---

### Milestone: Ciclo 4b · Fincas en el mapa

#### GH-52
**Título:** Parcelas desde el mapa o por referencia
**Etiquetas:** feature, db, backend, frontend

Depende de #25.

Hoy cada parcela se registra a mano: la referencia SIGPAC o la catastral y la superficie. La idea es elegirlas en un mapa, o escribir solo la referencia, y que los datos se rellenen solos con los servicios públicos de SIGPAC y del Catastro.

**Criterios de aceptación**
- [ ] Al dar de alta o editar una finca, "Añadir desde el mapa" abre un mapa con la ortofoto y los recintos SIGPAC dibujados encima
- [ ] Al tocar un recinto se añade como parcela con su referencia SIGPAC, su superficie y su uso; el municipio y la provincia de la finca se rellenan si están vacíos
- [ ] Se pueden tocar varios recintos para la misma finca; tocar de nuevo uno lo quita
- [ ] Por referencia: al escribir una referencia SIGPAC o catastral completa, se consultan su superficie y su municipio
- [ ] Se guarda el contorno de cada parcela, para dibujarla después en el mapa de las fincas
- [ ] El mapa se centra en la posición del móvil si se permite o, si no, en el municipio de la explotación
- [ ] Si un servicio no responde o no hay conexión, se avisa con un error claro y se sigue pudiendo registrar a mano, como ahora

**Notas técnicas**
- Servicios públicos y gratuitos, a comprobar al empezar (direcciones, formatos y si admiten consultas desde el navegador):
  - SIGPAC (FEGA): consulta del recinto en un punto, con su referencia, superficie, uso y contorno.
  - Catastro: referencia catastral a partir de coordenadas, y datos y contorno de una referencia (servicios OVC e INSPIRE).
  - IGN: ortofoto PNOA de fondo.
- Las consultas pasan por el backend, con tiempo de espera, para no depender de que el servicio admita llamadas desde el navegador.
- La librería del mapa se carga solo en esta pantalla: el paquete del frontend ya pasa de 500 kB.
- Mostrar la atribución de cada fuente en el mapa.

#### GH-91
**Título:** Mapa de las fincas
**Etiquetas:** feature, backend, frontend

Depende de #52.

**Criterios de aceptación**
- [ ] En Fincas, una vista de mapa además de la lista, con las parcelas de cada finca dibujadas sobre la ortofoto
- [ ] Al tocar una finca, su nombre y superficie, y el acceso a su ficha
- [ ] Las fincas en pastoreo o en plazo de seguridad se distinguen en el mapa, como en el listado
- [ ] Los filtros de la lista (búsqueda y estado) se aplican también al mapa
- [ ] Las fincas registradas a mano, sin contorno, no salen en el mapa: se avisa de cuántas son, con la opción de completarlas desde el mapa
- [ ] En la ficha de la finca, un mapa pequeño con sus parcelas
- [ ] Se maneja bien con los dedos en el móvil y con el ratón en el escritorio

---

### Milestone: Ciclo 5 · Comida

#### GH-29
**Título:** Almacenes de comida
**Etiquetas:** feature, db, backend, frontend

Depende de #8 y #9.

**Criterios de aceptación**
- [ ] Almacenes configurables por explotación: nombre, tipo y unidad (unidades o kilos)
- [ ] Al crear una explotación se crean los almacenes por defecto: pacas de hierba verde y de hierba seca (unidades), y silos de maíz y de pienso (kilos)
- [ ] El administrador crea, edita y desactiva almacenes; la unidad no cambia si ya hay movimientos
- [ ] Pantalla con el stock actual de cada almacén

#### GH-30
**Título:** Entradas, salidas y ajustes de comida
**Etiquetas:** feature, db, backend, frontend

Depende de #29 y #25.

**Criterios de aceptación**
- [ ] Entrada: fecha, cantidad, origen (compra o producción propia) y finca de origen si es producción propia
- [ ] Salida (ración): fecha y cantidad, sin destino
- [ ] Ajuste de inventario: recuento físico (cantidad resultante) o merma (diferencia), con motivo
- [ ] Stock calculado a partir de los movimientos
- [ ] Stock negativo permitido: se avisa al registrar y el almacén aparece en rojo hasta que una entrada o un ajuste lo corrija
- [ ] Historial de movimientos por almacén con filtros de fecha y tipo
- [ ] La factura de una entrada de compra la asocia el administrador después (#36)

---

### Milestone: Ciclo 6 · Sin conexión

#### GH-31
**Título:** Estrategia de trabajo sin conexión
**Etiquetas:** investigacion, frontend, backend

Prueba de concepto antes de implementarlo. Depende de #10.

**Criterios de aceptación**
- [ ] Almacenamiento local en IndexedDB de los datos necesarios para consultar sin conexión
- [ ] Cola de operaciones pendientes con identificadores generados en el cliente, para que reintentar no duplique registros
- [ ] Sincronización al recuperar cobertura y política de conflictos documentada
- [ ] Comportamiento con la sesión caducada sin conexión: los registros pendientes se conservan y se envían tras volver a iniciar sesión
- [ ] Decisión documentada en `docs/diseno.md`, con una arquitectura ampliable a otras secciones

#### GH-32
**Título:** Fincas sin conexión
**Etiquetas:** feature, frontend, backend

Depende de #31, #26, #27 y #28.

**Criterios de aceptación**
- [ ] Consulta de fincas y de sus eventos sin cobertura
- [ ] Registro sin cobertura de labores, abono, fitosanitarios y pastoreo
- [ ] Indicador de sin conexión y de registros pendientes de enviar
- [ ] Sincronización automática al recuperar cobertura, con aviso de los registros que fallen

#### GH-33
**Título:** Animales sin conexión
**Etiquetas:** feature, frontend, backend

Depende de #31, #20, #21 y #23.

**Criterios de aceptación**
- [ ] Consulta del listado y de las fichas de animales sin cobertura
- [ ] Registro sin cobertura de partos (con la creación de los terneros), tratamientos y pesadas
- [ ] Indicador de sin conexión y de registros pendientes de enviar
- [ ] Sincronización automática al recuperar cobertura, con aviso de los registros que fallen (p. ej. un crotal repetido)

---

### Milestone: Ciclo 6b · Reposición y mantenimiento

#### GH-110
**Título:** Animales no aptos para reposición
**Etiquetas:** feature, db, backend, frontend

Depende de #14 y #23.

Una vaca con una enfermedad que se transmite a la descendencia (paratuberculosis, leucosis…) no debe dejar hijas como madres reproductoras. Hoy no hay forma de apuntarlo ni de verlo al decidir la reposición.

**Criterios de aceptación**
- [ ] En la ficha de una hembra, marcar "No dejar hijas para reposición" con el motivo (texto, p. ej. "Paratuberculosis") y la fecha; quitar la marca también
- [ ] La madre lo muestra con una insignia en su ficha y en el listado
- [ ] Sus hijas, las ya nacidas y las que nazcan después, muestran el aviso "Madre no apta para reposición" con el motivo, en su ficha y en el listado
- [ ] Filtro del listado: "No aptas para reposición" (las hijas de madres marcadas)
- [ ] La marca y sus cambios quedan en el historial del animal
- [ ] Funciona sin conexión como el resto de Animales: se ve en las fichas guardadas

#### GH-111
**Título:** Maquinaria e infraestructuras
**Etiquetas:** feature, db, backend, frontend

Nueva sección **Mantenimiento**, la quinta de la barra (Animales, Comida, Fincas, Mantenimiento, Finanzas), para la maquinaria y las infraestructuras de la explotación.

**Criterios de aceptación**
- [ ] Módulo `mantenimiento` con acceso para el administrador y el empleado
- [ ] Equipos: nombre, tipo (maquinaria o infraestructura), descripción opcional (marca, modelo, matrícula, ubicación…) y si necesita mantenimiento
- [ ] Cualquiera del equipo los da de alta y los edita; no se borran: se desactivan
- [ ] Listado con búsqueda y filtro por tipo, y los que necesitan mantenimiento destacados
- [ ] Ficha del equipo con sus tareas (#112)
- [ ] La barra inferior admite cinco secciones a 360 px sin desbordar

#### GH-112
**Título:** Tareas de mantenimiento
**Etiquetas:** feature, db, backend, frontend

Depende de #111.

Tareas de mantenimiento por hacer, como una lista: "Cambiar la rueda del tractor", "Arreglar el bebedero de la nave". Primera versión, sin mantenimientos periódicos.

**Criterios de aceptación**
- [ ] Tarea: título, equipo opcional (o una tarea suelta), descripción, fecha límite opcional, prioridad opcional y estado (pendiente, hecha)
- [ ] Cualquiera crea tareas; el administrador las asigna a una persona del equipo (o las deja sin asignar)
- [ ] "Mis tareas": cada uno ve las suyas y las sin asignar, y las marca como hechas (quién y cuándo)
- [ ] Listado de todas las tareas con filtros: pendientes o hechas, asignada a, equipo; las vencidas, destacadas
- [ ] En la ficha del equipo, sus tareas pendientes y hechas
- [ ] Se corrigen o se borran, y los cambios quedan en el historial

---

### Milestone: Ciclo 7 · Finanzas

#### GH-34
**Título:** Régimen fiscal de la explotación
**Etiquetas:** feature, db, backend, frontend

Depende de #8.

**Criterios de aceptación**
- [ ] Cada explotación indica su régimen: REAGP o régimen general de IVA
- [ ] Porcentajes configurables (compensación REAGP, 10,5 % por defecto para ganadería, y tipos de IVA), no fijos en el código
- [ ] Solo el administrador lo ve y lo cambia

#### GH-35
**Título:** Facturas
**Etiquetas:** feature, db, backend, frontend

Depende de #34 y #16.

**Criterios de aceptación**
- [ ] Factura recibida (gasto) o emitida (ingreso): número, fecha, proveedor o cliente, NIF, concepto, base imponible, IVA o compensación REAGP según el régimen (con varios tipos de IVA) y total
- [ ] Estado de pago (pagada o pendiente)
- [ ] Archivo adjunto (PDF o foto)
- [ ] Animales enlazados si es una compra de animales
- [ ] Validación de NIF y de que los importes cuadran
- [ ] Solo accesible para el administrador

#### GH-36
**Título:** Facturas de las entradas de comida
**Etiquetas:** feature, backend, frontend

Depende de #30 y #35.

**Criterios de aceptación**
- [ ] El administrador asocia una factura a una o varias entradas de comida de compra
- [ ] Filtro de entradas por origen y por tener o no factura
- [ ] El empleado sigue registrando entradas sin factura y no ve las facturas

#### GH-37
**Título:** Otros ingresos y gastos
**Etiquetas:** feature, db, backend, frontend

Depende de #34.

**Criterios de aceptación**
- [ ] Movimientos sin factura (subvenciones PAC, seguros, tickets…): tipo (ingreso o gasto), fecha, concepto, importe, adjunto opcional y observaciones
- [ ] Listado, alta, edición y anulación

#### GH-38
**Título:** Ventas de animales
**Etiquetas:** feature, db, backend, frontend

Depende de #35, #20 y #21.

**Criterios de aceptación**
- [ ] Venta: fecha, comprador, animales vendidos, peso de cada animal (opcional), precio, factura asociada y observaciones
- [ ] Precio introducido como total, por animal o por kg; el resto se calcula
- [ ] Bloqueo sin excepciones si algún animal tiene un periodo de supresión en curso, indicando cuál y hasta cuándo
- [ ] Al registrar la venta, los animales pasan a "vendido" con fecha y causa de baja, en la misma transacción
- [ ] Las pesadas de venta quedan en la ficha de cada animal

#### GH-39
**Título:** Informes de finanzas
**Etiquetas:** feature, backend, frontend

Depende de #35, #37 y #38.

**Criterios de aceptación**
- [ ] Listados de facturas, otros ingresos y gastos, y ventas con filtros (fechas, proveedor o cliente, estado de pago, tipo)
- [ ] Resumen de ingresos y gastos por periodo (mes, trimestre, año)
- [ ] Tablas pensadas para pantalla ancha

#### GH-40
**Título:** Exportación para el gestor
**Etiquetas:** feature, backend, frontend

Depende de #39.

**Criterios de aceptación**
- [ ] Exportación a Excel (`.xlsx`) y CSV de los listados filtrados de facturas, otros ingresos y gastos, y ventas
- [ ] Columnas y formato de importes y fechas en español
- [ ] Opción de incluir los adjuntos de las facturas en un `.zip`

#### GH-41
**Título:** Despliegue en producción
**Etiquetas:** feature, infra

Primera versión completa (v1.0.0). Depende de #13.

**Criterios de aceptación**
- [ ] Entorno de producción desplegado desde un tag de `main`, sin datos de ejemplo
- [ ] Propietario de la plataforma, primera explotación y su administrador creados en producción
- [ ] Copia de seguridad antes de cada despliegue con `scripts/backup.sh pro` (#13)
- [ ] Release `v1.0.0` publicada en GitHub

---

### Milestone: Ciclo 8 · Operación

#### GH-42
**Título:** Copias de seguridad automáticas
**Etiquetas:** feature, infra

Depende de #41.

**Criterios de aceptación**
- [ ] Copia diaria (cron) con `scripts/backup.sh pro` (#13), con copia incremental del volumen `uploads`
- [ ] Rotación: 7 diarias, 4 semanales y 6 mensuales, con test en la CI
- [ ] Aviso en el registro si queda poco espacio en disco
- [ ] Copia diaria fuera del servidor: el PC se trae las copias por Tailscale
- [ ] `docs/operacion.md` con la instalación del cron y de la tarea del PC

#### GH-43
**Título:** Restauración de copias
**Etiquetas:** feature, infra

Depende de #42.

**Criterios de aceptación**
- [ ] `scripts/restaurar.sh pruebas|pro COPIA [--subidas DIRECTORIO] [--produccion]`, con confirmación expresa en producción
- [ ] Comprobación de la copia antes de restaurar y de que el entorno responde después
- [ ] Procedimiento documentado, incluido qué hacer si se pierde el servidor
- [ ] Restauración probada en el entorno de pruebas con una copia de producción

---

### Milestone: Ciclo 9 · Correo

#### GH-44
**Título:** Envío de correo
**Etiquetas:** feature, backend, infra

Depende de #7.

**Criterios de aceptación**
- [ ] Configuración SMTP por variables de entorno, opcional: sin ella la aplicación funciona y no ofrece las opciones por email
- [ ] Plantillas de correo en español
- [ ] Registro de envíos fallidos en el log

#### GH-45
**Título:** Invitaciones por email
**Etiquetas:** feature, backend, frontend, seguridad

Depende de #44 y #12.

**Criterios de aceptación**
- [ ] El administrador invita a un usuario con email: recibe un enlace de un solo uso, con caducidad, para fijar su contraseña
- [ ] Reenviar y cancelar invitaciones pendientes
- [ ] Se mantiene el alta con contraseña temporal para usuarios sin email

#### GH-46
**Título:** Recuperación de contraseña por email
**Etiquetas:** feature, backend, frontend, seguridad

Depende de #44.

**Criterios de aceptación**
- [ ] "He olvidado mi contraseña" en la pantalla de inicio de sesión para usuarios con email
- [ ] Enlace de un solo uso con caducidad; la respuesta no revela si el usuario existe
- [ ] Al cambiar la contraseña se cierran las demás sesiones
- [ ] Sin email, el usuario pide al administrador que la restablezca

---

### Milestone: Ciclo 10 · Exposición pública

#### GH-47
**Título:** Acceso público con dominio propio
**Etiquetas:** feature, infra, seguridad

Depende de #41.

**Criterios de aceptación**
- [ ] Dominio propio con HTTPS público (Cloudflare Tunnel o similar), sin abrir puertos en el router
- [ ] Acceso desde cualquier móvil sin instalar Tailscale
- [ ] `URL_PUBLICA` y cookies ajustadas al nuevo dominio
- [ ] Documentación del procedimiento

#### GH-48
**Título:** Bastionado del proxy y del backend
**Etiquetas:** feature, infra, seguridad

Depende de #47.

**Criterios de aceptación**
- [ ] Cabeceras de seguridad en nginx (CSP, HSTS, Permissions-Policy…)
- [ ] Limitación de peticiones por IP en el proxy
- [ ] Revisión de dependencias y actualizaciones automáticas (Dependabot)
- [ ] Revisión de permisos y de exposición de datos entre explotaciones

---

### Milestone: Más adelante

#### GH-49
**Título:** Doble factor de autenticación
**Etiquetas:** feature, backend, frontend, seguridad

Código TOTP (aplicación autenticadora) con el plugin de Better Auth, al menos para los administradores.

#### GH-50
**Título:** Libros oficiales de la explotación
**Etiquetas:** feature, backend, frontend

Exportación del libro de registro de la explotación y del libro de tratamientos en el formato que pida la normativa.

#### GH-51
**Título:** Cosecha como entrada de comida
**Etiquetas:** feature, backend, frontend

Al registrar una cosecha, ofrecer crear la entrada de comida de producción propia en el almacén que corresponda.

#### GH-53
**Título:** Cuaderno digital de explotación (SIEX)
**Etiquetas:** investigacion, backend

Estudiar qué exige la normativa del cuaderno digital y cómo exportar los datos de Fincas en ese formato.

#### GH-54
**Título:** Retención de IRPF en las ventas
**Etiquetas:** feature, backend, frontend

Campo de retención de IRPF en las facturas emitidas (1 % por defecto), descontado del total a cobrar.

#### GH-16
**Título:** Fotos de los animales
**Etiquetas:** feature, backend, frontend

Depende de #14 y #15.

**Criterios de aceptación**
- [ ] Subida de fotos desde la cámara o la galería del móvil, en el volumen `uploads`, separadas por explotación y con nombres generados
- [ ] Las fotos se reducen y convierten a un formato ligero al subirlas
- [ ] Galería en la ficha, con foto principal; borrar con confirmación
- [ ] Solo se sirven a miembros de la explotación
- [ ] Límite de tamaño coherente con `MAX_SUBIDA` del proxy

#### GH-17
**Título:** Importación de animales desde Excel o CSV
**Etiquetas:** feature, backend, frontend

Depende de #14 y #15.

**Criterios de aceptación**
- [ ] Plantilla descargable con las columnas admitidas
- [ ] Subida de un `.xlsx` o `.csv` con vista previa antes de importar
- [ ] Errores por fila (crotal repetido, fecha no válida, madre inexistente…) sin importar nada si hay errores
- [ ] Madres y padres resueltos por crotal, también entre animales del mismo archivo
- [ ] Importación en una sola transacción

#### GH-19
**Título:** Traslados entre explotaciones
**Etiquetas:** feature, backend, frontend

Movimiento de un animal entre explotaciones del mismo usuario. Depende de #14.

**Criterios de aceptación**
- [ ] Solo un usuario que es administrador en las dos explotaciones puede trasladar
- [ ] El animal conserva su historial (tratamientos, pesos, reproducción) en la explotación de destino
- [ ] Queda registrado el traslado: fecha, origen y destino
- [ ] Tests de que la explotación de origen deja de ver al animal y la de destino lo ve

#### GH-99
**Título:** Raciones combinadas
**Etiquetas:** feature, db, backend, frontend

Depende de #30.

Una ración habitual combina varias comidas, por ejemplo 1 paca de hierba seca, 100 kg de silo de maíz y 50 kg de pienso, y se da todos los días. Hoy hay que sacarla almacén a almacén. Con raciones configuradas, se da en un toque.

**Criterios de aceptación**
- [ ] Raciones configurables por explotación: nombre ("Ración vacas") y sus líneas, cada una con un almacén activo y una cantidad en su unidad
- [ ] El administrador crea, edita y desactiva raciones
- [ ] "Dar ración" en la pantalla de Comida: registra con la fecha de hoy una salida en cada almacén de la ración, todas o ninguna
- [ ] Contador para dar la ración varias veces (× 2, × 3…), por ejemplo para varios lotes
- [ ] Un solo "Deshacer" quita todas las salidas de esa ración
- [ ] Si algún almacén queda en negativo, se avisa diciendo cuáles, y se guarda igualmente
- [ ] En el historial de cada almacén, la salida aparece como "Salida · <nombre de la ración>" y se corrige o se borra como cualquier otra

**Fuera de alcance**
- Que la ración se reste sola cada día, sin que nadie la dé: si un día no se da o se da otra cosa, el stock queda mal sin que nadie lo note. Se puede plantear después, sobre esto.
