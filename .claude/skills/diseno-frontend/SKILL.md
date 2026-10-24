---
name: diseno-frontend
description: Guía de diseño del frontend de Marela (PWA en React + CSS Modules + tokens), siguiendo WCAG 2.2 AA, Material 3 y Apple HIG. Usar al crear o modificar pantallas, componentes, colores, animaciones o el modo sin conexión en frontend/.
---

# Diseño del frontend de Marela

Marela gestiona ganaderías de vacuno de cría: animales, comida, fincas y finanzas. Se usa sobre todo **en el móvil, en la cuadra o en la finca**: con una mano, a pleno sol y con poca cobertura. En el ordenador se usa para consultar, filtrar y llevar las finanzas. El estilo es minimalista y natural: **verde oliva** como color de marca, con un acento ciruela, sobre grises con un toque verdoso.

**Normas de referencia.** En caso de duda, mandan en este orden:

1. **WCAG 2.2 nivel AA**: accesibilidad, obligatoria.
2. **Material Design 3**: estructura, componentes, estados y movimiento.
3. **Apple Human Interface Guidelines**: comportamiento en iOS (zonas seguras, gestos, tamaños táctiles).
4. **Esta skill**: decisiones propias de Marela (colores, tono, plantillas). El resto de decisiones está en `docs/diseno.md` ("Interfaz") y la base técnica en `frontend/README.md`.

---

## 1. Stack

| Necesidad | Herramienta |
|---|---|
| Base | React 19 + TypeScript (strict) + Vite |
| Estilos | **CSS Modules** por componente + tokens de `src/estilos/tokens.css`. Sin Tailwind ni librerías de estilos o de componentes |
| PWA | `vite-plugin-pwa` (Workbox) |
| Rutas | React Router |
| Datos del servidor | TanStack Query + cliente tipado generado del contrato (`src/api/`) |
| Formularios | Controlados y propios. La API valida con Zod y sus errores se muestran por campo con `erroresPorCampo()` |
| Animación | Transiciones y animaciones CSS con los tokens de movimiento |
| Iconos y avisos | `lucide-react` y los avisos propios (`useAvisos()`) |

No añadas dependencias de interfaz sin acordarlo antes con el usuario.

Estructura, con todo en español:

```
src/
  rutas.tsx        rutas
  diseno/          estructura común: cabecera, navegación adaptable, selector de explotación
  componentes/     catálogo base (sección 6), cada uno con su .module.css
  animales/, comida/, fincas/, finanzas/
                   una carpeta por sección: páginas (PaginaX.tsx), formularios,
                   datos.ts (consultas) y acciones.ts (mutaciones)
  api/             cliente de la API: esquema.ts (generado) y cliente.ts
  estilos/         tokens.css y base.css
  pwa/             service worker, versión nueva, sin conexión
```

Para clases condicionales, usa `[estilos.a, condicion && estilos.b].filter(Boolean).join(' ')`, que ya es el patrón del proyecto.

---

## 2. Paleta de colores

