CREATE TYPE "public"."tipo_baja" AS ENUM('venta', 'muerte', 'sacrificio', 'robo_extravio', 'otra');--> statement-breakpoint
ALTER TYPE "public"."estado_animal" ADD VALUE 'baja';--> statement-breakpoint
ALTER TABLE "animales" DROP CONSTRAINT "animales_baja";--> statement-breakpoint
ALTER TABLE "animales" ADD COLUMN "tipo_baja" "tipo_baja";--> statement-breakpoint
-- Bajas anteriores a esta migración, sin tipo: el que corresponde a su estado
UPDATE "animales" SET "tipo_baja" = CASE "estado"::text
    WHEN 'vendido' THEN 'venta'::"tipo_baja"
    WHEN 'muerto' THEN 'muerte'::"tipo_baja"
  END
  WHERE "estado"::text <> 'activo';--> statement-breakpoint
ALTER TABLE "animales" ADD CONSTRAINT "animales_baja" CHECK (("animales"."estado"::text = 'activo' and "animales"."tipo_baja" is null and "animales"."fecha_baja" is null
            and "animales"."causa_baja" is null)
        or ("animales"."fecha_baja" is not null and ("animales"."tipo_baja"::text, "animales"."estado"::text) in (
            ('venta', 'vendido'), ('muerte', 'muerto'), ('sacrificio', 'muerto'),
            ('robo_extravio', 'baja'), ('otra', 'baja'))
          and ("animales"."tipo_baja"::text <> 'otra' or btrim(coalesce("animales"."causa_baja", '')) <> '')));