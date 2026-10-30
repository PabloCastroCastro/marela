import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileUp, Info, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { ElegirArchivo } from '../componentes/ElegirArchivo'
import { Cargando } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import estilos from './Censo.module.css'
import {
  type AnimalNuevoCenso,
  CAMPOS_DIFERENCIA,
  type Diferencia,
  importarCenso,
  type VistaPreviaCenso,
  vistaPreviaCenso,
} from './censo'
import { CLAVE_ANIMALES, SEXOS } from './datos'

// Importar los animales desde el censo en PDF de la Xunta (GH-130): se elige el PDF, se ve qué se
// dará de alta, qué ya está y qué falta en el censo, y se importan los nuevos, todos o ninguno.
// Solo el administrador.
export function PaginaCenso() {
  const explotacion = useExplotacionActual()
  const navegar = useNavigate()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [archivo, setArchivo] = useState<File | null>(null)
  const lista = `${rutaExplotacion(explotacion.id)}/animales`

  const vista = useMutation({ mutationFn: (pdf: File) => vistaPreviaCenso(explotacion.id, pdf) })
  const importar = useMutation({
    mutationFn: (pdf: File) => importarCenso(explotacion.id, pdf),
    onSuccess: async ({ creados }) => {
      await cliente.invalidateQueries({ queryKey: CLAVE_ANIMALES })
      avisar({
        tipo: 'exito',
        mensaje:
          creados === 1
            ? 'Se ha dado de alta 1 animal del censo'
            : `Se han dado de alta ${creados} animales del censo`,
      })
      navegar(lista)
    },
  })

  const elegir = (pdf: File | undefined) => {
    if (!pdf) return
    setArchivo(pdf)
    importar.reset()
    vista.mutate(pdf)
  }

  return (
    <section className={estilos.pagina}>
      <Link to={lista} className={estilos.volver}>
        <ArrowLeft aria-hidden size={20} />
        Animales
      </Link>
      <h1>Importar el censo</h1>
      <p className={estilos.explicacion}>
        Sube el PDF del censo a una fecha que descargas de la Xunta (Consellería do Medio Rural).
        Antes de importar verás qué animales se darán de alta. Los que ya están en Marela no se
        cambian.
      </p>
      <ElegirArchivo
        aceptar="application/pdf"
        texto={archivo ? 'Elegir otro PDF' : 'Elegir el PDF del censo'}
        icono={<FileUp aria-hidden size={18} />}
        alElegir={elegir}
      />
      {archivo && <p className={estilos.suave}>{archivo.name}</p>}

      {vista.isPending ? (
        <Cargando texto="Leyendo el censo…" />
      ) : vista.isError ? (
        <p className={estilos.error} role="alert">
          <TriangleAlert aria-hidden size={20} />
          {vista.error.message}
        </p>
      ) : vista.data && archivo ? (
        <Resumen
          vista={vista.data}
          lista={lista}
          importando={importar.isPending}
          error={importar.error?.message}
          alImportar={() => importar.mutate(archivo)}
        />
      ) : null}
    </section>
  )
}

