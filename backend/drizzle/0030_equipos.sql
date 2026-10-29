CREATE TYPE "public"."tipo_equipo" AS ENUM('maquinaria', 'infraestructura');--> statement-breakpoint
CREATE TABLE "equipos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_equipo" NOT NULL,
	"descripcion" text,
	"necesita_mantenimiento" boolean DEFAULT false NOT NULL,
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
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipos" ADD CONSTRAINT "equipos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipos_nombre_unico" ON "equipos" USING btree ("explotacion_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "equipos_explotacion_idx" ON "equipos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "equipos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());