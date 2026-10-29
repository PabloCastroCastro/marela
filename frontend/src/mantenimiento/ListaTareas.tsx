import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Circle, CircleCheck, Flag, Pencil } from 'lucide-react'
import { useState } from 'react'
import { api, datos } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { BotonIcono } from '../componentes/Boton'
import { clases } from '../componentes/clases'
import { Insignia } from '../componentes/Etiquetas'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import { CLAVE_MANTENIMIENTO, type Tarea, vencida } from './datos'
import { FormularioTarea } from './FormularioTarea'
import estilos from './Mantenimiento.module.css'

// Lista de tareas de mantenimiento (GH-112): cada una se marca como hecha con un toque, o vuelve a
// pendiente, y se corrige con el lápiz. Sin el equipo cuando se ve dentro de su ficha.
export function ListaTareas({
  tareas,
  etiqueta,
  conEquipo = true,
}: {
  tareas: Tarea[]
  etiqueta: string
  conEquipo?: boolean
}) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [corrigiendo, setCorrigiendo] = useState<Tarea>()

  const marcar = useMutation({
    mutationFn: ({ t, hecha }: { t: Tarea; hecha: boolean }) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/tareas/{tareaId}/hecha', {
          params: { path: { explotacionId: explotacion.id, tareaId: t.id } },
          body: { hecha },
        }),
      ),
    onSuccess: async (t, { hecha }) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_MANTENIMIENTO, explotacion.id] })
      avisar({
        tipo: hecha ? 'exito' : 'info',
        mensaje: hecha ? `Hecha: ${t.titulo}` : `Otra vez pendiente: ${t.titulo}`,
        accion: { texto: 'Deshacer', alPulsar: () => marcar.mutate({ t, hecha: !hecha }) },
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  return (
    <>
      <ul className={estilos.tareas} aria-label={etiqueta}>
        {tareas.map((t) => (
          <li key={t.id} className={clases(t.hecha && estilos.hecha)}>
            <BotonIcono
              etiqueta={t.hecha ? `Volver a dejar pendiente: ${t.titulo}` : `Hecha: ${t.titulo}`}
              icono={
                t.hecha ? <CircleCheck aria-hidden size={26} /> : <Circle aria-hidden size={26} />
              }
              className={estilos.marcar}
              disabled={marcar.isPending && marcar.variables?.t.id === t.id}
              onClick={() => marcar.mutate({ t, hecha: !t.hecha })}
            />
            <div>
              <span className={estilos.tituloTarea}>{t.titulo}</span>
              <span className={estilos.suave}>
                {[
                  conEquipo && t.equipo?.nombre,
                  t.hecha
                    ? `Hecha el ${fecha(t.hecha.en)} por ${t.hecha.por.nombre}`
                    : (t.asignadaA?.nombre ?? 'Sin asignar'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {!t.hecha && (t.fechaLimite || t.prioridad === 'alta') && (
                <span className={estilos.insignias}>
                  {t.fechaLimite && (
                    <Insignia tipo={vencida(t) ? 'peligro' : 'neutro'}>
                      {vencida(t)
                        ? `Vencida el ${fecha(t.fechaLimite)}`
                        : `Hasta el ${fecha(t.fechaLimite)}`}
                    </Insignia>
                  )}
                  {t.prioridad === 'alta' && (
                    <Insignia tipo="aviso" icono={<Flag aria-hidden />}>
                      Prioridad alta
                    </Insignia>
                  )}
                </span>
              )}
            </div>
            <BotonIcono
              etiqueta={`Corregir: ${t.titulo}`}
              icono={<Pencil aria-hidden size={18} />}
              onClick={() => setCorrigiendo(t)}
            />
          </li>
        ))}
      </ul>
      {corrigiendo && (
        <FormularioTarea tarea={corrigiendo} alCerrar={() => setCorrigiendo(undefined)} />
      )}
    </>
  )
}
