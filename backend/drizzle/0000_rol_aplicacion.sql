-- Separación de datos por explotación con Row-Level Security (src/db/schema/explotacion.ts).
--
-- marela_app es el rol con el que el backend accede a los datos de una explotación: lo adopta con
-- SET LOCAL ROLE en cada transacción (enExplotacion). No inicia sesión y no es dueño de las tablas, así
-- que las políticas de Row-Level Security se le aplican siempre. Los roles son de todo el servidor de
-- PostgreSQL (la base de desarrollo y la de test lo comparten), por eso se crea solo si no existe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marela_app') THEN
    CREATE ROLE marela_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
-- El usuario que aplica las migraciones es el mismo con el que se conecta el backend: debe poder
-- adoptar el rol (un superusuario ya puede)
GRANT marela_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO marela_app;
--> statement-breakpoint
-- Permisos sobre las tablas que creen las migraciones; qué filas ve lo deciden las políticas
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO marela_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO marela_app;
--> statement-breakpoint
-- Explotación y usuario de la transacción, fijados por enExplotacion con set_config(..., true).
-- Sin fijar (o fuera de la transacción, donde quedan vacíos) devuelven null: la política no deja ver
-- ninguna fila y la auditoría no deja insertar.
CREATE OR REPLACE FUNCTION explotacion_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('marela.explotacion_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION usuario_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('marela.usuario_id', true), '')::uuid $$;
