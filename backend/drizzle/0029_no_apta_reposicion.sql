ALTER TABLE "animales" ADD COLUMN "no_apta_reposicion_desde" date;--> statement-breakpoint
ALTER TABLE "animales" ADD COLUMN "motivo_no_apta_reposicion" text;--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_no_apta_reposicion" CHECK (("animales"."no_apta_reposicion_desde" is null and "animales"."motivo_no_apta_reposicion" is null)
        or ("animales"."no_apta_reposicion_desde" is not null and btrim(coalesce("animales"."motivo_no_apta_reposicion", '')) <> ''
            and "animales"."sexo" = 'hembra'));