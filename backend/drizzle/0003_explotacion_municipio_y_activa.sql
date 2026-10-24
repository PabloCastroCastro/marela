ALTER TABLE "organization" ADD COLUMN "municipio" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "provincia" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "activa" boolean DEFAULT true NOT NULL;