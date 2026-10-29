-- Reglas de las ventas de animales (GH-38) que el esquema de Drizzle no expresa, e historial de cambios.

-- La factura de la venta, de la misma explotación. Al borrar la factura, la venta se queda sin ella
-- (solo factura_id: explotacion_id no se toca).
ALTER TABLE ventas ADD CONSTRAINT ventas_factura_fk
  FOREIGN KEY (explotacion_id, factura_id) REFERENCES facturas (explotacion_id, id)
  ON DELETE SET NULL (factura_id);
--> statement-breakpoint
-- La factura de una venta es emitida
CREATE OR REPLACE FUNCTION comprobar_factura_venta() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.factura_id IS NOT NULL AND NOT EXISTS (
    SELECT FROM facturas WHERE id = NEW.factura_id AND tipo = 'emitida'
  ) THEN
    RAISE EXCEPTION 'La factura de una venta es emitida' USING ERRCODE = '23514', CONSTRAINT = 'ventas_factura_emitida';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER ventas_comprobar_factura
  BEFORE INSERT OR UPDATE OF factura_id ON ventas
  FOR EACH ROW EXECUTE FUNCTION comprobar_factura_venta();
--> statement-breakpoint
-- Una factura con animales o entradas de comida no pasa a emitida, ni una con venta a recibida
-- (amplía la de la migración 0037)
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
  IF NEW.tipo <> 'emitida' AND EXISTS (
    SELECT FROM ventas WHERE factura_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'La factura de una venta es emitida' USING ERRCODE = '23514', CONSTRAINT = 'ventas_factura_emitida';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- Un animal vendido está de baja por venta
CREATE OR REPLACE FUNCTION comprobar_animal_vendido() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM animales WHERE id = NEW.animal_id AND estado = 'vendido' AND tipo_baja = 'venta'
  ) THEN
    RAISE EXCEPTION 'El animal vendido tiene que estar de baja por venta' USING ERRCODE = '23514', CONSTRAINT = 'ventas_animales_vendido';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ventas_animales_comprobar
  AFTER INSERT OR UPDATE OF animal_id ON ventas_animales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION comprobar_animal_vendido();
--> statement-breakpoint
CREATE TRIGGER ventas_historial
  AFTER INSERT OR UPDATE OR DELETE ON ventas
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
--> statement-breakpoint
CREATE TRIGGER ventas_animales_historial
  AFTER INSERT OR UPDATE OR DELETE ON ventas_animales
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
