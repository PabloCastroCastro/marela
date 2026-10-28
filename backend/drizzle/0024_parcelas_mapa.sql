ALTER TABLE "parcelas" DROP CONSTRAINT "parcelas_sigpac_completa";--> statement-breakpoint
DROP INDEX "parcelas_sigpac_unico";--> statement-breakpoint
ALTER TABLE "parcelas" ADD COLUMN "sigpac_agregado" text;--> statement-breakpoint
ALTER TABLE "parcelas" ADD COLUMN "sigpac_zona" text;--> statement-breakpoint
ALTER TABLE "parcelas" ADD COLUMN "uso" text;--> statement-breakpoint
ALTER TABLE "parcelas" ADD COLUMN "contorno" jsonb;--> statement-breakpoint
-- La referencia SIGPAC pasa de cinco a siete partes: las que ya hay tienen agregado y zona 0. No es
-- un cambio de nadie, así que no va al historial.
ALTER TABLE "parcelas" DISABLE TRIGGER "parcelas_historial";--> statement-breakpoint
UPDATE "parcelas" SET "sigpac_agregado" = '0', "sigpac_zona" = '0' WHERE "sigpac_recinto" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "parcelas" ENABLE TRIGGER "parcelas_historial";--> statement-breakpoint
CREATE UNIQUE INDEX "parcelas_sigpac_unico" ON "parcelas" USING btree ("explotacion_id","sigpac_provincia","sigpac_municipio","sigpac_agregado","sigpac_zona","sigpac_poligono","sigpac_parcela","sigpac_recinto") WHERE "parcelas"."sigpac_recinto" is not null;--> statement-breakpoint
ALTER TABLE "parcelas" ADD CONSTRAINT "parcelas_sigpac_completa" CHECK (num_nonnulls("parcelas"."sigpac_provincia", "parcelas"."sigpac_municipio", "parcelas"."sigpac_agregado", "parcelas"."sigpac_zona", "parcelas"."sigpac_poligono",
        "parcelas"."sigpac_parcela", "parcelas"."sigpac_recinto") in (0, 7));