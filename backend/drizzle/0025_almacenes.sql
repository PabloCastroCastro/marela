CREATE TYPE "public"."tipo_almacen" AS ENUM('hierba_verde', 'hierba_seca', 'maiz', 'pienso', 'otro');--> statement-breakpoint
CREATE TYPE "public"."unidad_almacen" AS ENUM('unidades', 'kg');--> statement-breakpoint
CREATE TABLE "almacenes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_almacen" NOT NULL,
	"unidad" "unidad_almacen" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "almacenes_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "almacenes_nombre_no_vacio" CHECK (btrim("almacenes"."nombre") <> '')
);
--> statement-breakpoint
ALTER TABLE "almacenes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "almacenes" ADD CONSTRAINT "almacenes_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "almacenes" ADD CONSTRAINT "almacenes_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "almacenes" ADD CONSTRAINT "almacenes_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "almacenes_nombre_unico" ON "almacenes" USING btree ("explotacion_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "almacenes_explotacion_idx" ON "almacenes" USING btree ("explotacion_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "almacenes" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());