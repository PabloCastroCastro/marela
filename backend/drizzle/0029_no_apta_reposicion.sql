CREATE TYPE "public"."alcance_no_apta" AS ENUM('hijas', 'descendencia');--> statement-breakpoint
ALTER TABLE "animales" ADD COLUMN "no_apta_reposicion_desde" date;--> statement-breakpoint
ALTER TABLE "animales" ADD COLUMN "motivo_no_apta_reposicion" text;--> statement-breakpoint
ALTER TABLE "animales" ADD COLUMN "alcance_no_apta_reposicion" "alcance_no_apta";--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_no_apta_reposicion" CHECK (("animales"."no_apta_reposicion_desde" is null and "animales"."motivo_no_apta_reposicion" is null
          and "animales"."alcance_no_apta_reposicion" is null)
        or ("animales"."no_apta_reposicion_desde" is not null and btrim(coalesce("animales"."motivo_no_apta_reposicion", '')) <> ''
            and "animales"."alcance_no_apta_reposicion" is not null and "animales"."sexo" = 'hembra'));