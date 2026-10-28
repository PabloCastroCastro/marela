-- Reglas de los partos que una restricción de tabla no puede comprobar, historial de cambios, enlace
-- de los terneros con su parto y gestación en curso, que ahora también cierra el parto.

-- Los terneros, enlazados a su parto de la misma explotación. Al anular un parto se borran sus
-- terneros antes; mientras tenga terneros, el parto no se puede borrar (ni se borra: se anula).
ALTER TABLE "animales" ADD CONSTRAINT "animales_parto_fk" FOREIGN KEY ("explotacion_id","parto_id") REFERENCES "public"."partos"("explotacion_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "animales_parto_idx" ON "animales" USING btree ("parto_id");
--> statement-breakpoint
-- La madre es una hembra, el parto es de su vida en la explotación (no antes de su nacimiento ni
-- después de su baja) y el padre, si es de la explotación, es un macho.
CREATE OR REPLACE FUNCTION comprobar_parto() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  m animales%ROWTYPE;
BEGIN
  SELECT * INTO m FROM animales WHERE id = NEW.madre_id;
  IF m.sexo <> 'hembra' THEN
    RAISE EXCEPTION 'La madre tiene que ser una hembra' USING ERRCODE = '23514', CONSTRAINT = 'partos_madre_hembra';
  END IF;
  IF NEW.fecha < m.fecha_nacimiento OR NEW.fecha > m.fecha_baja THEN
    RAISE EXCEPTION 'El parto tiene que ser entre el nacimiento y la baja de la madre' USING ERRCODE = '23514', CONSTRAINT = 'partos_fecha_en_vida';
  END IF;
  IF NEW.padre_id IS NOT NULL AND (SELECT sexo FROM animales WHERE id = NEW.padre_id) <> 'macho' THEN
    RAISE EXCEPTION 'El padre tiene que ser un macho' USING ERRCODE = '23514', CONSTRAINT = 'partos_padre_macho';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER partos_comprobar
  BEFORE INSERT ON partos
  FOR EACH ROW EXECUTE FUNCTION comprobar_parto();
--> statement-breakpoint
-- Un parto no se corrige ni se borra: solo se anula, una vez. Para la auditoría solo pueden cambiar,
-- además, la modificación y quién la hizo.
CREATE OR REPLACE FUNCTION proteger_parto() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un parto no se borra: se anula' USING ERRCODE = '23514', CONSTRAINT = 'partos_inmutable';
  END IF;
  IF OLD.anulado_en IS NOT NULL
    OR (to_jsonb(NEW) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por}'::text[])
      IS DISTINCT FROM (to_jsonb(OLD) - '{anulado_en,anulado_por,motivo_anulacion,modificado_en,modificado_por}'::text[])
  THEN
    RAISE EXCEPTION 'Un parto no se corrige: se anula y se registra de nuevo' USING ERRCODE = '23514', CONSTRAINT = 'partos_inmutable';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER partos_inmutable
  BEFORE UPDATE OR DELETE ON partos
  FOR EACH ROW EXECUTE FUNCTION proteger_parto();
--> statement-breakpoint
CREATE TRIGGER partos_historial
  AFTER INSERT OR UPDATE OR DELETE ON partos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
--> statement-breakpoint
-- La de la migración 0013, con el parto como cierre de la gestación y el padre de la cubrición o
-- inseminación, para los terneros. Cambia lo que devuelve: hay que borrarla y crearla de nuevo.
DROP FUNCTION gestacion(uuid);
--> statement-breakpoint
CREATE FUNCTION gestacion(p_animal uuid)
  RETURNS TABLE (
    desde date,
    fecha_prevista_parto date,
    confirmada boolean,
    padre_id uuid,
    padre_texto text
  )
  LANGUAGE sql STABLE
  AS $$
  WITH eventos AS (
    SELECT * FROM eventos_reproductivos WHERE animal_id = p_animal AND anulado_en IS NULL
  ), cierre AS (
    SELECT greatest(
      (SELECT max(fecha) FROM eventos
        WHERE tipo = 'aborto' OR (tipo = 'diagnostico' AND resultado = 'vacia')),
      (SELECT max(fecha) FROM partos WHERE madre_id = p_animal AND anulado_en IS NULL),
      '-infinity'::date
    ) AS fecha
  ), cubricion AS (
    SELECT e.fecha, e.fecha_prevista_parto, e.padre_id, e.padre_texto FROM eventos e, cierre
    WHERE e.tipo IN ('cubricion', 'inseminacion') AND e.fecha > cierre.fecha
    ORDER BY e.fecha DESC, e.creado_en DESC LIMIT 1
  ), positivo AS (
    SELECT max(e.fecha) AS fecha FROM eventos e, cierre
    WHERE e.tipo = 'diagnostico' AND e.resultado = 'gestante' AND e.fecha > cierre.fecha
  )
  SELECT c.fecha, c.fecha_prevista_parto, p.fecha IS NOT NULL, c.padre_id, c.padre_texto
  FROM positivo p LEFT JOIN cubricion c ON true
  WHERE c.fecha IS NOT NULL OR p.fecha IS NOT NULL
$$;