function Resumen({
  vista,
  lista,
  importando,
  error,
  alImportar,
}: {
  vista: VistaPreviaCenso
  lista: string
  importando: boolean
  error?: string
  alImportar: () => void
}) {
  const comprados = vista.nuevos.filter((n) => n.origen === 'comprado').length
  const conDiferencias = vista.existentes.filter((e) => e.diferencias.length > 0)
  const n = vista.nuevos.length

  return (
    <div className={estilos.resumen}>
      <p className={estilos.cabecera}>
        Censo del {fecha(vista.fecha)} · REGA {vista.rega} ·{' '}
        {vista.total === 1 ? '1 animal' : `${vista.total} animales`}
      </p>

      <Tarjeta>
        <h2 className={estilos.titulo}>Se darán de alta · {n}</h2>
        {n === 0 ? (
          <p className={estilos.suave}>Todos los animales del censo ya están en Marela.</p>
        ) : (
          <>
            {comprados > 0 && (
              <p className={estilos.nota}>
                <Info aria-hidden size={20} />
                {comprados === 1
                  ? '1 nació en otra explotación: entra como comprado, '
                  : `${comprados} nacieron en otra explotación: entran como comprados, `}
                con la fecha del censo como fecha de entrada. Corrígela en su ficha si la sabes.
              </p>
            )}
            <ul className={estilos.lista} aria-label="Animales que se darán de alta">
              {vista.nuevos.map((a) => (
                <Nuevo key={a.crotal} animal={a} />
              ))}
            </ul>
          </>
        )}
      </Tarjeta>

      {vista.existentes.length > 0 && (
        <Tarjeta>
          <h2 className={estilos.titulo}>Ya están en Marela · {vista.existentes.length}</h2>
          <p className={estilos.suave}>
            No se cambian.{' '}
            {conDiferencias.length === 0
              ? 'Sus datos coinciden con el censo.'
              : conDiferencias.length === 1
                ? 'Uno tiene datos distintos en el censo: corrígelo en su ficha si hace falta.'
                : `${conDiferencias.length} tienen datos distintos en el censo: corrígelos en su ficha si hace falta.`}
          </p>
          {conDiferencias.length > 0 && (
            <ul className={estilos.lista} aria-label="Con datos distintos en el censo">
              {conDiferencias.map((e) => (
                <li key={e.id} className={estilos.elemento}>
                  <Link to={`${lista}/${e.id}`} className={estilos.crotal}>
                    {e.crotal}
                  </Link>
                  <ul className={estilos.diferencias}>
                    {e.diferencias.map((d) => (
                      <li key={d.campo}>
                        {CAMPOS_DIFERENCIA[d.campo]}: en el censo {valor(d, 'censo')}, en Marela{' '}
                        {valor(d, 'aplicacion')}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      )}

      {vista.ausentes.length > 0 && (
        <Tarjeta>
          <h2 className={estilos.titulo}>No están en el censo · {vista.ausentes.length}</h2>
          <p className={estilos.suave}>
            Siguen activos en Marela. No se dan de baja: revisa si se vendieron, murieron o se
            trasladaron.
          </p>
          <ul className={estilos.lista} aria-label="Activos que no están en el censo">
            {vista.ausentes.map((a) => (
              <li key={a.id} className={estilos.elemento}>
                <Link to={`${lista}/${a.id}`} className={estilos.crotal}>
                  {a.crotal}
                </Link>
                {a.nombre && <span className={estilos.suave}>{a.nombre}</span>}
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {error && (
        <p className={estilos.error} role="alert">
          <TriangleAlert aria-hidden size={20} />
          {error}
        </p>
      )}
      {n > 0 && (
        <div className={estilos.acciones}>
          <Boton cargando={importando} onClick={alImportar} anchoCompleto>
            {n === 1 ? 'Importar 1 animal' : `Importar ${n} animales`}
          </Boton>
        </div>
      )}
    </div>
  )
}

function Nuevo({ animal: a }: { animal: AnimalNuevoCenso }) {
  return (
    <li className={estilos.elemento}>
      <div className={estilos.fila}>
        <span className={estilos.crotal}>{a.crotal}</span>
        {a.origen === 'comprado' && <Insignia tipo="informacion">Comprado</Insignia>}
      </div>
      <span className={estilos.suave}>
        {SEXOS[a.sexo]} · {a.raza} · {a.sexo === 'hembra' ? 'nacida' : 'nacido'} el{' '}
        {fecha(a.fechaNacimiento)}
        {a.origen === 'comprado' && a.regaOrigen && ` en ${a.regaOrigen}`}
      </span>
      <span className={estilos.suave}>
        {a.madre
          ? `Madre: ${a.madre.crotal} (${a.madre.enCenso ? 'del censo' : 'ya en Marela'})`
          : a.madreTexto
            ? `Madre: ${a.madreTexto} (no está en Marela: se guarda su crotal)`
            : 'Sin madre en el censo'}
      </span>
    </li>
  )
}

// Un dato de la diferencia, como se lee
function valor(d: Diferencia, de: 'censo' | 'aplicacion') {
  const v = d[de]
  if (v === null) return 'sin dato'
  if (d.campo === 'sexo') return SEXOS[v as keyof typeof SEXOS].toLowerCase()
  if (d.campo === 'fechaNacimiento') return fecha(v)
  return v
}
