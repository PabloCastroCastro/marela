CREATE TYPE "public"."motivo_tratamiento" AS ENUM('enfermedad', 'vacuna', 'desparasitacion', 'otro');--> statement-breakpoint
CREATE TYPE "public"."via_administracion" AS ENUM('intramuscular', 'subcutanea', 'intravenosa', 'oral', 'topica', 'intramamaria', 'intrauterina', 'otra');--> statement-breakpoint
CREATE TABLE "tratamientos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"animal_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"producto" text NOT NULL,
	"dosis" text,
	"via" "via_administracion",
	"motivo" "motivo_tratamiento" NOT NULL,
	"diagnostico" text,
	"aplicado_por_id" uuid,
	"aplicado_por_texto" text,
	"lote" text,
	"dias_supresion" integer DEFAULT 0 NOT NULL,
	"fin_supresion" date GENERATED ALWAYS AS (fecha + dias_supresion) STORED NOT NULL,
	"observaciones" text,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "tratamientos_producto" CHECK (btrim("tratamientos"."producto") <> ''),
	CONSTRAINT "tratamientos_dias_supresion" CHECK ("tratamientos"."dias_supresion" >= 0 and "tratamientos"."dias_supresion" <= 999),
	CONSTRAINT "tratamientos_aplicado_por" CHECK (not ("tratamientos"."aplicado_por_id" is not null and "tratamientos"."aplicado_por_texto" is not null)),
	CONSTRAINT "tratamientos_anulacion" CHECK (("tratamientos"."anulado_en" is null and "tratamientos"."anulado_por" is null and "tratamientos"."motivo_anulacion" is null)
        or ("tratamientos"."anulado_en" is not null and "tratamientos"."anulado_por" is not null
          and btrim(coalesce("tratamientos"."motivo_anulacion", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "tratamientos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_aplicado_por_id_user_id_fk" FOREIGN KEY ("aplicado_por_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_anulado_por_user_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tratamientos" ADD CONSTRAINT "tratamientos_animal_fk" FOREIGN KEY ("explotacion_id","animal_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tratamientos_explotacion_idx" ON "tratamientos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "tratamientos_animal_idx" ON "tratamientos" USING btree ("animal_id","fecha");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "tratamientos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());