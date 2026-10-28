-- Historial de cambios de los pastoreos
CREATE TRIGGER pastoreos_historial
  AFTER INSERT OR UPDATE OR DELETE ON pastoreos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
