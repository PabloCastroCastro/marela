ALTER TABLE "user" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "debe_cambiar_contrasena" boolean DEFAULT false NOT NULL;