ALTER TABLE "movimientos_comida" ADD CONSTRAINT "movimientos_comida_explotacion_id_unique" UNIQUE("explotacion_id","id");--> statement-breakpoint
CREATE TABLE "facturas_movimientos_comida" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"explotacion_id" uuid DEFAULT explotacion_actual() NOT NULL,
	"factura_id" uuid NOT NULL,
	"movimiento_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_por" uuid DEFAULT usuario_actual() NOT NULL,
	"modificado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"modificado_por" uuid DEFAULT usuario_actual() NOT NULL,
	CONSTRAINT "facturas_movimientos_comida_movimiento_unico" UNIQUE("movimiento_id")
);
--> statement-breakpoint
ALTER TABLE "facturas_movimientos_comida" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "facturas_movimientos_comida" ADD CONSTRAINT "facturas_movimientos_comida_explotacion_id_organization_id_fk" FOREIGN KEY ("explotacion_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_movimientos_comida" ADD CONSTRAINT "facturas_movimientos_comida_creado_por_user_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_movimientos_comida" ADD CONSTRAINT "facturas_movimientos_comida_modificado_por_user_id_fk" FOREIGN KEY ("modificado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_movimientos_comida" ADD CONSTRAINT "facturas_movimientos_comida_factura_fk" FOREIGN KEY ("explotacion_id","factura_id") REFERENCES "public"."facturas"("explotacion_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facturas_movimientos_comida" ADD CONSTRAINT "facturas_movimientos_comida_movimiento_fk" FOREIGN KEY ("explotacion_id","movimiento_id") REFERENCES "public"."movimientos_comida"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facturas_movimientos_comida_explotacion_idx" ON "facturas_movimientos_comida" USING btree ("explotacion_id");--> statement-breakpoint
CREATE INDEX "facturas_movimientos_comida_factura_idx" ON "facturas_movimientos_comida" USING btree ("factura_id");--> statement-breakpoint
CREATE POLICY "separacion_por_explotacion" ON "facturas_movimientos_comida" AS PERMISSIVE FOR ALL TO "marela_app" USING (explotacion_id = explotacion_actual()) WITH CHECK (explotacion_id = explotacion_actual());