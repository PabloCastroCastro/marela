CREATE TYPE "public"."tipo_abono" AS ENUM('mineral', 'organico');--> statement-breakpoint
CREATE TYPE "public"."tipo_aplicacion" AS ENUM('abono', 'fitosanitario');--> statement-breakpoint
CREATE TYPE "public"."unidad_dosis" AS ENUM('kg_ha', 't_ha', 'l_ha', 'm3_ha');--> statement-breakpoint
CREATE TABLE "aplicaciones" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"finca_id" uuid NOT NULL,
	"tipo" "tipo_aplicacion" NOT NULL,
	"fecha" date NOT NULL,
	"producto" text NOT NULL,
	"tipo_abono" "tipo_abono",
	"dosis" numeric(12, 3) NOT NULL,
	"unidad_dosis" "unidad_dosis" NOT NULL,
	"superficie" numeric(10, 4) NOT NULL,
	"aplicado_por_id" uuid,
	"aplicado_por_texto" text,
	"lote" text,
	"plaga" text,
	"dias_seguridad" integer DEFAULT 0 NOT NULL,
	"fin_seguridad" date GENERATED ALWAYS AS (fecha + dias_seguridad) STORED NOT NULL,
	"ropo" text,
	"equipo" text,
	"observaciones" text,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "aplicaciones_producto" CHECK (btrim("aplicaciones"."producto") <> ''),
	CONSTRAINT "aplicaciones_dosis" CHECK ("aplicaciones"."dosis" > 0),
	CONSTRAINT "aplicaciones_superficie" CHECK ("aplicaciones"."superficie" > 0 and "aplicaciones"."superficie" <= 100000),
	CONSTRAINT "aplicaciones_datos" CHECK (case "aplicaciones"."tipo"
        when 'abono' then "aplicaciones"."tipo_abono" is not null and "aplicaciones"."plaga" is null
          and "aplicaciones"."dias_seguridad" = 0 and "aplicaciones"."ropo" is null and "aplicaciones"."equipo" is null
        else "aplicaciones"."tipo_abono" is null and btrim(coalesce("aplicaciones"."plaga", '')) <> ''
      end),
	CONSTRAINT "aplicaciones_dias_seguridad" CHECK ("aplicaciones"."dias_seguridad" >= 0 and "aplicaciones"."dias_seguridad" <= 999),
	CONSTRAINT "aplicaciones_aplicado_por" CHECK (not ("aplicaciones"."aplicado_por_id" is not null and "aplicaciones"."aplicado_por_texto" is not null)),
	CONSTRAINT "aplicaciones_anulacion" CHECK (("aplicaciones"."anulado_en" is null and "aplicaciones"."anulado_por" is null and "aplicaciones"."motivo_anulacion" is null)
        or ("aplicaciones"."anulado_en" is not null and "aplicaciones"."anulado_por" is not null
          and btrim(coalesce("aplicaciones"."motivo_anulacion", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "aplicaciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_aplicado_por_id_user_id_fk" FOREIGN KEY ("aplicado_por_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_anulado_por_user_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aplicaciones" ADD CONSTRAINT "aplicaciones_finca_fk" FOREIGN KEY ("explotacion_id","finca_id") REFERENCES "public"."fincas"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aplicaciones_explotacion_idx" ON "aplicaciones" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "aplicaciones_finca_idx" ON "aplicaciones" USING btree ("finca_id","fecha");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "aplicaciones" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());