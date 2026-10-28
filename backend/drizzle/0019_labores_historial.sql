-- Quien realiza la labor, si es un usuario, es miembro de la explotación; e historial de cambios
CREATE OR REPLACE FUNCTION comprobar_labor() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.realizada_por_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM member WHERE user_id = NEW.realizada_por_id AND organization_id = NEW.explotacion_id
  ) THEN
    RAISE EXCEPTION 'Quien realiza la labor no es de la explotación' USING ERRCODE = '23514', CONSTRAINT = 'labores_realizada_por_miembro';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER labores_comprobar
  BEFORE INSERT OR UPDATE OF realizada_por_id ON labores
  FOR EACH ROW EXECUTE FUNCTION comprobar_labor();
--> statement-breakpoint
CREATE TRIGGER labores_historial
  AFTER INSERT OR UPDATE OR DELETE ON labores
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
