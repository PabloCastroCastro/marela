# Diseño de la aplicación de gestión de ganadería de vacuno

Resumen de decisiones tomadas hasta ahora. Documento vivo: se irá actualizando.

## General

- Vacuno de carne de cría (vacas nodrizas), solo España. No es cebo: los terneros nacen y se crían en la explotación.
- Cada animal se gestiona de forma individual; no hay lotes ni grupos.
- Multiexplotación: dar de alta una explotación nueva debe ser fácil.
- Cuatro secciones: Animales, Comida, Fincas y Finanzas.
- Primera versión sencilla; se evolucionará después.

## Usuarios y accesos

- Tres niveles: propietario de la plataforma, administrador de explotación y empleado.
- El propietario crea las explotaciones (nombre, código REGA, municipio y provincia) y su primer administrador, que puede ser un usuario nuevo con contraseña temporal o uno que ya existe. No hay registro libre.
- El propietario puede desactivar una explotación: desaparece para sus miembros, que no pueden entrar en ella, pero no se borra ningún dato y se puede reactivar.
- El administrador edita los datos de su explotación.
- El administrador de explotación crea, desactiva y cambia el rol de sus empleados.
- Desactivar a alguien es solo para esa explotación: deja de poder entrar en ella, pero conserva sus otras explotaciones y lo que haya registrado. Una explotación siempre tiene al menos un administrador activo.
- El administrador puede dar una contraseña temporal nueva solo a quien pertenece únicamente a su explotación. Para quien está en varias, lo hace el propietario de la plataforma, para que ningún administrador pueda entrar en explotaciones ajenas.
- Un usuario puede pertenecer a varias explotaciones, con un rol distinto en cada una.
- El empleado accede a Animales, Comida y Fincas, pero no a Finanzas.
- El administrador accede a todo en su explotación.

### Autenticación

- Propia, en el backend con Better Auth (librería, no servicio externo).
- Las explotaciones se modelan con el plugin de organizaciones de Better Auth: cada usuario tiene un rol por explotación.
- Inicio de sesión con nombre de usuario o email, más contraseña. El nombre de usuario y el email son obligatorios y únicos.
- Contraseñas de al menos 10 caracteres, guardadas con hash, y límite de intentos de inicio de sesión (5 por minuto desde cada IP).
- El propietario de la plataforma se crea desde el servidor con el comando `crear-propietario`.
- Alta de usuarios:
  - El administrador le asigna una contraseña temporal, que se muestra una sola vez y que el usuario debe cambiar en el primer inicio de sesión.
  - Cuando haya envío de correo (ciclo 9), en su lugar se le enviará una invitación con un enlace para fijar su contraseña.
  - Si el usuario ya existe en otra explotación, el administrador lo añade por su nombre de usuario con el rol correspondiente.
- Recuperación de contraseña: la restablece el administrador con una nueva contraseña temporal; con el envío de correo (ciclo 9), también por email.
- Sesión: cookie httpOnly con sesión de 30 días que se renueva con el uso, para poder trabajar sin conexión varios días.
- Al desactivar a un usuario, se revocan sus sesiones y deja de tener acceso.
- Si la sesión caduca sin conexión, los registros pendientes se conservan en el dispositivo y se sincronizan tras volver a iniciar sesión.
- Tras iniciar sesión, si el usuario pertenece a varias explotaciones, elige con cuál trabajar y puede cambiar después.
- Doble factor (2FA): más adelante.

## Animales

### Ficha del animal

- Crotal / identificación oficial: ES y 12 dígitos; los de animales comprados en otro país, su código y hasta 12 dígitos. Único en toda la plataforma. Opcional mientras se le pone a un ternero, en los 20 días siguientes a su nacimiento: hasta entonces la ficha avisa del plazo, y en el listado se filtran con "Estado: Sin crotal" (GH-23). Una vez puesto, no se puede quitar.
- Nombre, opcional (muchas vacas lo tienen y es como se las reconoce)
- Raza: se elige de una lista de razas de carne habituales en España o se escribe otra
- Sexo
- Fecha de nacimiento
- Madre: enlace a su ficha si está en el sistema; opcional o texto libre si no (por ejemplo, un animal comprado)
- Padre: enlace a su ficha si es toro propio, texto libre (nombre o código) si es dosis externa
- Origen: nacido en la explotación o comprado (con fecha de entrada y código REGA de la explotación de origen). Las compras son excepcionales (por ejemplo, un toro).
- Estado (activo, vendido, muerto...)
- Baja: tipo (venta, muerte, sacrificio en la explotación, robo o extravío, u otra causa), fecha y detalle (obligatorio si es otra causa). La muerte y el sacrificio dejan el animal como «muerto»; el robo, el extravío y otras causas, «de baja»; la venta, «vendido». Una baja registrada por error se deshace y queda en el historial; la venta se registra y se deshace desde Finanzas.
- Fotos
- Observaciones

