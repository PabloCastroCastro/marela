-- Historial de cambios de los otros ingresos y gastos (GH-37)
CREATE TRIGGER apuntes_historial
  AFTER INSERT OR UPDATE OR DELETE ON apuntes
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
