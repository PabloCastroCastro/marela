-- Reglas de las facturas de las entradas de comida (GH-36) que una restricción de tabla no puede
-- comprobar, e historial de cambios de los enlaces.

-- Solo una factura recibida y una entrada comprada
CREATE OR REPLACE FUNCTION comprobar_factura_movimiento() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM facturas WHERE id = NEW.factura_id AND tipo = 'recibida'
  ) THEN
    RAISE EXCEPTION 'Solo las facturas recibidas tienen entradas de comida' USING ERRCODE = '23514', CONSTRAINT = 'facturas_movimientos_comida_recibida';
  END IF;
  IF NOT EXISTS (
    SELECT FROM movimientos_comida WHERE id = NEW.movimiento_id AND tipo = 'entrada' AND origen = 'compra'
  ) THEN
    RAISE EXCEPTION 'Solo las entradas compradas tienen factura' USING ERRCODE = '23514', CONSTRAINT = 'facturas_movimientos_comida_compra';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER facturas_movimientos_comida_comprobar
  BEFORE INSERT OR UPDATE OF factura_id, movimiento_id ON facturas_movimientos_comida
  FOR EACH ROW EXECUTE FUNCTION comprobar_factura_movimiento();
--> statement-breakpoint
-- Una entrada con factura sigue siendo una compra
CREATE OR REPLACE FUNCTION comprobar_movimiento_con_factura() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (NEW.tipo <> 'entrada' OR NEW.origen IS DISTINCT FROM 'compra') AND EXISTS (
    SELECT FROM facturas_movimientos_comida WHERE movimiento_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'La entrada tiene factura: tiene que seguir siendo una compra' USING ERRCODE = '23514', CONSTRAINT = 'facturas_movimientos_comida_compra';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER movimientos_comida_comprobar_factura
  BEFORE UPDATE OF tipo, origen ON movimientos_comida
  FOR EACH ROW EXECUTE FUNCTION comprobar_movimiento_con_factura();
--> statement-breakpoint
-- Una factura con animales o con entradas de comida no pasa a emitida (amplía la de la migración 0035)
CREATE OR REPLACE FUNCTION comprobar_tipo_factura() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.tipo <> 'recibida' AND EXISTS (
    SELECT FROM facturas_animales WHERE factura_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Solo las facturas recibidas tienen animales enlazados' USING ERRCODE = '23514', CONSTRAINT = 'facturas_animales_recibida';
  END IF;
  IF NEW.tipo <> 'recibida' AND EXISTS (
    SELECT FROM facturas_movimientos_comida WHERE factura_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Solo las facturas recibidas tienen entradas de comida' USING ERRCODE = '23514', CONSTRAINT = 'facturas_movimientos_comida_recibida';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER facturas_movimientos_comida_historial
  AFTER INSERT OR UPDATE OR DELETE ON facturas_movimientos_comida
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
