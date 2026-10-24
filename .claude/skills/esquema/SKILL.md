---
name: esquema
description: Cómo cambiar el esquema de la base de datos de Marela (PostgreSQL 18 + Drizzle). Incluye crear tablas de datos de una explotación con Row-Level Security y auditoría, generar y revisar migraciones, consultar con enExplotacion, el seed y los tests de separación. Úsala siempre que se añada o cambie una tabla, una columna, una restricción o una migración.
---

# Cambiar el esquema de la base de datos

La referencia es `backend/README.md` (sección "Base de datos") y el código de `backend/src/db/`. Aquí están las reglas y los pasos.

## Dónde está cada cosa

| Archivo | Qué contiene |
|---|---|
| `src/db/schema/` | Esquema de Drizzle. `index.ts` exporta todas las tablas |
| `src/db/schema/comun.ts` | `id()` (UUID v7 de PostgreSQL), y `creadoEn()` y `actualizadoEn()` para las tablas de Better Auth |
| `src/db/schema/auth.ts` | Tablas de Better Auth: `user`, `organization` (explotación, con REGA), `member` (rol `administrador` o `empleado`)… |
| `src/db/schema/explotacion.ts` | `deExplotacion()`, `auditoria()` y `separacionPorExplotacion()` |
| `src/db/explotacion.ts` | `enExplotacion()`: transacción con la explotación y el usuario de la petición |
| `drizzle/` | Migraciones SQL y sus snapshots. Las aplica el backend al arrancar |
| `src/db/seed.ts` | Datos de ejemplo |

## Tablas de datos de una explotación

Toda tabla con datos de una explotación (animales, comida, fincas, finanzas…) se define así:

```ts
export const animales = pgTable(
  'animales',
  {
    id: id(),
    ...deExplotacion(),
    crotal: text('crotal').notNull(),
    ...auditoria(),
  },
  (t) => [
    index('animales_explotacion_idx').on(t.explotacionId),
    unique('animales_crotal_unique').on(t.explotacionId, t.crotal),
    separacionPorExplotacion(),
  ],
)
```

Las tres piezas son obligatorias:

- **`deExplotacion()`:** la columna `explotacion_id`, que al insertar toma la explotación de la transacción.
- **`auditoria()`:** `creado_en`, `creado_por`, `modificado_en` y `modificado_por`. La modificación solo se actualiza en los `update` de Drizzle, no en SQL a mano.
- **`separacionPorExplotacion()`:** activa Row-Level Security y la política para el rol `marela_app`.

Más reglas:

- **Unicidad:** las restricciones únicas de negocio incluyen `explotacion_id` (un crotal es único en su explotación, no en toda la base de datos).
- **Claves foráneas entre tablas de datos:**
  - Usa `onDelete: 'restrict'` salvo que el borrado en cascada sea lo correcto.
  - Si la tabla relacionada también es de la explotación, plantéate una clave foránea compuesta (`explotacion_id`, `id`) para que la base de datos impida relacionar filas de explotaciones distintas.
- **Datos sanitarios:** en tratamientos, partos y bajas se anula en lugar de borrar (`docs/diseno.md`, "Aspectos generales de los datos"). Usa una columna de anulación con quién y cuándo.
- **Reglas en la base de datos:** las reglas que puede garantizar la base de datos van como `check`, `unique` o claves foráneas, no solo en la API.
  - Textos obligatorios no vacíos: `` sql`btrim(${t.campo}) <> ''` ``.
  - Formatos con expresión regular, como el REGA.
- **Nombres:**
  - Tablas y columnas propias en español y `snake_case` (`fecha_nacimiento`), con propiedades en `camelCase` (`fechaNacimiento`).
  - Las tablas de Better Auth conservan sus nombres en inglés.
- **Enumerados:** `pgEnum` para valores cerrados que no van a cambiar. Si se van a configurar por explotación, mejor una tabla.

## Consultar los datos

Las consultas a tablas de una explotación pasan siempre por `enExplotacion`:

```ts
const lista = await enExplotacion({ explotacionId, usuarioId }, (tx) =>
  tx.select().from(animales).where(eq(animales.estado, 'activo')),
)
```

- Fuera de `enExplotacion` el backend usa el rol de la conexión, al que la política no se aplica: vería todas las explotaciones. Usa `db` directamente solo con las tablas de Better Auth o para tareas de la plataforma.
- No pases `explotacionId` en los `insert`: lo pone la base de datos.
- Todo lo de una operación va en la misma llamada a `enExplotacion`: es una transacción y se deshace entera si algo falla.

## Migraciones

1. Cambia `src/db/schema/` y exporta la tabla nueva en `index.ts`.
2. Genera la migración:
   ```
   npm run db:generate -- --name descripcion_del_cambio
   ```
3. **Revisa el SQL generado** en `drizzle/`. Busca renombrados interpretados como borrar y crear, columnas `NOT NULL` sin valor por defecto en tablas con datos, el `ENABLE ROW LEVEL SECURITY` y la `CREATE POLICY` de cada tabla de explotación.
4. Para SQL que Drizzle no genera (funciones, triggers, permisos, datos), crea una migración vacía y escribe el SQL comentado:
   ```
   npm run db:generate -- --custom --name descripcion
   ```
5. Comprueba que no falta nada con `npm run db:check`.

**Nunca edites una migración que ya está en `develop`**: haz una nueva. Una migración de esta misma rama, sin mergear, sí se puede regenerar. Borra su `.sql`, su snapshot y su entrada en `drizzle/meta/_journal.json`, y genérala otra vez.

En producción, el despliegue hace copia de seguridad antes de migrar. Si una migración transforma datos existentes, avísalo en el PR.

## Tests

Los tests del backend van contra PostgreSQL (la base `marela_test`, que se crea y migra sola) y se ejecutan en el contenedor:

```
docker compose -f docker-compose.dev.yml exec -T backend npm test
```

- **Separación:** por cada tabla nueva de explotación, comprueba al menos que otra explotación no ve ni modifica sus filas. Usa como modelo `test/separacion.test.ts`.
- **Restricciones:** prueba las restricciones nuevas con el código de error de PostgreSQL. Por ejemplo, `23514` es un check, `23505` es único y `23503` es una clave foránea; se comprueba con `rejects.toMatchObject({ cause: { code } })`.
- **Datos de prueba:** la base de test no se vacía entre ejecuciones. Crea datos con valores únicos (`randomUUID()`) y no cuentes filas globales.

## Datos de ejemplo

Si la tabla nueva necesita datos de ejemplo, añádelos a `src/db/seed.ts`:

- Con identificadores fijos (`sid(TIPO, n)`, con un `TIPO` nuevo) y `onConflictDoNothing()`, para que siga siendo idempotente.
- Las tablas de explotación se cargan dentro de `enExplotacion`, con el usuario que figure como autor.

Actualiza la tabla de usuarios y datos de `backend/README.md` si cambia.