### Alta de animales

- Manual e importación desde Excel/CSV.

### Traslados

- Movimiento de un animal entre explotaciones del mismo usuario, conservando su historial.

### Historial y registro (GH-24)

- La ficha tiene un solo botón "Registrar" que abre la lista de todo lo que se le puede registrar al animal: pesada, tratamiento, cubrición o inseminación, diagnóstico, parto, aborto, destete y dar de baja. Las tarjetas de la ficha no tienen botones propios.
- "Historial", desde la ficha, abre una página con todo lo del animal (nacimiento y entrada, pesadas, tratamientos, eventos reproductivos, partos y baja), del más reciente al más antiguo, agrupado por año y con filtro por tipo. Los traslados entrarán cuando existan (GH-19).

### Pesos

- Registro de pesadas: fecha, kg y momento (al nacer, al destete, a la venta u otra pesada). Al nacer, al destete y a la venta, como mucho una vez por animal.
- En la ficha: el último peso, la ganancia media diaria, un gráfico de la evolución y cada pesada con la ganancia desde la anterior.
- Una pesada se corrige o se borra si se registró por error; el borrado queda en el historial.

### Tratamientos

- Fecha de administración
- Producto o medicamento
- Dosis y vía de administración
- Motivo (enfermedad, vacuna, desparasitación...)
- Quién lo administra: usuario del sistema o texto libre (por ejemplo, el veterinario)
- Número de lote del medicamento
- Periodo de supresión y fecha en que termina
- Observaciones

Decisiones (GH-20):

- Se registran desde la ficha del animal o, para varios a la vez, marcándolos en el listado de animales y pulsando "Tratar". En el móvil se empieza a marcar manteniendo pulsado un animal (como en Material 3); después, tocar otro lo marca. En la tabla de escritorio, cada fila lleva su casilla. Se crea un tratamiento por animal.
- Quién lo administra: por defecto, quien lo registra; se puede elegir otra persona del equipo o escribir un nombre.
- La supresión termina el día de la fecha más los días de supresión. Mientras dura, la ficha y el listado lo muestran ("En supresión hasta el…"), y en el listado se filtra con "Estado: En supresión", aunque no es un estado: se calcula de los tratamientos y el animal sigue activo.
- Un tratamiento no se corrige ni se borra: se anula con un motivo, sigue en la ficha tachado y deja de contar para la supresión. Para corregirlo, se anula y se registra de nuevo.

### Reproducción

- Eventos: cubrición (monta natural), inseminación artificial, diagnóstico de gestación (ecografía o palpación), parto, aborto y destete.
- Se calcula la fecha prevista de parto a partir de la cubrición o inseminación.
- El diagnóstico de gestación registra fecha, método y resultado (gestante / vacía). Si es negativo, se anula la fecha prevista de parto.
- En cubrición o inseminación, el padre es un toro propio (enlazado a su ficha) o una dosis externa.
- Un parto puede tener uno o varios terneros (gemelos). Por cada ternero se crea su ficha, enlazada automáticamente a la madre.
- Datos del parto: fecha, tipo (normal, con ayuda, cesárea) y observaciones. Por cada ternero: sexo, estado al nacer (vivo, muerto) y peso al nacer opcional.
- Los terneros nacidos muertos también tienen ficha, con estado "muerto", por trazabilidad.
- Sin avisos de momento.

Decisiones (GH-22):

