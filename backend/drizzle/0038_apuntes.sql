CREATE TYPE "public"."categoria_apunte" AS ENUM('subvencion', 'indemnizacion_seguro', 'otro_ingreso', 'seguro', 'veterinario', 'combustible', 'reparaciones', 'suministros', 'impuestos', 'otro_gasto');--> statement-breakpoint
CREATE TYPE "public"."tipo_apunte" AS ENUM('ingreso', 'gasto');--> statement-breakpoint
CREATE TABLE "apuntes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"tipo" "tipo_apunte" NOT NULL,
	"categoria" "categoria_apunte" NOT NULL,
	"fecha" date NOT NULL,
	"concepto" text NOT NULL,
	"importe" numeric(12, 2) NOT NULL,
	"observaciones" text,
	"archivo_ruta" text,
	"archivo_nombre" text,
	"archivo_tipo" text,
	"archivo_tamano" integer,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "apuntes_concepto_no_vacio" CHECK (btrim("apuntes"."concepto") <> ''),
	CONSTRAINT "apuntes_importe" CHECK ("apuntes"."importe" > 0),
	CONSTRAINT "apuntes_categoria" CHECK (("apuntes"."tipo" = 'ingreso' and "apuntes"."categoria" in ('subvencion', 'indemnizacion_seguro', 'otro_ingreso'))
        or ("apuntes"."tipo" = 'gasto' and "apuntes"."categoria" in ('seguro', 'veterinario', 'combustible', 'reparaciones', 'suministros', 'impuestos', 'otro_gasto'))),
	CONSTRAINT "apuntes_archivo" CHECK (("apuntes"."archivo_ruta" is null) = ("apuntes"."archivo_nombre" is null)
        and ("apuntes"."archivo_ruta" is null) = ("apuntes"."archivo_tipo" is null)
        and ("apuntes"."archivo_ruta" is null) = ("apuntes"."archivo_tamano" is null)),
	CONSTRAINT "apuntes_anulacion" CHECK (("apuntes"."anulado_en" is null and "apuntes"."anulado_por" is null and "apuntes"."motivo_anulacion" is null)
        or ("apuntes"."anulado_en" is not null and "apuntes"."anulado_por" is not null
          and btrim(coalesce("apuntes"."motivo_anulacion", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "apuntes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "apuntes" ADD CONSTRAINT "apuntes_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apuntes" ADD CONSTRAINT "apuntes_anulado_por_user_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apuntes" ADD CONSTRAINT "apuntes_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apuntes" ADD CONSTRAINT "apuntes_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apuntes_explotacion_fecha_idx" ON "apuntes" USING btree ("explotacion_id","fecha");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "apuntes" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());