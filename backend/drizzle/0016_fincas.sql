CREATE TYPE "public"."regimen_finca" AS ENUM('propiedad', 'arrendamiento', 'aparceria', 'cesion', 'otro');--> statement-breakpoint
CREATE TABLE "fincas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"nombre" text NOT NULL,
	"municipio" text,
	"provincia" text,
	"regimen" "regimen_finca" DEFAULT 'propiedad' NOT NULL,
	"observaciones" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "fincas_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "fincas_nombre_no_vacio" CHECK (btrim("fincas"."nombre") <> '')
);
--> statement-breakpoint
ALTER TABLE "fincas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "parcelas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"finca_id" uuid NOT NULL,
	"sigpac_provincia" text,
	"sigpac_municipio" text,
	"sigpac_poligono" text,
	"sigpac_parcela" text,
	"sigpac_recinto" text,
	"referencia_catastral" text,
	"superficie" numeric(10, 4) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "parcelas_superficie" CHECK ("parcelas"."superficie" > 0 and "parcelas"."superficie" <= 100000),
	CONSTRAINT "parcelas_sigpac_completa" CHECK (num_nonnulls("parcelas"."sigpac_provincia", "parcelas"."sigpac_municipio", "parcelas"."sigpac_poligono", "parcelas"."sigpac_parcela", "parcelas"."sigpac_recinto") in (0, 5)),
	CONSTRAINT "parcelas_con_referencia" CHECK ("parcelas"."sigpac_recinto" is not null or "parcelas"."referencia_catastral" is not null)
);
--> statement-breakpoint
ALTER TABLE "parcelas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fincas" ADD CONSTRAINT "fincas_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fincas" ADD CONSTRAINT "fincas_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fincas" ADD CONSTRAINT "fincas_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_finca_fk" FOREIGN KEY ("explotacion_id","finca_id") REFERENCES "public"."fincas"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fincas_nombre_unico" ON "fincas" USING btree ("explotacion_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "fincas_explotacion_idx" ON "fincas" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "parcelas_explotacion_idx" ON "parcelas" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "parcelas_finca_idx" ON "parcelas" USING btree ("finca_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parcelas_sigpac_unico" ON "parcelas" USING btree ("explotacion_id","sigpac_provincia","sigpac_municipio","sigpac_poligono","sigpac_parcela","sigpac_recinto") WHERE "parcelas"."sigpac_recinto" is not null;--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "fincas" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "parcelas" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());