- La fecha prevista de parto es la de la cubrición o inseminación más 283 días, la gestación media del vacuno de carne.
- La gestación en curso de una vaca se calcula de sus eventos: la última cubrición o inseminación posterior al último aborto o diagnóstico negativo. Un diagnóstico positivo la confirma; sin él se muestra "sin confirmar".
- En la ficha y en el listado: "Parto previsto el…". En el listado se filtra con "Estado: Gestantes", ordenadas por fecha prevista de parto, aunque no es un estado: la vaca sigue activa.
- La cubrición y la inseminación se registran a varias vacas a la vez marcándolas en el listado y pulsando "Cubrir"; el resto de eventos, desde la ficha.
- El destete es del ternero y se registra en su ficha, con su peso opcional, que se guarda también como su pesada al destete. Sale además en el historial de la madre.
- Un evento no se corrige ni se borra: se anula con un motivo, sigue en el historial tachado y deja de contar para la gestación.

Decisiones (GH-23):

- El parto es un tipo más en "Registrar" de la tarjeta de reproducción, junto a los eventos; a una gestante se le ofrece primero. Se registra con uno a cuatro terneros, y crea sus fichas en la misma transacción. El padre es el de la cubrición o inseminación de la gestación en curso; si no la hay, se elige en el formulario.
- El crotal de cada ternero es opcional (ver "Animales"); la raza, por defecto la de la madre; el peso al nacer, opcional, se guarda como su pesada al nacer.
- Los nacidos muertos quedan con estado "muerto" y baja por muerte, con la causa "Nacido muerto".
- El parto cierra la gestación en curso, como el aborto o el diagnóstico negativo.
- Las listas de la ficha (reproducción, tratamientos y pesadas) muestran los 3 registros más recientes y el resto con "Ver todo"; arriba de la de reproducción, lo que viene: la gestación y el parto previsto.
- Un parto no se corrige ni se borra: se anula con un motivo, y se borran las fichas de sus terneros, que quedan en el historial de cambios. No se puede si alguno tiene ya otros datos (pesadas aparte de la del nacimiento, tratamientos, eventos o hijos).

## Comida

- Los almacenes son configurables por explotación: nombre, tipo y unidad (unidades o kilos).
- Almacenes iniciales por defecto: pacas de hierba verde, hierba seca, silo de maíz y silo de pienso. Las pacas se miden en unidades y los silos en kilos.
- Cada almacén funciona como un stock con entradas y salidas.

### Entrada

- Fecha
- Cantidad
- Origen: compra o producción propia
- Finca de origen, si es producción propia
- Factura asociada, si es compra. La asocia el administrador después; el empleado registra la entrada sin factura. No habrá listado de entradas sin factura: el administrador filtra a mano.

### Salida (ración)

- Fecha y cantidad, sin destino.

### Ajustes de inventario

- Recuento físico o merma: fecha, cantidad resultante o diferencia, y motivo.

### Stock negativo

- Se permite. Si una salida o un ajuste deja el almacén en negativo, se avisa al registrarlo, pero se guarda igualmente.
- El almacén aparece marcado en rojo hasta que una entrada o un ajuste lo corrija.

## Fincas

### Ficha de la finca

- Nombre
- Superficie (hectáreas)
- Referencia catastral (solo texto, sin conexión al catastro)
- Referencia SIGPAC: provincia, municipio, polígono, parcela y recinto (solo texto)
- Municipio y provincia
- Régimen (propiedad, arrendamiento...)
- Observaciones

Decisiones (GH-25):

- Una finca junta una o varias parcelas, cada una con su referencia SIGPAC (provincia, municipio, polígono, parcela y recinto; desde GH-52, también agregado y zona) o su referencia catastral, y su superficie. La superficie de la finca es la suma de la de sus parcelas.
- Un recinto SIGPAC está en una sola finca de la explotación, y no hay dos fincas con el mismo nombre.
- Régimen: propiedad, arrendamiento, aparcería, cesión u otro.
- Una finca no se borra: se desactiva y sale de la lista de activas; sus datos y su historial se conservan y se puede reactivar.

Decisiones (GH-52):

