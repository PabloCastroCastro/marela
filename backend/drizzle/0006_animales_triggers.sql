-- Reglas de los animales que una restricción de tabla no puede comprobar, e historial de cambios.

-- La madre enlazada es una hembra y el padre enlazado, un macho; y un animal con hijos no puede
-- cambiar de sexo. La misma explotación ya la garantizan las claves foráneas compuestas.
CREATE OR REPLACE FUNCTION comprobar_progenitores() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.madre_id IS NOT NULL AND (SELECT sexo FROM animales WHERE id = NEW.madre_id) <> 'hembra' THEN
    RAISE EXCEPTION 'La madre tiene que ser una hembra' USING ERRCODE = '23514', CONSTRAINT = 'animales_madre_hembra';
  END IF;
  IF NEW.padre_id IS NOT NULL AND (SELECT sexo FROM animales WHERE id = NEW.padre_id) <> 'macho' THEN
    RAISE EXCEPTION 'El padre tiene que ser un macho' USING ERRCODE = '23514', CONSTRAINT = 'animales_padre_macho';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.sexo IS DISTINCT FROM OLD.sexo AND EXISTS (
    SELECT 1 FROM animales WHERE madre_id = NEW.id OR padre_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'No se puede cambiar el sexo de un animal con hijos' USING ERRCODE = '23514', CONSTRAINT = 'animales_sexo_con_hijos';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER animales_progenitores
  BEFORE INSERT OR UPDATE OF madre_id, padre_id, sexo ON animales
  FOR EACH ROW EXECUTE FUNCTION comprobar_progenitores();
--> statement-breakpoint
-- Historial: cada alta, cambio o borrado de una tabla de datos queda en historial_cambios con el
-- estado anterior y el nuevo, la explotación, el usuario de la transacción y la fecha. Sirve para
-- cualquier tabla con id y explotacion_id: CREATE TRIGGER ... EXECUTE FUNCTION registrar_cambio().
CREATE OR REPLACE FUNCTION registrar_cambio() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO historial_cambios (explotacion_id, tabla, fila_id, operacion, despues)
      VALUES (NEW.explotacion_id, TG_TABLE_NAME, NEW.id, 'alta', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO historial_cambios (explotacion_id, tabla, fila_id, operacion, antes, despues)
      VALUES (NEW.explotacion_id, TG_TABLE_NAME, NEW.id, 'cambio', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO historial_cambios (explotacion_id, tabla, fila_id, operacion, antes)
      VALUES (OLD.explotacion_id, TG_TABLE_NAME, OLD.id, 'borrado', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END
$$;
--> statement-breakpoint
CREATE TRIGGER animales_historial
  AFTER INSERT OR UPDATE OR DELETE ON animales
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
