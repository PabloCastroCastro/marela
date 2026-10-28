CREATE TYPE "public"."momento_pesada" AS ENUM('nacimiento', 'destete', 'venta', 'otro');--> statement-breakpoint
CREATE TABLE "pesos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"animal_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"kg" numeric(5, 1) NOT NULL,
	"momento" "momento_pesada" DEFAULT 'otro' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "pesos_kg" CHECK ("pesos"."kg" > 0 and "pesos"."kg" <= 2000)
);
--> statement-breakpoint
ALTER TABLE "pesos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pesos" ADD CONSTRAINT "pesos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesos" ADD CONSTRAINT "pesos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesos" ADD CONSTRAINT "pesos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesos" ADD CONSTRAINT "pesos_animal_fk" FOREIGN KEY ("explotacion_id","animal_id") REFERENCES "public"."animales"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pesos_explotacion_idx" ON "pesos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "pesos_animal_idx" ON "pesos" USING btree ("animal_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "pesos_momento_unico" ON "pesos" USING btree ("animal_id","momento") WHERE "pesos"."momento" <> 'otro';--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "pesos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());