CREATE TYPE "public"."tipo_parto" AS ENUM('normal', 'con_ayuda', 'cesarea');--> statement-breakpoint
CREATE TABLE "partos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"madre_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tipo" "tipo_parto" DEFAULT 'normal' NOT NULL,
	"padre_id" uuid,
	"padre_texto" text,
	"observaciones" text,
	"anulado_en" timestamp with time zone,
	"anulado_por" uuid,
	"motivo_anulacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "partos_explotacion_id_unique" UNIQUE("explotacion_id","id"),
	CONSTRAINT "partos_padre_uno" CHECK (not ("partos"."padre_id" is not null and "partos"."padre_texto" is not null)),
	CONSTRAINT "partos_anulacion" CHECK (("partos"."anulado_en" is null and "partos"."anulado_por" is null and "partos"."motivo_anulacion" is null)
        or ("partos"."anulado_en" is not null and "partos"."anulado_por" is not null
          and btrim(coalesce("partos"."motivo_anulacion", '')) <> ''))
);
--> statement-breakpoint
ALTER TABLE "partos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "animales" ALTER COLUMN "crotal" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "animales" ADD COLUMN "parto_id" uuid;--> statement-breakpoint
ALTER TABLE "partos" ADD CONSTRAINT "partos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partos" ADD CONSTRAINT "partos_anulado_por_user_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partos" ADD CONSTRAINT "partos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partos" ADD CONSTRAINT "partos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partos" ADD CONSTRAINT "partos_madre_fk" FOREIGN KEY ("explotacion_id","madre_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partos" ADD CONSTRAINT "partos_padre_fk" FOREIGN KEY ("explotacion_id","padre_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partos_explotacion_idx" ON "partos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "partos_madre_idx" ON "partos" USING btree ("madre_id","fecha");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "partos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());