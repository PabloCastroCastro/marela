CREATE TABLE "pastoreos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"finca_id" uuid NOT NULL,
	"fecha_entrada" date NOT NULL,
	"fecha_salida" date,
	"animales" integer NOT NULL,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "pastoreos_animales" CHECK ("pastoreos"."animales" > 0 and "pastoreos"."animales" <= 9999),
	CONSTRAINT "pastoreos_fechas" CHECK ("pastoreos"."fecha_salida" >= "pastoreos"."fecha_entrada")
);
--> statement-breakpoint
ALTER TABLE "pastoreos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pastoreos" ADD CONSTRAINT "pastoreos_finca_fk" FOREIGN KEY ("explotacion_id","finca_id") REFERENCES "public"."fincas"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pastoreos_explotacion_idx" ON "pastoreos" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "pastoreos_finca_idx" ON "pastoreos" USING btree ("finca_id","fecha_entrada");--> statement-breakpoint
CREATE UNIQUE INDEX "pastoreos_en_curso_unico" ON "pastoreos" USING btree ("finca_id") WHERE "pastoreos"."fecha_salida" is null;--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "pastoreos" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());