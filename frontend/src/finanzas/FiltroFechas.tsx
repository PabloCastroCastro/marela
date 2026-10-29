import { CampoFecha } from '../componentes/Campo'
import estilos from './Finanzas.module.css'

export type Fechas = { desde: string; hasta: string }

// Desde y hasta, para los listados de Finanzas (GH-39). Vacías, sin límite.
export function FiltroFechas({
  valor,
  alCambiar,
}: {
  valor: Fechas
  alCambiar: (f: Fechas) => void
}) {
  return (
    <div className={estilos.fechas}>
      <CampoFecha
        etiqueta="Desde"
        value={valor.desde}
        max={valor.hasta || undefined}
        onChange={(e) => alCambiar({ ...valor, desde: e.target.value })}
      />
      <CampoFecha
        etiqueta="Hasta"
        value={valor.hasta}
        min={valor.desde || undefined}
        onChange={(e) => alCambiar({ ...valor, hasta: e.target.value })}
      />
    </div>
  )
}

// Para la consulta: solo las que tienen valor
export const rangoFechas = ({ desde, hasta }: Fechas) => ({
  desde: desde || undefined,
  hasta: hasta || undefined,
})
