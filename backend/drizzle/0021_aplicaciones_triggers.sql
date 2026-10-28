-- Reglas de los abonados y tratamientos fitosanitarios que una restricción de tabla no puede
-- comprobar, e historial de cambios.

-- Quien lo aplica, si es un usuario, es miembro de la explotación
CREATE OR REPLACE FUNCTION comprobar_aplicacion() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.aplicado_por_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM member WHERE user_id = NEW.aplicado_por_id AND organization_id = NEW.explotacion_id
  ) THEN
    RAISE EXCEPTION 'Quien lo aplica no es de la explotación' USING ERRCODE = '23514', CONSTRAINT = 'aplicaciones_aplicado_por_miembro';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER aplicaciones_comprobar
  BEFORE INSERT ON aplicaciones
  FOR EACH ROW EXECUTE FUNCTION comprobar_aplicacion();
--> statement-breakpoint
-- Una aplicación no se corrige ni se borra: solo se anula, una vez. Para la auditoría solo pueden
-- cambiar, además, la modificación y quién la hizo. La columna generada fin_seguridad se calcula
-- después de este trigger (en NEW aún está vacía), así que tampoco se compara.
CREATE OR REPLACE FUNCTION proteger_aplicacion() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un abonado o tratamiento no se borra: se anula' USING ERRCODE = '23514', CONSTRAINT = 'aplicaciones_inmutable';
  END IF;
  IF OLD.anulado_en IS NOT NULL
    OR (to_jsonb(NEW) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por,fin_seguridad}'::text[])
      IS DISTINCT FROM (to_jsonb(OLD) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por,fin_seguridad}'::text[])
  THEN
    RAISE EXCEPTION 'Un abonado o tratamiento no se corrige: se anula y se registra de nuevo' USING ERRCODE = '23514', CONSTRAINT = 'aplicaciones_inmutable';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER aplicaciones_inmutable
  BEFORE UPDATE OR DELETE ON aplicaciones
  FOR EACH ROW EXECUTE FUNCTION proteger_aplicacion();
--> statement-breakpoint
CREATE TRIGGER aplicaciones_historial
  AFTER INSERT OR UPDATE OR DELETE ON aplicaciones
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