- Las parcelas se eligen en un mapa: la ortofoto del PNOA (IGN) con los recintos SIGPAC encima. Al tocar un recinto se añade con su referencia, superficie, uso y contorno, y con la referencia catastral de la parcela en la que está. Si la finca no tiene municipio o provincia, se rellenan.
- También por referencia: con la SIGPAC completa se consulta el SIGPAC; si no, con la catastral, el Catastro.
- La referencia SIGPAC tiene siete partes: provincia, municipio, agregado, zona, polígono, parcela y recinto. El agregado y la zona casi siempre son 0, y así quedan si no se escriben.
- El mapa se centra en las parcelas que ya tiene la finca; si no tiene, en el municipio de la explotación. Con "Ir a mi ubicación", donde está el móvil.
- Los servicios son públicos y gratuitos (SIGPAC, Catastro, CartoCiudad e IGN). Si no responden o no hay conexión, se sigue pudiendo escribir todo a mano.

Decisiones (GH-91):

- En Fincas, "Lista" o "Mapa", con los mismos filtros. La vista se guarda en la dirección (`?vista=mapa`), para volver a ella desde una ficha.
- En el mapa, cada finca con el color de su estado: en plazo de seguridad (naranja, primero porque es un aviso), en pastoreo (azul) o sin nada (claro). Al tocar una se ven su nombre, superficie, municipio, régimen e insignias, y el acceso a su ficha.
- Las fincas con parcelas escritas a mano no salen en el mapa: se avisa de cuáles son, con un enlace que abre su edición con el mapa ya abierto. En su ficha, lo mismo con "Completar en el mapa".
- La ficha muestra un mapa pequeño con sus parcelas. No se acerca con la rueda del ratón, para no estorbar al desplazar la página.
- Sobre la ortofoto, los colores son fijos y vivos, los mismos en el tema claro y en el oscuro.

### Eventos de finca

- Siembra, abono, fitosanitarios, cosecha, pastoreo y otras labores (siega, laboreo, riego...).

### Abono y fitosanitarios

- Fecha
- Producto
- Dosis (cantidad por hectárea)
- Superficie tratada
- Plaga o motivo (solo fitosanitarios)
- Plazo de seguridad y fecha en que termina (solo fitosanitarios)
- Quién lo aplica: usuario del sistema o texto libre
- Número ROPO del aplicador (opcional, solo fitosanitarios)
- Equipo de aplicación (opcional, solo fitosanitarios)
- Número de lote del producto

Decisiones (GH-27):

- Se registran desde "Registrar" en la ficha o, para varias fincas, marcándolas en el listado, como las labores: uno por finca, cada uno con su superficie entera.
- El abono es mineral (NPK, urea…) u orgánico (purín, estiércol…).
- La dosis, con su unidad: kg/ha, t/ha, l/ha o m³/ha.
- Mientras un fitosanitario tenga el plazo de seguridad en curso, la finca lo avisa en su ficha y en el listado ("Plazo de seguridad hasta el…"), y se puede filtrar en Estado ("En plazo de seguridad"), como la supresión de los animales. La fecha que se muestra es la de la aplicación más los días del plazo.
- Como los tratamientos de los animales, no se corrigen ni se borran: se anulan con un motivo y siguen a la vista, tachados. Uno anulado deja de contar para el plazo de seguridad.
- "Registrar" en la ficha ofrece, en el orden del año, siembra, abono, fitosanitario, entrada a pastar (GH-28), cosecha y otra labor; y al final, desactivar la finca.

### Siembra, cosecha y otras labores

- Fecha
- Tipo de cultivo (siembra y cosecha)
- Superficie afectada
- Cantidad cosechada (cosecha)
- Tipo de labor (otras labores)
- Quién lo realiza: usuario del sistema o texto libre
- Observaciones

Decisiones (GH-26):

- Desde la ficha, "Registrar" ofrece siembra, cosecha y otra labor; para registrar la misma labor en varias fincas, se marcan en el listado (manteniendo pulsada una en el móvil) y "Registrar" (GH-27: el mismo menú que en la ficha). Se crea una por finca, cada una con su superficie entera.
- La superficie, por defecto la de la finca, y nunca mayor.
- La cantidad cosechada, con su unidad: kg, toneladas, pacas, rolos o remolques.
- Cultivos y labores, de texto libre con sugerencias.
- Una labor se corrige o se borra (con "Deshacer"); no es un dato sanitario. Los cambios quedan en el historial.
- La ficha muestra las tres labores más recientes y el resto con "Ver todo".

