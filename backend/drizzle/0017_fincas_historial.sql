-- Historial de cambios de las fincas y sus parcelas
CREATE TRIGGER fincas_historial
  AFTER INSERT OR UPDATE OR DELETE ON fincas
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
--> statement-breakpoint
CREATE TRIGGER parcelas_historial
  AFTER INSERT OR UPDATE OR DELETE ON parcelas
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio();