Paleta de [coolors.co/558b6e-88a09e-704c5e-b88c9e-f1c8db](https://coolors.co/558b6e-88a09e-704c5e-b88c9e-f1c8db), con el **verde oliva #9DAD6F** como color de marca.

### 2.1 Colores base

Son la referencia para elegir o ampliar tokens. Los componentes nunca usan estos valores directamente.

| Color | Valor | Papel |
|---|---|---|
| Verde oliva | #9DAD6F | Marca: relleno de botones y de la pestaña activa, logo, PWA |
| Oliva oscuro | #66753F | Textos, enlaces e iconos en el color de la marca (#9DAD6F no llega a 4,5:1 sobre blanco) |
| Verde | #558B6E | De la paleta, sin uso propio por ahora |
| Ciruela | #704C5E | Acento: detalles puntuales, nunca acciones |
| Malva | #B88C9E | De la paleta, sin uso propio por ahora |
| Rosa | #F1C8DB | Fondo suave del acento |
| Gris salvia | #88A09E | Tono de los grises neutros |

**Grises neutros** (con el tono de #88A09E):

| Fondo | Superficie | Borde | Borde fuerte | Texto suave | Texto |
|---|---|---|---|---|---|
| #FFFFFF | #F6F8F8 | #DDE4E3 | #73878A | #5C6E6B | #18211F |

**Semánticos**

| Rol | Claro: texto / fondo suave | Oscuro: texto / fondo suave |
|---|---|---|
| Éxito | #15803D / #F0FDF4 | #86EFAC / #052E16 |
| Aviso | #B45309 / #FFFBEB | #FCD34D / #451A03 |
| Peligro | #B91C1C / #FEF2F2 | #FCA5A5 / #450A0A |
| Información | #1D4ED8 / #EFF6FF | #93C5FD / #172554 |

El relleno sólido de peligro (botón `peligro`) es #DC2626 con texto blanco (4,8:1). En oscuro, #EF4444 con texto #0C0A09.

### 2.2 Tokens

Los componentes **solo usan tokens** de `src/estilos/tokens.css`. En un `.module.css` nunca aparece un color en hex, `rgb()` ni con nombre, ni tamaños de texto, espacios, radios o sombras escritos a mano.

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--color-marca` | Logo e identidad | #9DAD6F | #9DAD6F |
| `--color-primario-relleno` | Fondo del botón principal y de la píldora de la pestaña activa | #9DAD6F | #9DAD6F |
| `--color-primario-intenso` | Hover y pulsado del relleno | #8E9F5E | #B0BF82 |
| `--color-sobre-primario` | Texto e iconos sobre el relleno: **oscuro** | #18211F | #0D1211 |
| `--color-primario` | Textos, enlaces, iconos y bordes en el color de la marca; foco | #66753F | #B5C38A |
| `--color-primario-suave` | Chip seleccionado, fila activa del menú, fondos de acento | #EEF1E3 | #262C17 |
| `--color-sobre-primario-suave` | Texto sobre el primario suave | #4F5C30 | #D3DBB8 |
| `--color-acento` | Detalles puntuales en ciruela | #704C5E | #D9A9BF |
| `--color-sobre-acento` | Texto sobre el acento | #FFFFFF | #0D1211 |
| `--color-acento-suave` | Fondo suave del acento (p. ej. icono de los estados vacíos) | #F1C8DB | #3D2531 |
| `--color-sobre-acento-suave` | Texto o icono sobre el acento suave | #704C5E | #F1C8DB |
| `--color-fondo` | Fondo de la aplicación | #FFFFFF | #0D1211 |
| `--color-superficie` | Cabecera, barras, zonas agrupadas | #F6F8F8 | #151C1B |
| `--color-superficie-elevada` | Diálogos, menús, hojas, avisos | #FFFFFF | #212A28 |
| `--color-texto` | Texto principal | #18211F | #EDF2F1 |
| `--color-texto-suave` | Texto secundario | #5C6E6B | #9DB0AE |
| `--color-borde` | Separadores y bordes decorativos | #DDE4E3 | #26302E |
| `--color-borde-fuerte` | Borde de campos, casillas, opciones y chips | #73878A | #8FA3A0 |
| `--color-velo` | Fondo detrás de diálogos y hojas | | |
| `--color-exito` / `-aviso` / `-peligro` / `-informacion` (+ `-suave`) | Estados | ver 2.1 | ver 2.1 |
| `--color-peligro-relleno` + `--color-sobre-peligro` | Botón de peligro | #DC2626 / #FFFFFF | #EF4444 / #0C0A09 |

**Relleno o texto:** el oliva de la marca es claro. Como fondo lleva siempre texto **oscuro** (`--color-sobre-primario`). Como color de texto o icono sobre el fondo se usa `--color-primario`: más oscuro en claro y más claro en oscuro.

**Tema:** claro y oscuro según el sistema (`prefers-color-scheme`), redefiniendo los tokens en `tokens.css`.

**Tokens nuevos:** si falta uno, añádelo con su valor en claro y en oscuro y con un nombre en español que diga para qué sirve, no cómo es (`--color-celo`, no `--color-rosa`). Comprueba su contraste.

### 2.3 Contraste (WCAG 2.2 AA)

- **Texto:** el normal, al menos **4,5:1**. El grande (24 px o más, o 18,7 px o más en negrita), al menos **3:1**.
- **Controles e iconos que transmiten información:** bordes e iconos al menos **3:1**. Por eso los campos usan `--color-borde-fuerte` y no `--color-borde`.
- **Combinaciones comprobadas:**

  | Combinación | Claro | Oscuro |
  |---|---|---|
  | Texto oscuro sobre el relleno #9DAD6F | 6,8:1 | 7,8:1 |
  | Texto oscuro sobre el relleno intenso | 5,7:1 | 9,6:1 |
  | Primario sobre el fondo | 5,0:1 | 10,0:1 |
  | Primario sobre la superficie | 4,7:1 | 9,2:1 |
  | Sobre primario suave, sobre primario suave | 6,3:1 | 10,0:1 |
  | Texto suave sobre el fondo | 5,4:1 | 8,3:1 |
  | Texto suave sobre la superficie | 5,1:1 | 7,6:1 |
  | Borde fuerte sobre el fondo | 3,8:1 | 7,1:1 |
  | Ciruela sobre el fondo | 7,3:1 | 9,3:1 |
  | Ciruela sobre el rosa (acento suave) | 4,9:1 | 9,3:1 |
  | Textos semánticos sobre su fondo suave | ≥ 4,8:1 | ≥ 4,8:1 |

- **Prohibido:**
  - Texto blanco sobre el oliva #9DAD6F (2,4:1): sobre el relleno, el texto es oscuro.
  - #9DAD6F como color de texto o de icono sobre fondos claros (2,4:1): usa `--color-primario`.
  - `--color-primario` sobre `--color-primario-suave` en claro (4,2:1): usa `--color-sobre-primario-suave`.
  - Texto suave sobre primario suave en textos importantes (4,6:1, justo en el límite).
  - #DC2626 como texto sobre su fondo suave (4,4:1); usa `--color-peligro`.
- **Señales:** el color nunca es la única señal. Los estados llevan también icono o texto.
- **Comprobación:** para combinaciones nuevas, calcula el contraste (fórmula de luminancia relativa de WCAG) antes de usarlas.

### 2.4 Uso del color

- **Regla 60-30-10:** 60 % neutros de fondo, 30 % superficies y texto, 10 % oliva. La cabecera y las barras son neutras.
- **Una sola acción primaria visible por pantalla.** El resto, `secundario` o `texto`.
- **Acento ciruela:** solo para detalles (iconos de los estados vacíos, ilustraciones, destacar un dato). Nunca para botones ni acciones, para no competir con el primario.
- **Rojo y verde de estado:**
  - El rojo, solo para errores y acciones destructivas.
  - El verde de éxito, solo para éxito y siempre con icono de check, para no confundirlo con el oliva de la marca.
- **Ámbar:** el aviso (#B45309) va siempre con icono de aviso o texto explícito, nunca como único indicador.
- **Estados del ganado:** van con icono y texto, además del color. Por ejemplo, "En supresión hasta 12/11", "Vendido" o "Baja".

---

## 3. Tipografía

Se usa la **fuente del sistema** (`--fuente`), sin descargas: carga al instante y funciona sin conexión. La escala sigue los roles de Material 3:

| Rol | Token | Tamaño / interlineado | Peso | Uso |
|---|---|---|---|---|
| Display | `--texto-2xl` | 36 / 44 | 600 | Cifras destacadas del panel |
| Headline | `--texto-xl` | 24 / 32 | 600 | Título de pantalla (`h1`) |
| Title L | `--texto-lg` | 20 / 28 | 600 | Título de sección o tarjeta |
| Title M | `--texto-base` | 16 / 24 | 500 | Título de fila, cabecera de tabla |
| Body L | `--texto-base` | 16 / 24 | 400 | Texto base y **campos** |
| Body M | `--texto-sm` | 14 / 20 | 400 | Texto secundario, celdas |
| Label | `--texto-xs` | 12 / 16 | 500 | Etiquetas, chips, ayudas, pestañas |

- **Campos:** el texto de los campos es siempre de 16 px o más, para evitar el zoom automático de iOS.
- **Cifras:** con `font-variant-numeric: tabular-nums` (pesos, kilos, importes y crotales en columnas).
- **Líneas:** de 70 caracteres como máximo.
- **Formatos:** fechas y números con `Intl` en `es-ES`, con las funciones de `src/formato.ts` (`fecha`, `numero`, `kilos`, `euros`).
  - Fechas: `dd/mm/aaaa`.
  - Números: coma decimal y punto de miles.
  - Euros: `1.234,50 €`.
  - Pesos: en kg.

---

## 4. Espaciado, forma y elevación

- **Espaciado:**
  - Rejilla de 8 px con medios pasos de 4 px: `--espacio-1` … `--espacio-7` (4, 8, 12, 16, 24, 32 y 48 px).
  - Márgenes de pantalla: 16 px en el móvil, 24 px desde `40rem` y 32 px desde `64rem`. Entre secciones, 24 px. Dentro de las tarjetas, 16 px.
- **Radios:**
  - `--radio-s` (8 px): controles (botones y campos).
  - `--radio-m` (12 px): tarjetas.
  - `--radio-l` (16 px): diálogos, hojas y botón flotante.
  - `--radio-completo`: chips, avatares e indicador de pestaña.
- **Elevación** (Material 3):
  - 0: contenido y tarjetas, con borde `--color-borde` y sin sombra.
  - 1 (`--sombra-1`): cabecera al hacer scroll.
  - 2 (`--sombra-2`): menús y botón flotante.
  - 3 (`--sombra-3`): diálogos, hojas y avisos.

---

## 5. Estructura y navegación

La estructura la da `src/diseno/Aplicacion.tsx`:

| Ventana | Ancho | Navegación |
|---|---|---|
| Móvil y tableta | < 64rem | Barra inferior con las cuatro secciones; selector de explotación en la cabecera |
| Pantalla ancha | ≥ 64rem | Menú lateral fijo con las secciones, el selector de explotación y los ajustes; contenido de hasta `--ancho-contenido-amplio` para tablas y filtros |

- **Diseño:** primero para 360–390 px, ampliando con `@media (min-width: 40rem)` y `@media (min-width: 64rem)`. Nunca hay scroll horizontal de página.
- **Zonas seguras:** respeta `env(safe-area-inset-*)` en la cabecera, la barra inferior y los botones fijos.
- **Secciones:** Animales, Comida, Fincas y Finanzas. **Al empleado no le aparece Finanzas.**
- **Barra inferior:**
  - Fondo `--color-superficie`, borde superior `--color-borde`, y alto `--altura-navegacion` más la zona segura.
  - Cada pestaña lleva un icono de 24 px dentro de una píldora de 64 × 32 px y debajo una etiqueta Label.
  - Activa: píldora `--color-primario-relleno` con el icono en `--color-sobre-primario`, etiqueta en `--color-primario`, peso 600 y `aria-current="page"` (lo pone `NavLink`).
  - Inactivas: `--color-texto-suave`.
- **Menú lateral:** la fila activa con `--color-primario-suave` y texto `--color-sobre-primario-suave`.
- **Cabecera:** neutra (`--color-superficie`), con la marca o el título de la pantalla y como mucho 2 acciones de icono; el resto, en un menú "⋯". En el móvil, el selector de explotación va aquí.
- **Acciones principales:** en el móvil, en la mitad inferior, al alcance del pulgar.
- **Rutas:** en español y en minúsculas: `/animales`, `/animales/:id`, `/comida/almacenes`.

---

## 6. Componentes (`src/componentes/`)

El catálogo base (GH-9) se puede ver en `/componentes` (solo en desarrollo, con selector de tema claro u oscuro); el README del frontend dice en qué archivo está cada componente. Los de la tabla que aún no existen (`Casilla`, `Opcion`, `Interruptor`, `ElementoLista`, `CabeceraSeccion`, `TarjetaCifra`, `BotonFlotante`, `AvisoSinConexion`) se crean en `src/componentes/` cuando los necesite la primera pantalla, y se añaden al catálogo.

### 6.1 Reglas comunes

- **Tamaño táctil:**
  - Mínimo 44 × 44 px (HIG, `--altura-tactil`).
  - 48 px de alto en botones y campos principales (Material, `--altura-control`).
  - Al menos 8 px entre objetivos táctiles.
- **Estados obligatorios** en todo elemento interactivo:

  | Estado | Tratamiento |
  |---|---|
  | Hover | Capa del color del contenido al 8 % (`color-mix(in srgb, currentColor 8%, transparent)`), o `--color-primario-intenso` en botones sólidos |
  | Foco (teclado) | Anillo de 2 px `--color-foco` separado 2 px (`:focus-visible`) |
  | Pulsado | Capa al 12 % + `transform: scale(0.98)` |
  | Deshabilitado | Opacidad 38 %, sin eventos. Nunca solo un cambio de color |
  | Cargando | Spinner en lugar del icono, ancho constante, deshabilitado y `aria-busy` |
  | Error | Borde y texto `--color-peligro` + mensaje bajo el campo |

- **Código:**
  - Componentes tipados, sin `any`.
  - `className` extensible.
  - En los controles de formulario, `ref` como prop (React 19, sin `forwardRef`).
- **Reutilización:** busca en `src/componentes/` antes de crear nada. Un patrón que se repite dos veces se convierte en componente, que se añade al catálogo.
  - Si solo lo usa una sección, va en su carpeta.
- **Textos:** todos en español, y los nombres de componentes y props también: `Boton`, `variante`, `alPulsar`, `cargando`.

### 6.2 Catálogo

| Componente | Especificación |
|---|---|
| **Boton** | Variantes `primario` (relleno), `secundario` (borde `--color-borde-fuerte`), `texto` (sin borde ni fondo) y `peligro`. Alturas 36, 48 y 56 px. El texto es un verbo: "Guardar parto", "Dar de baja". |
| **BotonIcono** | 48 × 48 px, con `aria-label` obligatorio. |
| **Campo / AreaTexto / Selector / CampoFecha** | Alto 48 px, borde `--color-borde-fuerte` y radio 8 px. Siempre con `etiqueta` visible encima y `ayuda` y `error` debajo. Nunca se usa el placeholder como etiqueta, salvo en el Buscador, que lleva `aria-label`. Teclado del móvil: `inputMode="decimal"` en pesos y cantidades, `inputMode="numeric"` en crotales y `type="date"` en fechas. |
| **Casilla / Opcion / Interruptor** | Área táctil de 48 px. La casilla vacía lleva borde `--color-borde-fuerte`; marcada, relleno primario y check `--color-sobre-primario`. El interruptor, solo para ajustes de efecto inmediato. |
| **Tarjeta** | Fondo `--color-fondo`, borde `--color-borde`, radio 12 px y padding 16 px. Partes: cabecera, contenido y pie. |
| **ElementoLista** | Alto mínimo de 56 px con una línea y 72 px con dos. Al inicio, icono, foto o casilla; en el centro, título (Title M) y subtítulo (Body M, `--color-texto-suave`); al final, Insignia o acción. Separador `--color-borde`. |
| **CabeceraSeccion** | Label en `--color-texto-suave` con contador ("Vacas · 42"), con 24 px de padding arriba y 4 px abajo. |
| **Tabla** | En escritorio, cabecera fija, ordenación, filas de 48 px y hover `--color-superficie`. En el móvil se convierte en una lista de `ElementoLista`. Las cifras van con `tabular-nums` y alineadas a la derecha. |
| **Buscador** | Alto 48 px, borde `--color-borde-fuerte`, icono de lupa, botón de borrar y espera de 300 ms tras teclear. |
| **Chip** | Alto 32 px (área táctil de 48 px) y radio completo. Sin seleccionar, borde `--color-borde-fuerte`. Seleccionado, fondo `--color-primario-suave`, texto `--color-sobre-primario-suave` y check. |
| **Insignia** | Alto 24 px, fondo suave, texto del color semántico e icono: "En tratamiento", "Gestante", "Vendido", "Baja". |
| **HojaInferior / Dialogo** | Diálogo centrado desde `40rem` y hoja inferior con asa de arrastre por debajo. Se cierra con Esc, con un clic fuera y con su botón. Mantiene el foco dentro mientras está abierta. Fondo `--color-superficie-elevada` sobre `--color-velo`. |
| **Confirmacion** (`useConfirmacion()`) | Para acciones destructivas. El título es una pregunta ("¿Dar de baja a la vaca 1234?") y el botón de `peligro` lleva el verbo exacto. |
| **Avisos** (`useAvisos()`) | En el móvil, abajo, encima de la barra inferior; en escritorio, abajo a la derecha. El de éxito dura 4 s y el de error se queda hasta cerrarlo. Al borrar o anular ofrece "Deshacer". |
| **Esqueleto** | Con la forma del contenido real, `--color-superficie` con pulso. |
| **EstadoVacio** | Icono, título, una frase de ayuda y la acción para crear el primero ("Añadir animal"). |
| **EstadoError** | Qué ha pasado, cómo resolverlo y el botón "Reintentar". |
| **TarjetaCifra** | Etiqueta, cifra en Display con `tabular-nums` y variación con flecha y signo, no solo con color. |
| **BotonFlotante** | 56 × 56 px y radio 16 px, primario con icono `--color-sobre-primario`, a 16 px del borde derecho y encima de la barra inferior. Solo en el móvil y solo para "Añadir". |
| **AvisoSinConexion** | Ver la sección 9. |

---

## 7. Plantillas de pantallas

Toda pantalla con datos resuelve **4 estados**:

1. **Cargando:** con Esqueleto. En las recargas se mantienen los datos anteriores.
2. **Vacío:** con EstadoVacio.
3. **Error:** con EstadoError.
4. **Con datos.**

| Pantalla | Estructura |
|---|---|
| **Inicio de sesión** | Centrada, de 400 px de ancho como máximo. Logo, "Usuario o email" y contraseña con mostrar u ocultar, y un botón primario a lo ancho. Los errores van bajo cada campo, y `autocomplete="username"` y `"current-password"`. **No hay registro**: los usuarios los crea el administrador. |
| **Selector de explotación** | Si el usuario tiene varias explotaciones, al entrar las elige de una lista (nombre y REGA). Después puede cambiar desde la cabecera o el menú lateral. |
| **Panel (inicio)** | Saludo breve, después de 2 a 4 TarjetaCifra (animales, partos previstos, stock bajo…), en 2 columnas en el móvil y 4 en escritorio, y luego "Pendiente" (partos próximos, fin de supresión, tratamientos) y "Actividad reciente". |
| **Listado** (animales, almacenes, fincas…) | Cabecera con el título y "⋯", después el Buscador (crotal o nombre), los chips de filtro (Todos, Vacas, Terneros, Toros, En tratamiento…) y la lista agrupada con CabeceraSeccion. Encima de la barra inferior, el BotonFlotante. En escritorio es una Tabla con los filtros a la vista. Las listas largas se virtualizan. |
| **Ficha** (detalle) | Cabecera con el título (crotal y nombre), la Insignia de estado y un menú (Editar, Anular, Dar de baja). El contenido va en Tarjetas por secciones: datos, reproducción, sanidad, pesos e historial. |
| **Formulario** (alta, parto, peso, tratamiento…) | En una HojaInferior o en una pantalla propia si es largo. Una columna en el móvil; dos en escritorio solo para campos cortos relacionados. Lleva valores por defecto razonables, como la fecha de hoy. Guardar (primario) y Cancelar (`texto`) van fijos abajo en el móvil. Se valida al salir del campo y al enviar, y avisa si hay cambios sin guardar. |
| **Ajustes** | Lista agrupada: Perfil, Explotación (para el administrador: usuarios y roles), Instalar app y Cuenta. "Cerrar sesión" va al final, como botón `texto` en color de peligro. |

**Datos de sanidad:** en tratamientos, partos y bajas se **anula, no se borra** (`docs/diseno.md`). La acción dice "Anular" y lo anulado se sigue viendo tachado y con su motivo.

---

## 8. Animaciones (Material 3 motion)

El movimiento explica qué ha pasado; nunca es decoración. Las animaciones se hacen con CSS (`transition` y `@keyframes`) y los tokens de movimiento:

| Tipo | Duración | Curva |
|---|---|---|
| Microinteracción (hover, pulsado, interruptor) | `--duracion-corta` (150 ms) | `ease-out` |
| Entrada de elementos | `--duracion-entrada` (250 ms) | `--curva-entrada` (desaceleración) |
| Salida de elementos | `--duracion-salida` (200 ms) | `--curva-salida` (aceleración) |
| Diálogo, hoja y cambio de pantalla | `--duracion-larga` (350 ms) | `--curva` (estándar) |

**Patrones:**
- **Cambio de pantalla:** fundido con un desplazamiento vertical de 8 px.
- **Cambio de pestaña:** la píldora del indicador se expande desde el centro.
- **Listas:** los elementos nuevos aparecen con un fundido.
- **Diálogo:** el fondo aparece con un fundido y el panel escala de 0,96 a 1.
- **Hoja inferior:** sube desde abajo y se cierra arrastrándola.

Anima solo `opacity` y `transform`.

**Movimiento reducido** (`prefers-reduced-motion`): los tokens de duración pasan a 0. Si un componente necesita que algo se note, usa un fundido simple dentro de `@media (prefers-reduced-motion: reduce)`, nunca un desplazamiento ni una escala.

---

## 9. Sin conexión (PWA)

**Manifest:** `name` y `short_name` "Marela", `display: "standalone"`, `start_url: "/"`, `theme_color: "#9DAD6F"` y `background_color: "#FFFFFF"`. Iconos de 192 px, 512 px y 512 px `maskable`, generados con `npm run iconos` desde `public/logo.svg`.

**Service worker** (`vite-plugin-pwa`, actualización con aviso):
- **Hoy:** solo se precachea la aplicación (HTML, JS, CSS e iconos). **La API no se cachea.**
- **Ciclo 6 (GH-31 a GH-33):** se trabaja sin conexión **solo en Animales y Fincas**. Cuando se diseñe:

  | Recurso | Estrategia |
  |---|---|
  | Aplicación | Precaché |
  | GET de la API de Animales y Fincas | `NetworkFirst`, 3 s de espera y la caché como respaldo |
  | Fotos | `CacheFirst`, 30 días |
  | POST, PATCH y DELETE | Nunca en caché; cola de sincronización |

  - **Seguridad:** los datos guardados en el móvil son de una explotación y de un usuario. Se borran al cerrar sesión y al cambiar de usuario, y se separan por explotación.
  - **Datos:** TanStack Query con `networkMode: "offlineFirst"` y la caché guardada en IndexedDB, para mostrar los últimos datos sin conexión.
  - **Cambios:** los que se hacen sin conexión se encolan y se envían al reconectar, con actualización optimista. Hasta enviarse, el elemento lleva un icono de reloj y "Pendiente de sincronizar" en el subtítulo. Los conflictos se resuelven como decida GH-33.

**Indicadores:**
- **Conexión:** un hook `useConexion()` con `navigator.onLine` y los eventos `online` y `offline`.
- **AvisoSinConexion:** bajo la cabecera, con fondo `--color-aviso-suave`, icono de aviso y el texto "Sin conexión. Los cambios se guardarán al reconectar." (`role="status"`).
- **Al reconectar:** el aviso "Conexión recuperada · N cambios sincronizados".
- **Acciones que necesitan red** (subir fotos o facturas, Finanzas): deshabilitadas, con la explicación visible.
- **Versión nueva:** el aviso persistente "Hay una versión nueva de Marela" con el botón "Actualizar" (`src/pwa/ActualizacionPwa.tsx`).
- **Instalación:** se captura `beforeinstallprompt` y se ofrece "Instalar app" en Ajustes, nunca como ventana emergente al entrar. En iOS se explica cómo hacerlo: Safari → Compartir → Añadir a pantalla de inicio.

---

## 10. Contenido y accesibilidad

**Textos:**
- En español de España, con frases cortas y un tono cercano.
- Con el vocabulario del ganadero: crotal, parto, destete, saneamiento, supresión, REGA, paca o silo.
- Los mensajes de error dicen qué pasa y qué hacer. Por ejemplo: "No hay conexión. El peso se guardará cuando vuelvas a tener cobertura."
- Sin mayúsculas sostenidas.

**Lista de comprobación antes de terminar una pantalla:**

- [ ] Se cumplen los contrastes de la sección 2.3 (texto 4,5:1, controles 3:1), en claro y en oscuro.
- [ ] Los objetivos táctiles miden 44 px o más y están separados 8 px o más.
- [ ] Se puede usar solo con el teclado, con un orden lógico, el foco visible y sin trampas de foco.
- [ ] El HTML es semántico (`button`, `nav`, `main`, `h1`–`h3` en orden), con un `h1` por página y `aria-label` en los botones de solo icono.
- [ ] Todos los campos tienen `label`, y los errores van asociados con `aria-describedby`. Los mensajes que cambian solos llevan `role="status"` o `aria-live`.
- [ ] Funciona con el texto ampliado al 200 % sin cortarse.
- [ ] Ningún estado se comunica solo con color (atención al ámbar de los avisos).
- [ ] Están los 4 estados de datos: cargando, vacío, error y con datos.
- [ ] El empleado no ve lo que no le corresponde (Finanzas, gestión de usuarios).
- [ ] Está probado a 360 px, 768 px y 1280 px, en claro y oscuro (`docker compose -f docker-compose.dev.yml up`, en `http://localhost:5173`).
- [ ] Hay tests con Testing Library del comportamiento: estados, validación y permisos.
- [ ] Los botones llevan un verbo, y los textos están en español y son concretos.

**Rendimiento:**
- Las rutas se cargan con `lazy()`.
- Las listas de más de unos 100 elementos se virtualizan, por ejemplo las de animales. La librería se acuerda antes de añadirla.
- Las imágenes llevan `loading="lazy"` y dimensiones fijas.

En el PR, marca "Probado en el móvil" solo si se ha probado en un móvil de verdad (en la red local o en el entorno de pruebas).
