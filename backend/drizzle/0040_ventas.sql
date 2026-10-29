CREATE TYPE "public"."modo_precio_venta" AS ENUM('total', 'por_animal', 'por_kg');--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"fecha" date NOT NULL,
	"comprador" text NOT NULL,
	"modo_precio" "modo_precio_venta" NOT NULL,
	"precio" numeric(12, 3) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"factura_id" uuid,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "ventas_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "ventas_factura_unica" UNIQUE("factura_id"),
	CONSTRAINT "ventas_comprador_no_vacio" CHECK (btrim("ventas"."comprador") <> ''),
	CONSTRAINT "ventas_precio" CHECK ("ventas"."precio" > 0 and "ventas"."total" > 0)
);
--> statement-breakpoint
ALTER TABLE "ventas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ventas_animales" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"venta_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"kg" numeric(5, 1),
	"importe" numeric(12, 2) NOT NULL,
	"peso_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "ventas_animales_animal_unico" UNIQUE("animal_id"),
	CONSTRAINT "ventas_animales_kg" CHECK ("ventas_animales"."kg" is null or ("ventas_animales"."kg" > 0 and "ventas_animales"."kg" <= 2000)),
	CONSTRAINT "ventas_animales_importe" CHECK ("ventas_animales"."importe" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ventas_animales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_peso_id_pesos_id_fk" FOREIGN KEY ("peso_id") REFERENCES "public"."pesos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_venta_fk" FOREIGN KEY ("explotacion_id","venta_id") REFERENCES "public"."ventas"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_animales" ADD CONSTRAINT "ventas_animales_animal_fk" FOREIGN KEY ("explotacion_id","animal_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_explotacion_fecha_idx" ON "ventas" USING btree ("explotacion_id","fecha");--> statement-breakpoint
CREATE INDEX "ventas_animales_explotacion_idx" ON "ventas_animales" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "ventas_animales_venta_idx" ON "ventas_animales" USING btree ("venta_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "ventas" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "ventas_animales" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());