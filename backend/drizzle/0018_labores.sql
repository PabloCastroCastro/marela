CREATE TYPE "public"."tipo_labor" AS ENUM('siembra', 'cosecha', 'otra');--> statement-breakpoint
CREATE TYPE "public"."unidad_cosecha" AS ENUM('kg', 't', 'pacas', 'rolos', 'remolques');--> statement-breakpoint
CREATE TABLE "labores" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"finca_id" uuid NOT NULL,
	"tipo" "tipo_labor" NOT NULL,
	"fecha" date NOT NULL,
	"cultivo" text,
	"labor" text,
	"superficie" numeric(10, 4) NOT NULL,
	"cantidad" numeric(12, 2),
	"unidad" "unidad_cosecha",
	"realizada_por_id" uuid,
	"realizada_por_texto" text,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "labores_superficie" CHECK ("labores"."superficie" > 0 and "labores"."superficie" <= 100000),
	CONSTRAINT "labores_datos" CHECK (case "labores"."tipo"
        when 'otra' then btrim(coalesce("labores"."labor", '')) <> '' and "labores"."cultivo" is null
          and "labores"."cantidad" is null
        else btrim(coalesce("labores"."cultivo", '')) <> '' and "labores"."labor" is null
      end),
	CONSTRAINT "labores_cantidad" CHECK (("labores"."cantidad" is null and "labores"."unidad" is null)
        or ("labores"."tipo" = 'cosecha' and "labores"."cantidad" > 0 and "labores"."unidad" is not null)),
	CONSTRAINT "labores_realizada_por" CHECK (not ("labores"."realizada_por_id" is not null and "labores"."realizada_por_texto" is not null))
);
--> statement-breakpoint
ALTER TABLE "labores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labores" ADD CONSTRAINT "labores_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labores" ADD CONSTRAINT "labores_realizada_por_id_user_id_fk" FOREIGN KEY ("realizada_por_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labores" ADD CONSTRAINT "labores_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labores" ADD CONSTRAINT "labores_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labores" ADD CONSTRAINT "labores_finca_fk" FOREIGN KEY ("explotacion_id","finca_id") REFERENCES "public"."fincas"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "labores_explotacion_idx" ON "labores" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "labores_finca_idx" ON "labores" USING btree ("finca_id","fecha");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "labores" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());