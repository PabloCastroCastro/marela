-- Stock de los almacenes, calculado de sus movimientos, historial de cambios y unidad fija.

-- Los movimientos de un almacén en orden (fecha y, el mismo día, el orden en que se registraron), con
-- lo que cambia cada uno el stock y el stock que deja. Un recuento deja el stock en la cantidad
-- contada: empieza un tramo nuevo, y lo anterior deja de contar. Se ejecuta con los permisos de quien
-- la llama: la Row-Level Security sigue aplicándose.
CREATE FUNCTION movimientos_con_stock(p_almacen uuid)
  RETURNS TABLE (movimiento_id uuid, orden bigint, diferencia numeric, stock numeric)
  LANGUAGE sql STABLE
  AS $$
  WITH ordenados AS (
    SELECT m.id, m.tipo, m.ajuste, m.cantidad,
      row_number() OVER w AS orden,
      count(*) FILTER (WHERE m.ajuste = 'recuento') OVER w AS tramo
    FROM movimientos_comida m
    WHERE m.almacen_id = p_almacen
    WINDOW w AS (ORDER BY m.fecha, m.creado_en, m.id)
  ), acumulados AS (
    SELECT o.*, sum(CASE
        WHEN o.ajuste = 'recuento' OR o.tipo = 'entrada' THEN o.cantidad
        ELSE -o.cantidad
      END) OVER (PARTITION BY o.tramo ORDER BY o.orden) AS stock
    FROM ordenados o
  )
  SELECT a.id, a.orden,
    CASE
      WHEN a.ajuste = 'recuento' THEN a.stock - coalesce(lag(a.stock) OVER (ORDER BY a.orden), 0)
      WHEN a.tipo = 'entrada' THEN a.cantidad
      ELSE -a.cantidad
    END,
    a.stock
  FROM acumulados a
$$;
--> statement-breakpoint
-- El stock actual: el que deja el último movimiento, o 0 si no hay ninguno
CREATE FUNCTION stock_almacen(p_almacen uuid) RETURNS numeric
  LANGUAGE sql STABLE
  AS $$
  SELECT coalesce(
    (SELECT s.stock FROM movimientos_con_stock(p_almacen) s ORDER BY s.orden DESC LIMIT 1),
    0
  )
$$;
--> statement-breakpoint
-- Con movimientos, la unidad de un almacén ya no cambia: sus cantidades dejarían de tener sentido
CREATE OR REPLACE FUNCTION comprobar_unidad_almacen() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.unidad <> OLD.unidad AND EXISTS (
    SELECT FROM movimientos_comida WHERE almacen_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'El almacén ya tiene movimientos: su unidad no cambia' USING ERRCODE = '23514', CONSTRAINT = 'almacenes_unidad_con_movimientos';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER almacenes_unidad
  BEFORE UPDATE OF unidad ON almacenes
  FOR EACH ROW EXECUTE FUNCTION comprobar_unidad_almacen();
--> statement-breakpoint
-- Historial de cambios de los movimientos
CREATE TRIGGER movimientos_comida_historial
  AFTER INSERT OR UPDATE OR DELETE ON movimientos_comida
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
