-- Reglas de las facturas que una restricción de tabla no puede comprobar, e historial de cambios de
-- las facturas y de sus animales.

-- Solo las facturas recibidas (compras) tienen animales enlazados; las ventas los enlazan desde
-- Ventas (GH-38)
CREATE OR REPLACE FUNCTION comprobar_factura_animal() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM facturas WHERE id = NEW.factura_id AND tipo = 'recibida'
  ) THEN
    RAISE EXCEPTION 'Solo las facturas recibidas tienen animales enlazados' USING ERRCODE = '23514', CONSTRAINT = 'facturas_animales_recibida';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER facturas_animales_comprobar
  BEFORE INSERT OR UPDATE OF factura_id ON facturas_animales
  FOR EACH ROW EXECUTE FUNCTION comprobar_factura_animal();
--> statement-breakpoint
-- Y una factura con animales no pasa a emitida
CREATE OR REPLACE FUNCTION comprobar_tipo_factura() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.tipo <> 'recibida' AND EXISTS (
    SELECT FROM facturas_animales WHERE factura_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Solo las facturas recibidas tienen animales enlazados' USING ERRCODE = '23514', CONSTRAINT = 'facturas_animales_recibida';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER facturas_comprobar_tipo
  BEFORE UPDATE OF tipo ON facturas
  FOR EACH ROW EXECUTE FUNCTION comprobar_tipo_factura();
--> statement-breakpoint
CREATE TRIGGER facturas_historial
  AFTER INSERT OR UPDATE OR DELETE ON facturas
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
--> statement-breakpoint
CREATE TRIGGER facturas_animales_historial
  AFTER INSERT OR UPDATE OR DELETE ON facturas_animales
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
