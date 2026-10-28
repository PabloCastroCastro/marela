CREATE TYPE "public"."metodo_diagnostico" AS ENUM('ecografia', 'palpacion');--> statement-breakpoint
CREATE TYPE "public"."resultado_diagnostico" AS ENUM('gestante', 'vacia');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_reproductivo" AS ENUM('cubricion', 'inseminacion', 'diagnostico', 'aborto', 'destete');--> statement-breakpoint
CREATE TABLE "eventos_reproductivos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"animal_id" uuid NOT NULL,
	"tipo" "tipo_evento_reproductivo" NOT NULL,
	"fecha" date NOT NULL,
	"padre_id" uuid,
	"padre_texto" text,
	"fecha_prevista_parto" date GENERATED ALWAYS AS (case when tipo in ('cubricion', 'inseminacion') then fecha + 283 end) STORED,
	"metodo" "metodo_diagnostico",
	"resultado" "resultado_diagnostico",
	"observaciones" text,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "eventos_reproductivos_datos" CHECK (case "eventos_reproductivos"."tipo"
        when 'cubricion' then "eventos_reproductivos"."metodo" is null and "eventos_reproductivos"."resultado" is null
          and not ("eventos_reproductivos"."padre_id" is not null and "eventos_reproductivos"."padre_texto" is not null)
          and ("eventos_reproductivos"."padre_id" is not null or btrim(coalesce("eventos_reproductivos"."padre_texto", '')) <> '')
        when 'inseminacion' then "eventos_reproductivos"."metodo" is null and "eventos_reproductivos"."resultado" is null
          and not ("eventos_reproductivos"."padre_id" is not null and "eventos_reproductivos"."padre_texto" is not null)
          and ("eventos_reproductivos"."padre_id" is not null or btrim(coalesce("eventos_reproductivos"."padre_texto", '')) <> '')
        when 'diagnostico' then "eventos_reproductivos"."padre_id" is null and "eventos_reproductivos"."padre_texto" is null
          and "eventos_reproductivos"."metodo" is not null and "eventos_reproductivos"."resultado" is not null
        else "eventos_reproductivos"."padre_id" is null and "eventos_reproductivos"."padre_texto" is null
          and "eventos_reproductivos"."metodo" is null and "eventos_reproductivos"."resultado" is null
      end),
	CONSTRAINT "eventos_reproductivos_anulacion" CHECK (("eventos_reproductivos"."anulado_en" is null and "eventos_reproductivos"."anulado_por" is null and "eventos_reproductivos"."motivo_anulacion" is null)
        or ("eventos_reproductivos"."anulado_en" is not null and "eventos_reproductivos"."anulado_por" is not null
          and btrim(coalesce("eventos_reproductivos"."motivo_anulacion", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ADD CONSTRAINT "eventos_reproductivos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ADD CONSTRAINT "eventos_reproductivos_anulado_por_user_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ADD CONSTRAINT "eventos_reproductivos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ADD CONSTRAINT "eventos_reproductivos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ADD CONSTRAINT "eventos_reproductivos_animal_fk" FOREIGN KEY ("explotacion_id","animal_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_reproductivos" ADD CONSTRAINT "eventos_reproductivos_padre_fk" FOREIGN KEY ("explotacion_id","padre_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_reproductivos_explotacion_idx" ON "eventos_reproductivos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "eventos_reproductivos_animal_idx" ON "eventos_reproductivos" USING btree ("animal_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_reproductivos_destete_unico" ON "eventos_reproductivos" USING btree ("animal_id") WHERE "eventos_reproductivos"."tipo" = 'destete' and "eventos_reproductivos"."anulado_en" is null;--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "eventos_reproductivos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());