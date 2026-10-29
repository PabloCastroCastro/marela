-- Reglas de las tareas de mantenimiento que una restricción de tabla no puede comprobar, e historial
-- de cambios de los equipos y las tareas.

-- A quien se asigna y quien la hace, si los hay, son de la explotación
CREATE OR REPLACE FUNCTION comprobar_tarea() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.asignada_a_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM member WHERE user_id = NEW.asignada_a_id AND organization_id = NEW.explotacion_id
  ) THEN
    RAISE EXCEPTION 'La persona asignada no es de la explotación' USING ERRCODE = '23514', CONSTRAINT = 'tareas_asignada_miembro';
  END IF;
  IF NEW.hecha_por_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM member WHERE user_id = NEW.hecha_por_id AND organization_id = NEW.explotacion_id
  ) THEN
    RAISE EXCEPTION 'Quien la hizo no es de la explotación' USING ERRCODE = '23514', CONSTRAINT = 'tareas_hecha_por_miembro';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER tareas_comprobar
  BEFORE INSERT OR UPDATE OF asignada_a_id, hecha_por_id ON tareas
  FOR EACH ROW EXECUTE FUNCTION comprobar_tarea();
--> statement-breakpoint
CREATE TRIGGER equipos_historial
  AFTER INSERT OR UPDATE OR DELETE ON equipos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
--> statement-breakpoint
CREATE TRIGGER tareas_historial
  AFTER INSERT OR UPDATE OR DELETE ON tareas
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
