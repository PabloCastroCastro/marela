-- Historial de cambios de la configuración fiscal
CREATE TRIGGER configuracion_fiscal_historial
  AFTER INSERT OR UPDATE OR DELETE ON configuracion_fiscal
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
