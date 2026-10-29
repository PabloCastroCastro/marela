-- Almacenes por defecto de las explotaciones que ya existen; las nuevas los reciben al crearse
-- (src/almacenes.ts). Figuran como creados por su primer administrador. Van antes del trigger: no
-- son un cambio de nadie, así que no van al historial.
INSERT INTO almacenes (explotacion_id, nombre, tipo, unidad, creado_por, modificado_por)
SELECT o.id, d.nombre, d.tipo::tipo_almacen, d.unidad::unidad_almacen, m.user_id, m.user_id
FROM organization o
CROSS JOIN LATERAL (
  SELECT user_id FROM member
  WHERE organization_id = o.id AND role = 'administrador'
  ORDER BY created_at LIMIT 1
) m
CROSS JOIN (VALUES
  ('Pacas de hierba verde', 'hierba_verde', 'unidades', 1),
  ('Pacas de hierba seca', 'hierba_seca', 'unidades', 2),
  ('Silo de maíz', 'maiz', 'kg', 3),
  ('Silo de pienso', 'pienso', 'kg', 4)
) AS d (nombre, tipo, unidad, orden)
ORDER BY o.id, d.orden;
--> statement-breakpoint
-- Historial de cambios de los almacenes
CREATE TRIGGER almacenes_historial
  AFTER INSERT OR UPDATE OR DELETE ON almacenes
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