### Pastoreo

- Fecha de entrada, fecha de salida y número de animales, sin enlazar fichas.

Decisiones (GH-28):

- La entrada se registra desde "Registrar" en la ficha, finca a finca. Mientras los animales siguen en la finca, el menú ofrece "Salida del pastoreo" en lugar de otra entrada, y la tarjeta "Pastoreo", "Registrar la salida".
- Una finca no tiene dos pastoreos en curso a la vez. Se puede registrar uno que ya terminó, con su salida.
- El pastoreo en curso se ve en la ficha ("Pastando 12 animales desde el…"), en el listado ("Pastando 12") y en el filtro Estado ("En pastoreo").
- Si la finca está en plazo de seguridad, el formulario de entrada lo avisa, pero deja guardar: hay productos que permiten pastar.
- Como las labores, un pastoreo se corrige o se borra (con "Deshacer"), y los cambios quedan en el historial.

### Para más adelante

- Conexión con el catastro, SIGPAC y mapas: adelantada al ciclo 4b (GH-52 y GH-91).
- Tener en cuenta la normativa (cuaderno de explotación / SIEX).
- Posible conexión entre cosecha y entrada de comida con origen "producción propia".

## Finanzas (solo administrador)

### Régimen fiscal

- Configurable por explotación: Régimen Especial de Agricultura, Ganadería y Pesca (REAGP) o régimen general de IVA.
- Los porcentajes (compensación REAGP, tipos de IVA) se configuran, no se fijan en el código. Por defecto, la compensación REAGP para ganadería es del 10,5 %.
- En REAGP, las ventas generan un recibo de compensación en lugar de una factura con IVA.
- La retención de IRPF en las ventas no se registra por ahora; la lleva el gestor fuera de la aplicación.

### Facturas

- Tipo: recibida (gasto) o emitida (ingreso)
- Número de factura
- Fecha
- Proveedor o cliente
- NIF del proveedor o cliente
- Concepto o descripción
- Base imponible, IVA o compensación REAGP según el régimen, y total (admitiendo varios tipos de IVA)
- Estado de pago (pagada / pendiente)
- Archivo adjunto (PDF o foto)
- Animales enlazados, si es una compra de animales (excepcional)

### Otros ingresos y gastos

- Movimientos sin factura: subvenciones PAC, seguros, tickets...
- Datos: tipo (ingreso o gasto), fecha, concepto, importe, archivo adjunto opcional y observaciones.

### Ventas

- Solo se venden animales; cada venta se enlaza a las fichas de los animales vendidos.
- Datos: fecha, comprador, animales vendidos, peso de cada animal (opcional), precio, factura asociada y observaciones.
- Precio: se introduce el total, el precio por animal o el precio por kg, y el resto se calcula.
- Si algún animal tiene un periodo de supresión en curso, la venta se bloquea hasta que termine. Bloqueo sin excepciones, también para el administrador.
- Al registrar la venta, los animales pasan automáticamente a estado "vendido", con fecha y causa de baja.

### Salidas e informes

- Listados de facturas, otros ingresos y gastos, y ventas con filtros (fechas, proveedor...).
- Resumen de ingresos y gastos por periodo.
- Exportación a Excel/CSV para el gestor.

## Aspectos generales de los datos

- Auditoría: cada registro guarda quién lo creó y modificó, y cuándo. Además, cada alta, cambio o borrado queda en un historial con el estado anterior y el nuevo.
- Las correcciones y borrados quedan registrados; en datos sanitarios (tratamientos, partos, bajas) se prefiere anular a borrar.

## Aspectos técnicos

