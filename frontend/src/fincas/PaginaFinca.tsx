import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, PowerOff, RotateCcw } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, datos, ErrorApi } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha, hectareas } from '../formato'
import { CLAVE_FINCAS, REGIMENES, referenciaSigpac, useFinca } from './datos'
import estilos from './Fincas.module.css'
import { FormularioFinca } from './FormularioFinca'
import { MenuRegistrarFinca } from './MenuRegistrarFinca'
import { TarjetaLabores } from './TarjetaLabores'

// Ficha de una finca: sus datos y sus parcelas con las referencias SIGPAC y catastral (GH-25), y sus
// labores, con "Registrar" para apuntar las nuevas (GH-26)
export function PaginaFinca() {
  const explotacion = useExplotacionActual()
  const { fincaId = '' } = useParams()
  const finca = useFinca(explotacion.id, fincaId)
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [editando, setEditando] = useState(false)
  const lista = `${rutaExplotacion(explotacion.id)}/fincas`

  const cambiarEstado = useMutation({
    mutationFn: (activa: boolean) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/fincas/{fincaId}/estado', {
          params: { path: { explotacionId: explotacion.id, fincaId } },
          body: { activa },
        }),
      ),
    onSuccess: async (f) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_FINCAS, explotacion.id] })
      avisar({
        tipo: 'exito',
        mensaje: f.activa ? `${f.nombre} vuelve a estar activa` : `${f.nombre} desactivada`,
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const volver = (
    <Link to={lista} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      Fincas
    </Link>
  )

  if (finca.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '8rem' }, { alto: '6rem' }]} />
      </section>
    )
  }
  if (finca.isError) {
    const noExiste = finca.error instanceof ErrorApi && finca.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Esta finca no está en la explotación"
            descripcion="Puede que se haya escrito mal la dirección."
          />
        ) : (
          <EstadoError alReintentar={() => finca.refetch()} reintentando={finca.isFetching} />
        )}
      </section>
    )
  }

  const f = finca.data
  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>{f.nombre}</h1>
          <div className={estilos.subtitulo}>
            <span className={estilos.cifra}>{hectareas(f.superficie)}</span>
            {!f.activa && <Insignia icono={<PowerOff aria-hidden />}>Desactivada</Insignia>}
          </div>
        </div>
        <div className={estilos.acciones}>
          {f.activa && <MenuRegistrarFinca finca={f} />}
          {f.activa ? (
            <Boton
              variante="secundario"
              icono={<PowerOff aria-hidden size={18} />}
              cargando={cambiarEstado.isPending}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: `¿Desactivar ${f.nombre}?`,
                  mensaje:
                    'Deja de aparecer entre las fincas activas. Sus datos y su historial se conservan, y se puede reactivar.',
                  textoConfirmar: 'Desactivar',
                })
                if (ok) cambiarEstado.mutate(false)
              }}
            >
              Desactivar
            </Boton>
          ) : (
            <Boton
              variante="secundario"
              icono={<RotateCcw aria-hidden size={18} />}
              cargando={cambiarEstado.isPending}
              onClick={() => cambiarEstado.mutate(true)}
            >
              Reactivar
            </Boton>
          )}
          <Boton
            variante="secundario"
            icono={<Pencil aria-hidden size={18} />}
            onClick={() => setEditando(true)}
          >
            Editar
          </Boton>
        </div>
      </div>

      <div className={estilos.tarjetas}>
        <Tarjeta aria-labelledby="finca-datos">
          <h2 id="finca-datos" className={estilos.tituloTarjeta}>
            Datos
          </h2>
          <dl className={estilos.datos}>
            <Dato titulo="Municipio">
              {[f.municipio, f.provincia].filter(Boolean).join(', ') || 'Sin indicar'}
            </Dato>
            <Dato titulo="Régimen">{REGIMENES[f.regimen]}</Dato>
            {f.observaciones && (
              <Dato titulo="Observaciones">
                <span className={estilos.observaciones}>{f.observaciones}</span>
              </Dato>
            )}
          </dl>
        </Tarjeta>

        <Tarjeta aria-labelledby="finca-parcelas">
          <h2 id="finca-parcelas" className={estilos.tituloTarjeta}>
            Parcelas
          </h2>
          <ul className={estilos.parcelas} aria-label="Parcelas">
            {f.parcelas.map((p) => {
              const sigpac = referenciaSigpac(p)
              return (
                <li key={p.id}>
                  <div>
                    <span className={estilos.referencia}>
                      {sigpac ? `SIGPAC ${sigpac}` : `Catastro ${p.referenciaCatastral}`}
                    </span>
                    {sigpac && p.referenciaCatastral && (
                      <span className={estilos.suave}>Catastro {p.referenciaCatastral}</span>
                    )}
                  </div>
                  <span className={estilos.superficie}>{hectareas(p.superficie)}</span>
                </li>
              )
            })}
          </ul>
          {f.parcelas.length > 1 && (
            <p className={estilos.total}>
              <span>Total</span>
              <span className={estilos.cifra}>{hectareas(f.superficie)}</span>
            </p>
          )}
        </Tarjeta>

        <TarjetaLabores finca={f} />
      </div>

      <p className={estilos.suave}>
        Alta el {fecha(f.creadoEn)} · Última modificación el {fecha(f.modificadoEn)}
      </p>

      {editando && <FormularioFinca finca={f} alCerrar={() => setEditando(false)} />}
    </section>
  )
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className={estilos.dato}>
      <dt>{titulo}</dt>
      <dd>{children}</dd>
    </div>
  )
}
