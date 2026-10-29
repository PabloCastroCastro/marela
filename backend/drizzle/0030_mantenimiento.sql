CREATE TYPE "public"."prioridad_tarea" AS ENUM('baja', 'normal', 'alta');--> statement-breakpoint
CREATE TYPE "public"."tipo_equipo" AS ENUM('maquinaria', 'infraestructura');--> statement-breakpoint
CREATE TABLE "equipos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_equipo" NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "equipos_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "equipos_nombre_no_vacio" CHECK (btrim("equipos"."nombre") <> '')
);
--> statement-breakpoint
ALTER TABLE "equipos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tareas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"titulo" text NOT NULL,
	"equipo_id" uuid,
	"descripcion" text,
	"fecha_limite" date,
	"prioridad" "prioridad_tarea" DEFAULT 'normal' NOT NULL,
	"asignada_a_id" uuid,
	"hecha_en" timestamp with time zone,
	"hecha_por_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "tareas_titulo_no_vacio" CHECK (btrim("tareas"."titulo") <> ''),
	CONSTRAINT "tareas_hecha" CHECK (("tareas"."hecha_en" is null) = ("tareas"."hecha_por_id" is null))
);
--> statement-breakpoint
ALTER TABLE "tareas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_asignada_a_id_user_id_fk" FOREIGN KEY ("asignada_a_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_hecha_por_id_user_id_fk" FOREIGN KEY ("hecha_por_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_equipo_fk" FOREIGN KEY ("explotacion_id","equipo_id") REFERENCES "public"."equipos"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipos_nombre_unico" ON "equipos" USING btree ("explotacion_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "equipos_explotacion_idx" ON "equipos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "tareas_explotacion_idx" ON "tareas" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "tareas_equipo_idx" ON "tareas" USING btree ("equipo_id");--> statement-breakpoint
CREATE INDEX "tareas_asignada_idx" ON "tareas" USING btree ("asignada_a_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "equipos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "tareas" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());