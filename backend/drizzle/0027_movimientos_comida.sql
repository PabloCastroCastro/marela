CREATE TYPE "public"."origen_entrada_comida" AS ENUM('compra', 'produccion_propia');--> statement-breakpoint
CREATE TYPE "public"."tipo_ajuste_comida" AS ENUM('recuento', 'merma');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento_comida" AS ENUM('entrada', 'salida', 'ajuste');--> statement-breakpoint
CREATE TABLE "movimientos_comida" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"almacen_id" uuid NOT NULL,
	"tipo" "tipo_movimiento_comida" NOT NULL,
	"fecha" date NOT NULL,
	"cantidad" numeric(12, 2) NOT NULL,
	"origen" "origen_entrada_comida",
	"finca_id" uuid,
	"ajuste" "tipo_ajuste_comida",
	"motivo" text,
	"observaciones" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "movimientos_comida_cantidad" CHECK ("movimientos_comida"."cantidad" <= 100000000 and ("movimientos_comida"."cantidad" > 0
        or ("movimientos_comida"."ajuste" = 'recuento' and "movimientos_comida"."cantidad" = 0))),
	CONSTRAINT "movimientos_comida_datos" CHECK (case "movimientos_comida"."tipo"
        when 'entrada' then "movimientos_comida"."origen" is not null and "movimientos_comida"."ajuste" is null and "movimientos_comida"."motivo" is null
          and ("movimientos_comida"."finca_id" is null or "movimientos_comida"."origen" = 'produccion_propia')
        when 'salida' then "movimientos_comida"."origen" is null and "movimientos_comida"."finca_id" is null and "movimientos_comida"."ajuste" is null
          and "movimientos_comida"."motivo" is null
        else "movimientos_comida"."ajuste" is not null and btrim(coalesce("movimientos_comida"."motivo", '')) <> ''
          and "movimientos_comida"."origen" is null and "movimientos_comida"."finca_id" is null
      end)
);
--> statement-breakpoint
ALTER TABLE "movimientos_comida" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "movimientos_comida" ADD CONSTRAINT "movimientos_comida_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_comida" ADD CONSTRAINT "movimientos_comida_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_comida" ADD CONSTRAINT "movimientos_comida_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_comida" ADD CONSTRAINT "movimientos_comida_almacen_fk" FOREIGN KEY ("explotacion_id","almacen_id") REFERENCES "public"."almacenes"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_comida" ADD CONSTRAINT "movimientos_comida_finca_fk" FOREIGN KEY ("explotacion_id","finca_id") REFERENCES "public"."fincas"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_comida_explotacion_idx" ON "movimientos_comida" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "movimientos_comida_almacen_idx" ON "movimientos_comida" USING btree ("almacen_id","fecha");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "movimientos_comida" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());