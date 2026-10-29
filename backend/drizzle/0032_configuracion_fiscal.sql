CREATE TYPE "public"."regimen_fiscal" AS ENUM('reagp', 'general');--> statement-breakpoint
CREATE TABLE "configuracion_fiscal" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"regimen" "regimen_fiscal" DEFAULT 'reagp' NOT NULL,
	"compensacion_reagp" numeric(5, 2) DEFAULT 10.5 NOT NULL,
	"tipos_iva" numeric(5, 2)[] DEFAULT '{21,10,4}' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "configuracion_fiscal_explotacion_unica" UNIQUE("explotacion_id"),
	CONSTRAINT "configuracion_fiscal_compensacion" CHECK ("configuracion_fiscal"."compensacion_reagp" >= 0 and "configuracion_fiscal"."compensacion_reagp" <= 100),
	CONSTRAINT "configuracion_fiscal_tipos_iva" CHECK (cardinality("configuracion_fiscal"."tipos_iva") between 1 and 8
        and 0 <= all("configuracion_fiscal"."tipos_iva") and 100 >= all("configuracion_fiscal"."tipos_iva"))
);
--> statement-breakpoint
ALTER TABLE "configuracion_fiscal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "configuracion_fiscal" ADD CONSTRAINT "configuracion_fiscal_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracion_fiscal" ADD CONSTRAINT "configuracion_fiscal_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracion_fiscal" ADD CONSTRAINT "configuracion_fiscal_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "configuracion_fiscal" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());