- Aplicación web y móvil, con frontend y backend separados.
- Móvil: web adaptable instalable como app (PWA).
- Frontend: React con TypeScript y Vite.
- Backend: Node.js LTS con TypeScript, Hono y Zod (validación y contrato OpenAPI con `@hono/zod-openapi`).
- Base de datos: PostgreSQL, con Drizzle ORM y migraciones SQL generadas con drizzle-kit.
- Autenticación: Better Auth.
- Herramientas: Biome (lint y formato) y Vitest (tests).
- Separación de datos por explotación: una sola base de datos con identificador de explotación en cada tabla y Row-Level Security de PostgreSQL. Dar de alta una explotación es insertar una fila.
- Archivos (fotos y adjuntos): en un volumen de Docker (`uploads`) montado en el backend. En la base de datos se guarda la ruta relativa, con nombres generados (nunca el nombre original) y separados por explotación.
- Servicios del Docker Compose:
  - `db`: PostgreSQL, con su volumen de datos (`db-data`).
  - `backend`: API, con el volumen `uploads`. Aplica las migraciones al arrancar.
  - `proxy`: nginx; sirve la PWA compilada y redirige `/api` al backend. Es el único servicio que publica un puerto.
- Ficheros de Compose: `docker-compose.dev.yml` para desarrollo local (con recarga en caliente) y `docker-compose.yml` para el servidor. Cada entorno (pruebas y producción) usa su propio nombre de proyecto, con contenedores y volúmenes separados.
- Copias de seguridad de la base de datos y de los archivos.
- Despliegue con Docker Compose.
- Repositorio en GitHub: un solo repositorio con proyectos independientes. Cada proyecto tiene sus propias dependencias (npm), su Dockerfile y su README, y no importa código de los demás. No hay workspaces ni paquetes compartidos.
- Los tipos se comparten a través del contrato de la API: el backend genera `openapi.json` (con `@hono/zod-openapi`) y el frontend genera sus tipos a partir de él (`openapi-typescript`). La CI comprueba que estén al día.

```
frontend/                    PWA (React + Vite)
backend/                     API (Hono) y base de datos (PostgreSQL, Drizzle)
proxy/                       nginx: sirve la PWA y redirige /api al backend
docker-compose.dev.yml       desarrollo local, con recarga en caliente
docker-compose.yml           servidor (pruebas y producción)
docker-compose.servidor.yml  solo en el servidor: certificado HTTPS de Tailscale
scripts/                     despliegue y copias de seguridad
.env.example                 configuración de Compose
.github/                     CI, plantillas de issues y de pull requests
docs/                        documento de diseño y guía del servidor
README.md
CONTRIBUTING.md
```

- Dentro del frontend, el código se organiza por secciones (`animales/`, `comida/`, `fincas/`, `finanzas/`), más `componentes/`, `estilos/`, `auth/` y `api/`.
- Sin conexión: Animales (partos, tratamientos, pesadas) y Fincas, con consulta y registro y sincronización al recuperar cobertura. La arquitectura debe permitir ampliarlo a otras secciones en el futuro.

## Alojamiento y acceso

- En una Raspberry Pi con Docker, que puede compartirse con otras aplicaciones (guía en `docs/servidor.md`).
- Dos entornos independientes, cada uno con su clon del repositorio, su `.env`, su base de datos, su proyecto de Compose y su puerto:
  - Pruebas: último `develop`, en `/opt/marela/pruebas`, proyecto `marela-pruebas`, datos de ejemplo desechables.
  - Producción: un tag `vX.Y.Z` de `main`, en `/opt/marela/pro`, proyecto `marela-pro`, datos reales.
- Puertos propios, distintos de los que ya estén ocupados en el servidor, por ejemplo 8444 y 9444. Solo el proxy de cada entorno publica un puerto.
- Acceso inicial solo por Tailscale, con HTTPS y el certificado de Tailscale (necesario para instalar la PWA). Si el servidor ya tiene un certificado de Tailscale para otra aplicación, se puede usar el mismo y su renovación.
- `docker-compose.servidor.yml` añade en el servidor la configuración HTTPS.
- Scripts en `scripts/`: despliegue (`deploy.sh pruebas|pro [tag]`, con comprobación de salud y registro), copias de seguridad diarias de la base de datos y de `uploads` con rotación (7 diarias, 4 semanales y 6 mensuales), copia diaria fuera del servidor en el PC por Tailscale, y restauración.
- En producción no se cargan datos de ejemplo; el primer administrador y su explotación se crean con un script.
- Exposición pública (dominio propio y Cloudflare Tunnel o similar) en un ciclo posterior, cuando la usen más personas.

## Interfaz

