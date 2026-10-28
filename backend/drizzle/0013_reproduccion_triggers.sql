-- Reglas de los eventos reproductivos que una restricción de tabla no puede comprobar, historial de
-- cambios y gestación en curso de una hembra.

-- Cubrición, inseminación, diagnóstico y aborto, solo en hembras. El evento es de la vida del animal
-- en la explotación (no antes de su nacimiento ni después de su baja) y el padre, si es de la
-- explotación, es un macho distinto del propio animal.
CREATE OR REPLACE FUNCTION comprobar_evento_reproductivo() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  a animales%ROWTYPE;
BEGIN
  SELECT * INTO a FROM animales WHERE id = NEW.animal_id;
  IF NEW.tipo <> 'destete' AND a.sexo <> 'hembra' THEN
    RAISE EXCEPTION 'Solo las hembras tienen cubriciones, inseminaciones, diagnósticos y abortos' USING ERRCODE = '23514', CONSTRAINT = 'eventos_reproductivos_hembra';
  END IF;
  IF NEW.fecha < a.fecha_nacimiento OR NEW.fecha > a.fecha_baja THEN
    RAISE EXCEPTION 'El evento tiene que ser entre el nacimiento y la baja del animal' USING ERRCODE = '23514', CONSTRAINT = 'eventos_reproductivos_fecha_en_vida';
  END IF;
  IF NEW.padre_id IS NOT NULL AND (NEW.padre_id = NEW.animal_id
    OR (SELECT sexo FROM animales WHERE id = NEW.padre_id) <> 'macho') THEN
    RAISE EXCEPTION 'El padre tiene que ser un macho' USING ERRCODE = '23514', CONSTRAINT = 'eventos_reproductivos_padre_macho';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER eventos_reproductivos_comprobar
  BEFORE INSERT ON eventos_reproductivos
  FOR EACH ROW EXECUTE FUNCTION comprobar_evento_reproductivo();
--> statement-breakpoint
-- Un evento no se corrige ni se borra: solo se anula, una vez. Para la auditoría solo pueden cambiar,
-- además, la modificación y quién la hizo. La columna generada fecha_prevista_parto se calcula
-- después de este trigger (en NEW aún está vacía), así que tampoco se compara.
CREATE OR REPLACE FUNCTION proteger_evento_reproductivo() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un evento reproductivo no se borra: se anula' USING ERRCODE = '23514', CONSTRAINT = 'eventos_reproductivos_inmutable';
  END IF;
  IF OLD.anulado_en IS NOT NULL
    OR (to_jsonb(NEW) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por,fecha_prevista_parto}'::text[])
      IS DISTINCT FROM (to_jsonb(OLD) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por,fecha_prevista_parto}'::text[])
  THEN
    RAISE EXCEPTION 'Un evento reproductivo no se corrige: se anula y se registra de nuevo' USING ERRCODE = '23514', CONSTRAINT = 'eventos_reproductivos_inmutable';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER eventos_reproductivos_inmutable
  BEFORE UPDATE OR DELETE ON eventos_reproductivos
  FOR EACH ROW EXECUTE FUNCTION proteger_evento_reproductivo();
--> statement-breakpoint
CREATE TRIGGER eventos_reproductivos_historial
  AFTER INSERT OR UPDATE OR DELETE ON eventos_reproductivos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
--> statement-breakpoint
-- Gestación en curso de una hembra, de sus eventos sin anular. La cierra el último aborto o
-- diagnóstico negativo; después de él, la última cubrición o inseminación da la fecha prevista de
-- parto y un diagnóstico positivo la confirma. Sin filas si no hay gestación en curso. Se ejecuta
-- con los permisos de quien la llama: la Row-Level Security sigue aplicándose.
CREATE OR REPLACE FUNCTION gestacion(p_animal uuid)
  RETURNS TABLE (desde date, fecha_prevista_parto date, confirmada boolean)
  LANGUAGE sql STABLE
  AS $$
  WITH eventos AS (
    SELECT * FROM eventos_reproductivos WHERE animal_id = p_animal AND anulado_en IS NULL
  ), cierre AS (
    SELECT coalesce(max(fecha), '-infinity'::date) AS fecha FROM eventos
    WHERE tipo = 'aborto' OR (tipo = 'diagnostico' AND resultado = 'vacia')
  ), cubricion AS (
    SELECT e.fecha, e.fecha_prevista_parto FROM eventos e, cierre
    WHERE e.tipo IN ('cubricion', 'inseminacion') AND e.fecha > cierre.fecha
    ORDER BY e.fecha DESC, e.creado_en DESC LIMIT 1
  ), positivo AS (
    SELECT max(e.fecha) AS fecha FROM eventos e, cierre
    WHERE e.tipo = 'diagnostico' AND e.resultado = 'gestante' AND e.fecha > cierre.fecha
  )
  SELECT c.fecha, c.fecha_prevista_parto, p.fecha IS NOT NULL
  FROM positivo p LEFT JOIN cubricion c ON true
  WHERE c.fecha IS NOT NULL OR p.fecha IS NOT NULL
$$;
