import { LogOut, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Boton, BotonIcono } from '../componentes/Boton'
import { Esqueleto, EstadoError } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { useRecorte } from '../componentes/Recorte'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import { RegistrosSinEnviar } from '../sinConexion/RegistrosSinEnviar'
import type { FincaDetalle } from './datos'
import estilos from './Fincas.module.css'
import { FormularioPastoreo } from './FormularioPastoreo'
import { FormularioSalida } from './FormularioSalida'
import { InsigniaPastoreo } from './InsigniaPastoreo'
import { animales, type Pastoreo, usePastoreoEnCurso, usePastoreos } from './pastoreos'

// Días entre la entrada y la salida
const dias = (p: Pastoreo) =>
  p.fechaSalida
    ? Math.round((Date.parse(p.fechaSalida) - Date.parse(p.fechaEntrada)) / 86_400_000)
    : null

// "Del 02/03/2026 al 20/03/2026 (18 días)" o "Desde el 18/10/2026, en curso"
const periodo = (p: Pastoreo) => {
  const n = dias(p)
  return p.fechaSalida
    ? `Del ${fecha(p.fechaEntrada)} al ${fecha(p.fechaSalida)} (${n} ${n === 1 ? 'día' : 'días'})`
    : `Desde el ${fecha(p.fechaEntrada)}, en curso`
}

// Pastoreos de la finca: el que está en curso, con su salida a mano, y el historial, con solo los
// últimos a la vista (GH-28)
export function TarjetaPastoreos({ finca }: { finca: FincaDetalle }) {
  const explotacion = useExplotacionActual()
  const pastoreos = usePastoreos(explotacion.id, finca.id)
  const [corrigiendo, setCorrigiendo] = useState<Pastoreo>()
  const [saliendo, setSaliendo] = useState(false)
  const recorte = useRecorte(pastoreos.data ?? [])
  const enCurso = usePastoreoEnCurso(finca)

  let contenido: ReactNode
  if (pastoreos.isPending) {
    contenido = <Esqueleto bloques={[{ alto: '4rem' }, { alto: '4rem' }]} />
  } else if (pastoreos.isError) {
    contenido = (
      <EstadoError alReintentar={() => pastoreos.refetch()} reintentando={pastoreos.isFetching} />
    )
  } else if (pastoreos.data.length === 0) {
    contenido = <p className={estilos.suave}>Sin pastoreos registrados</p>
  } else {
    contenido = (
      <ul className={estilos.registros} aria-label="Pastoreos">
        {recorte.elementos.map((p) => (
          <li key={p.id}>
            <div>
              <span className={estilos.tituloRegistro}>{animales(p.animales)}</span>
              <span className={estilos.suave}>{periodo(p)}</span>
              {p.observaciones && <span className={estilos.suave}>{p.observaciones}</span>}
            </div>
            <BotonIcono
              etiqueta={`Corregir el pastoreo del ${fecha(p.fechaEntrada)}`}
              icono={<Pencil aria-hidden size={18} />}
              onClick={() => setCorrigiendo(p)}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Tarjeta aria-labelledby="finca-pastoreos" className={estilos.tarjetaRegistros}>
      <h2 id="finca-pastoreos" className={estilos.tituloTarjeta}>
        Pastoreo
      </h2>
      <RegistrosSinEnviar
        etiqueta="Pastoreos sin enviar"
        de={(p) =>
          (p.tipo === 'pastoreo' || p.tipo === 'salida') && p.contexto.fincaId === finca.id
        }
      />
      {enCurso && (
        <div className={estilos.enCurso}>
          <InsigniaPastoreo pastoreo={enCurso} />
          <Boton
            variante="secundario"
            tamano="compacto"
            icono={<LogOut aria-hidden size={18} />}
            onClick={() => setSaliendo(true)}
          >
            Registrar la salida
          </Boton>
        </div>
      )}
      {contenido}
      {recorte.boton}
      {corrigiendo && (
        <FormularioPastoreo
          finca={finca}
          pastoreo={corrigiendo}
          alCerrar={() => setCorrigiendo(undefined)}
        />
      )}
      {saliendo && enCurso && (
        <FormularioSalida pastoreo={enCurso} finca={finca} alCerrar={() => setSaliendo(false)} />
      )}
    </Tarjeta>
  )
}