- Sin librería de componentes: componentes propios con CSS Modules (botón, campo, selector, hoja inferior, confirmación, avisos, estado vacío, cargando...).
- Tokens de diseño en `tokens.css`: colores, tipografía del sistema, espaciado, radios y sombras. Nunca se usan colores sueltos.
- Color principal: verde oliva (#9DAD6F), con acento ciruela (#704C5E) y grises con un toque verdoso, de la paleta https://coolors.co/558b6e-88a09e-704c5e-b88c9e-f1c8db.
- Normas de referencia, por orden: WCAG 2.2 nivel AA (obligatoria), Material Design 3 y Apple Human Interface Guidelines. La guía completa está en la skill `diseno-frontend` (`.claude/skills/diseno-frontend/SKILL.md`).
- Modo claro y oscuro, según el sistema.
- Zonas táctiles de al menos 44 px; buen contraste para usar el móvil al aire libre.
- Iconos de Lucide, React Router para la navegación y TanStack Query para los datos.
- Navegación adaptable:
  - En el móvil, barra inferior con las cuatro secciones y selector de explotación arriba.
  - En pantalla ancha, menú lateral con las secciones, el selector de explotación y los ajustes, y contenido más ancho para tablas y filtros.
  - Al empleado no le aparece Finanzas.
- Catálogo de componentes en una página propia de la aplicación (en desarrollo).

## Flujo de trabajo

El detalle está en `CONTRIBUTING.md`.

### Issues

- Todo trabajo empieza con una issue creada con su plantilla:
  - Funcionalidad: descripción, criterios de aceptación y capas afectadas.
  - Fallo: entorno (pruebas o producción), pasos, resultado esperado y obtenido.
- Cada issue va en el milestone de su ciclo y lleva etiquetas de capa (`db`, `backend`, `frontend`, `infra`, `seguridad`).

### Ramas

- `main` solo contiene versiones publicadas; cada merge lleva tag y se despliega en producción.
- `develop` es la rama de integración y lo que corre en el entorno de pruebas.
- `feature/GH-<n>[-descripcion]` y `fix/GH-<n>[-descripcion]` salen de `develop` y vuelven a `develop`.
- `hotfix/GH-<n>[-descripcion]` sale de `main`, se mergea en `main` con un tag nuevo y después se lleva a `develop`.

### Commits y pull requests

- Conventional Commits con la referencia a la issue al final, por ejemplo `feat(animales): alta de partos GH-12`.
- Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`. Ámbitos: `animales`, `comida`, `fincas`, `finanzas`, `auth`, `infra`...
- Todo cambio entra por pull request, nunca con push directo a `develop` o `main`. La descripción incluye `Closes #<n>`.

### Integración continua

- GitHub Actions en cada pull request y cada push a `develop` o `main`. Solo se ejecutan los trabajos de los proyectos con cambios.
- Backend: lint y formato, tipos, compilación, tests contra PostgreSQL, migraciones al día, contrato OpenAPI al día e imagen Docker.
- Frontend: lint y formato, tipos, compilación, tests y cliente de la API al día con el contrato.
- Proxy: imagen Docker y `nginx -t`.
- Prueba de humo: `docker compose up` completo y la API a través de nginx.
- Un trabajo final de resultado es la comprobación exigida para mergear.

### Versiones

- Versionado semántico con tags `vMAYOR.MENOR.PARCHE` y release en GitHub.
- `0.x` durante el MVP. MENOR al cerrar un ciclo; PARCHE en los hotfixes.
- Para publicar, se mergea `develop` en `main` por pull request, se crea el tag y la release, y se despliega.

### Migraciones

- Cada cambio de esquema es una migración que se sube con el cambio, dentro de la issue que lo necesita (etiqueta `db`). La CI falla si falta.
- Nunca se edita una migración ya desplegada.
- El despliegue a producción hace copia de seguridad antes de migrar; el backend aplica las migraciones pendientes al arrancar.

### Definición de terminado

- Cumple sus criterios de aceptación en el entorno de pruebas.
- Pasa la CI.
- Incluye migraciones si cambia el esquema.
- Está mergeada en `develop` mediante pull request.

## Para más adelante (Animales)

- Exportación del libro de registro de la explotación y del libro de tratamientos.

## Pendiente de decidir

- Nada por ahora.
