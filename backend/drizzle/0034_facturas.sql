CREATE TYPE "public"."impuesto_factura" AS ENUM('iva', 'compensacion');--> statement-breakpoint
CREATE TYPE "public"."tipo_factura" AS ENUM('recibida', 'emitida');--> statement-breakpoint
CREATE TABLE "facturas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"tipo" "tipo_factura" NOT NULL,
	"numero" text NOT NULL,
	"fecha" date NOT NULL,
	"tercero" text NOT NULL,
	"nif" text NOT NULL,
	"nif_extranjero" boolean DEFAULT false NOT NULL,
	"concepto" text NOT NULL,
	"impuesto" "impuesto_factura" DEFAULT 'iva' NOT NULL,
	"lineas" jsonb NOT NULL,
	"base_imponible" numeric(12, 2) NOT NULL,
	"cuota" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"pagada_en" date,
	"archivo_ruta" text,
	"archivo_nombre" text,
	"archivo_tipo" text,
	"archivo_tamano" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "facturas_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "facturas_numero_no_vacio" CHECK (btrim("facturas"."numero") <> ''),
	CONSTRAINT "facturas_tercero_no_vacio" CHECK (btrim("facturas"."tercero") <> ''),
	CONSTRAINT "facturas_concepto_no_vacio" CHECK (btrim("facturas"."concepto") <> ''),
	CONSTRAINT "facturas_nif" CHECK (btrim("facturas"."nif") <> '' and ("facturas"."nif_extranjero" or "facturas"."nif" ~ '^([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$')),
	CONSTRAINT "facturas_lineas" CHECK (jsonb_typeof("facturas"."lineas") = 'array'
        and jsonb_array_length("facturas"."lineas") between 1 and 8),
	CONSTRAINT "facturas_total" CHECK ("facturas"."total" = "facturas"."base_imponible" + "facturas"."cuota"),
	CONSTRAINT "facturas_archivo" CHECK (("facturas"."archivo_ruta" is null) = ("facturas"."archivo_nombre" is null)
        and ("facturas"."archivo_ruta" is null) = ("facturas"."archivo_tipo" is null)
        and ("facturas"."archivo_ruta" is null) = ("facturas"."archivo_tamano" is null))
);
--> statement-breakpoint
ALTER TABLE "facturas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "facturas_animales" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"factura_id" uuid NOT NULL,
	"animal_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "facturas_animales_unico" UNIQUE("factura_id","animal_id")
);
--> statement-breakpoint
ALTER TABLE "facturas_animales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_animales" ADD CONSTRAINT "facturas_animales_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_animales" ADD CONSTRAINT "facturas_animales_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_animales" ADD CONSTRAINT "facturas_animales_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_animales" ADD CONSTRAINT "facturas_animales_factura_fk" FOREIGN KEY ("explotacion_id","factura_id") REFERENCES "public"."facturas"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_animales" ADD CONSTRAINT "facturas_animales_animal_fk" FOREIGN KEY ("explotacion_id","animal_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_emitidas_numero_unico" ON "facturas" USING btree ("explotacion_id",lower("numero")) WHERE "facturas"."tipo" = 'emitida';--> statement-breakpoint
CREATE UNIQUE INDEX "facturas_recibidas_numero_unico" ON "facturas" USING btree ("explotacion_id","nif",lower("numero")) WHERE "facturas"."tipo" = 'recibida';--> statement-breakpoint
CREATE INDEX "facturas_explotacion_fecha_idx" ON "facturas" USING btree ("explotacion_id","fecha");--> statement-breakpoint
CREATE INDEX "facturas_animales_explotacion_idx" ON "facturas_animales" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "facturas_animales_animal_idx" ON "facturas_animales" USING btree ("animal_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "facturas" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "facturas_animales" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());