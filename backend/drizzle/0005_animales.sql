CREATE TYPE "public"."estado_animal" AS ENUM('activo', 'vendido', 'muerto');--> statement-breakpoint
CREATE TYPE "public"."origen_animal" AS ENUM('nacido', 'comprado');--> statement-breakpoint
CREATE TYPE "public"."sexo_animal" AS ENUM('hembra', 'macho');--> statement-breakpoint
CREATE TABLE "animales" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"crotal" text NOT NULL,
	"nombre" text,
	"raza" text NOT NULL,
	"sexo" "sexo_animal" NOT NULL,
	"fecha_nacimiento" date NOT NULL,
	"madre_id" uuid,
	"madre_texto" text,
	"padre_id" uuid,
	"padre_texto" text,
	"origen" "origen_animal" DEFAULT 'nacido' NOT NULL,
	"fecha_entrada" date,
	"rega_origen" text,
	"estado" "estado_animal" DEFAULT 'activo' NOT NULL,
	"fecha_baja" date,
	"causa_baja" text,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "animales_crotal_unique" UNIQUE("crotal"),
	CONSTRAINT "animales_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "animales_crotal_formato" CHECK (("animales"."crotal" ~ '^ES[0-9]{12}$' or ("animales"."crotal" ~ '^[A-Z]{2}[0-9]{1,12}$' and left("animales"."crotal", 2) <> 'ES'))),
	CONSTRAINT "animales_raza_no_vacia" CHECK (btrim("animales"."raza") <> ''),
	CONSTRAINT "animales_nombre_no_vacio" CHECK (("animales"."nombre" is null or btrim("animales"."nombre") <> '')),
	CONSTRAINT "animales_madre_una" CHECK ("animales"."madre_id" is null or "animales"."madre_texto" is null),
	CONSTRAINT "animales_padre_uno" CHECK ("animales"."padre_id" is null or "animales"."padre_texto" is null),
	CONSTRAINT "animales_madre_no_propia" CHECK ("animales"."madre_id" is distinct from "animales"."id"),
	CONSTRAINT "animales_padre_no_propio" CHECK ("animales"."padre_id" is distinct from "animales"."id"),
	CONSTRAINT "animales_origen" CHECK (("animales"."origen" = 'nacido' and "animales"."fecha_entrada" is null and "animales"."rega_origen" is null)
        or ("animales"."origen" = 'comprado' and "animales"."fecha_entrada" is not null
            and "animales"."rega_origen" ~ '^ES[0-9]{12}$')),
	CONSTRAINT "animales_baja" CHECK (("animales"."estado" = 'activo' and "animales"."fecha_baja" is null and "animales"."causa_baja" is null)
        or ("animales"."estado" <> 'activo' and "animales"."fecha_baja" is not null))
);
--> statement-breakpoint
ALTER TABLE "animales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "historial_cambios" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"tabla" text NOT NULL,
	"fila_id" uuid NOT NULL,
	"operacion" text NOT NULL,
	"usuario_id" uuid DEFAULT usuario_actual(),
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"antes" jsonb,
	"despues" jsonb,
	CONSTRAINT "historial_operacion" CHECK ("historial_cambios"."operacion" in ('alta', 'cambio', 'borrado'))
);
--> statement-breakpoint
ALTER TABLE "historial_cambios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_madre_fk" FOREIGN KEY ("explotacion_id","madre_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_padre_fk" FOREIGN KEY ("explotacion_id","padre_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_cambios" ADD CONSTRAINT "historial_cambios_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_cambios" ADD CONSTRAINT "historial_cambios_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animales_explotacion_idx" ON "animales" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "animales_madre_idx" ON "animales" USING btree ("madre_id");--> statement-breakpoint
CREATE INDEX "animales_padre_idx" ON "animales" USING btree ("padre_id");--> statement-breakpoint
CREATE INDEX "historial_fila_idx" ON "historial_cambios" USING btree ("tabla","fila_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "animales" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "historial_cambios" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());