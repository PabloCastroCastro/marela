-- Reglas de los tratamientos que una restricción de tabla no puede comprobar, e historial de cambios.

-- El tratamiento es de la vida del animal en la explotación (no antes de su nacimiento ni después de
-- su baja) y quien lo administra, si es un usuario, es miembro de la explotación.
CREATE OR REPLACE FUNCTION comprobar_tratamiento() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  a animales%ROWTYPE;
BEGIN
  SELECT * INTO a FROM animales WHERE id = NEW.animal_id;
  IF NEW.fecha < a.fecha_nacimiento OR NEW.fecha > a.fecha_baja THEN
    RAISE EXCEPTION 'El tratamiento tiene que ser entre el nacimiento y la baja del animal' USING ERRCODE = '23514', CONSTRAINT = 'tratamientos_fecha_en_vida';
  END IF;
  IF NEW.aplicado_por_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM member WHERE user_id = NEW.aplicado_por_id AND organization_id = NEW.explotacion_id
  ) THEN
    RAISE EXCEPTION 'Quien administra el tratamiento no es de la explotación' USING ERRCODE = '23514', CONSTRAINT = 'tratamientos_aplicado_por_miembro';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tratamientos_comprobar
  BEFORE INSERT ON tratamientos
  FOR EACH ROW EXECUTE FUNCTION comprobar_tratamiento();
--> statement-breakpoint
-- Un tratamiento no se corrige ni se borra: solo se anula, una vez. Para la auditoría solo pueden
-- cambiar, además, la modificación y quién la hizo. La columna generada fin_supresion se calcula
-- después de este trigger (en NEW aún está vacía), así que tampoco se compara.
CREATE OR REPLACE FUNCTION proteger_tratamiento() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un tratamiento no se borra: se anula' USING ERRCODE = '23514', CONSTRAINT = 'tratamientos_inmutable';
  END IF;
  IF OLD.anulado_en IS NOT NULL
    OR (to_jsonb(NEW) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por,fin_supresion}'::text[])
      IS DISTINCT FROM (to_jsonb(OLD) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por,fin_supresion}'::text[])
  THEN
    RAISE EXCEPTION 'Un tratamiento no se corrige: se anula y se registra de nuevo' USING ERRCODE = '23514', CONSTRAINT = 'tratamientos_inmutable';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tratamientos_inmutable
  BEFORE UPDATE OR DELETE ON tratamientos
  FOR EACH ROW EXECUTE FUNCTION proteger_tratamiento();
--> statement-breakpoint
CREATE TRIGGER tratamientos_historial
  AFTER INSERT OR UPDATE OR DELETE ON tratamientos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
