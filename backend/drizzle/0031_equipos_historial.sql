-- Historial de cambios de los equipos
CREATE TRIGGER equipos_historial
  AFTER INSERT OR UPDATE OR DELETE ON equipos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
