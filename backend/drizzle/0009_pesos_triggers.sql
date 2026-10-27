-- Reglas de las pesadas que una restricción de tabla no puede comprobar, e historial de cambios.

-- La pesada es de la vida del animal en la explotación: no antes de su nacimiento ni después de
-- su baja.
CREATE OR REPLACE FUNCTION comprobar_fecha_pesada() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  a animales%ROWTYPE;
BEGIN
  SELECT * INTO a FROM animales WHERE id = NEW.animal_id;
  IF NEW.fecha < a.fecha_nacimiento OR NEW.fecha > a.fecha_baja THEN
    RAISE EXCEPTION 'La pesada tiene que ser entre el nacimiento y la baja del animal' USING ERRCODE = '23514', CONSTRAINT = 'pesos_fecha_en_vida';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER pesos_fecha
  BEFORE INSERT OR UPDATE OF fecha, animal_id ON pesos
  FOR EACH ROW EXECUTE FUNCTION comprobar_fecha_pesada();
--> statement-breakpoint
CREATE TRIGGER pesos_historial
  AFTER INSERT OR UPDATE OR DELETE ON pesos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
