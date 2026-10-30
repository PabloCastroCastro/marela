import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, ExternalLink, Paperclip, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FormularioAnulacion } from '../animales/FormularioAnulacion'
import { api, datos, ErrorApi } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { useConfirmacion } from '../componentes/Confirmacion'
import { ElegirArchivo } from '../componentes/ElegirArchivo'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia, Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha } from '../formato'
import {
  type Apunte,
  ARCHIVOS_ADMITIDOS,
  CATEGORIA,
  CLAVE_FINANZAS,
  subirArchivoApunte,
  TAMANO_MAXIMO_ARCHIVO,
  TIPOS_APUNTE,
  tamano,
  urlArchivoApunte,
  useApunte,
} from './datos'
import estilos from './Finanzas.module.css'
import { FormularioApunte } from './FormularioApunte'
import { ImporteApunte } from './ListaApuntes'

// Ficha de un ingreso o gasto sin factura (GH-37): sus datos y su archivo. Se corrige o, si se
// registró por error, se anula con su motivo: sigue a la vista, pero ya no cambia ni cuenta.
export function PaginaApunte() {
  const explotacion = useExplotacionActual()
  const { apunteId = '' } = useParams()
  const apunte = useApunte(explotacion.id, apunteId)
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const confirmar = useConfirmacion()
  const [editando, setEditando] = useState(false)
  const [anulando, setAnulando] = useState(false)
  const refrescar = () =>
    cliente.invalidateQueries({ queryKey: [...CLAVE_FINANZAS, explotacion.id] })
  const ruta = { params: { path: { explotacionId: explotacion.id, apunteId } } }

  const adjuntar = useMutation({
    mutationFn: (archivo: File) => subirArchivoApunte(explotacion.id, apunteId, archivo),
    onSuccess: async () => {
      await refrescar()
      avisar({ tipo: 'exito', mensaje: 'Archivo adjuntado' })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const quitarArchivo = useMutation({
    mutationFn: () =>
      datos(api.DELETE('/api/explotaciones/{explotacionId}/apuntes/{apunteId}/archivo', ruta)),
    onSuccess: async () => {
      await refrescar()
      avisar({ tipo: 'info', mensaje: 'Archivo quitado' })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const elegir = (archivo: File | undefined) => {
    if (!archivo) return
    if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
      avisar({ tipo: 'error', mensaje: 'El archivo ocupa más de 10 MB' })
      return
    }
    adjuntar.mutate(archivo)
  }

  const volver = (
    <Link
      to={`${rutaExplotacion(explotacion.id)}/finanzas?vista=apuntes`}
      className={estilos.volver}
    >
      <ArrowLeft aria-hidden size={20} />
      Otros ingresos y gastos
    </Link>
  )

  if (apunte.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '10rem' }]} />
      </section>
    )
  }
  if (apunte.isError && !apunte.data) {
    const noExiste = apunte.error instanceof ErrorApi && apunte.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Este ingreso o gasto no está en la explotación"
            descripcion="Puede que la dirección esté mal escrita."
          />
        ) : (
          <EstadoError alReintentar={() => apunte.refetch()} reintentando={apunte.isFetching} />
        )}
      </section>
    )
  }

  const a: Apunte = apunte.data
  const vigente = !a.anulacion
  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>{a.concepto}</h1>
          <div className={estilos.insignias}>
            <span className={estilos.suave}>
              {TIPOS_APUNTE[a.tipo]} · {CATEGORIA[a.categoria]} · {fecha(a.fecha)}
            </span>
            {a.anulacion && <Insignia tipo="peligro">Anulado</Insignia>}
          </div>
        </div>
        {vigente && (
          <div className={estilos.acciones}>
            <Boton
              variante="secundario"
              icono={<Pencil aria-hidden size={18} />}
              onClick={() => setEditando(true)}
            >
              Corregir
            </Boton>
            <Boton
              variante="texto"
              className={estilos.peligro}
              icono={<Ban aria-hidden size={18} />}
              onClick={() => setAnulando(true)}
            >
              Anular
            </Boton>
          </div>
        )}
      </div>

      {a.anulacion && (
        <p className={estilos.error}>
          Anulado el {fecha(a.anulacion.en)} por {a.anulacion.por}: {a.anulacion.motivo}. No cuenta
          en los totales.
        </p>
      )}

      <Tarjeta aria-labelledby="apunte-datos" className={estilos.tarjeta}>
        <h2 id="apunte-datos" className={estilos.tituloTarjeta}>
          Datos
        </h2>
        <dl className={estilos.datos}>
          <Dato titulo="Importe">
            <ImporteApunte apunte={a} />
          </Dato>
          <Dato titulo="Categoría">{CATEGORIA[a.categoria]}</Dato>
          <Dato titulo="Observaciones">
            <span className={estilos.descripcion}>{a.observaciones ?? 'Sin observaciones'}</span>
          </Dato>
        </dl>
      </Tarjeta>

      <Tarjeta aria-labelledby="apunte-archivo" className={estilos.tarjeta}>
        <h2 id="apunte-archivo" className={estilos.tituloTarjeta}>
          Archivo
        </h2>
        {a.archivo ? (
          <>
            <a
              href={urlArchivoApunte(explotacion.id, a.id)}
              target="_blank"
              rel="noopener"
              className={estilos.enlaceArchivo}
            >
              <Paperclip aria-hidden size={18} />
              <span>
                {a.archivo.nombre}{' '}
                <span className={estilos.suave}>· {tamano(a.archivo.tamano)}</span>
              </span>
              <ExternalLink aria-hidden size={16} />
            </a>
            {vigente && (
              <div className={estilos.acciones}>
                <ElegirArchivo
                  aceptar={ARCHIVOS_ADMITIDOS}
                  alElegir={elegir}
                  texto="Cambiar el archivo"
                />
                <Boton
                  variante="texto"
                  className={estilos.peligro}
                  cargando={quitarArchivo.isPending}
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: '¿Quitar el archivo?',
                      textoConfirmar: 'Quitar',
                      peligrosa: true,
                    })
                    if (ok) quitarArchivo.mutate()
                  }}
                >
                  Quitar
                </Boton>
              </div>
            )}
          </>
        ) : (
          <>
            <p className={estilos.suave}>Sin archivo.</p>
            {vigente && (
              <div className={estilos.acciones}>
                <ElegirArchivo aceptar={ARCHIVOS_ADMITIDOS} alElegir={elegir} />
              </div>
            )}
          </>
        )}
        {adjuntar.isPending && <p className={estilos.suave}>Subiendo el archivo…</p>}
      </Tarjeta>

      <p className={estilos.suave}>
        Registrado el {fecha(a.creadoEn)} · Última modificación el {fecha(a.modificadoEn)}
      </p>

      {editando && <FormularioApunte apunte={a} alCerrar={() => setEditando(false)} />}
      {anulando && (
        <FormularioAnulacion
          titulo={`¿Anular «${a.concepto}»?`}
          descripcion="No se borra: sigue a la vista como anulado, con el motivo, y deja de contar en los totales."
          textoBoton="Anular"
          ayuda="Por ejemplo: estaba repetido, o el importe era de otra explotación"
          mensajeExito={`Anulado: ${a.concepto}`}
          clave={CLAVE_FINANZAS}
          anular={(motivo) =>
            datos(
              api.POST('/api/explotaciones/{explotacionId}/apuntes/{apunteId}/anulacion', {
                ...ruta,
                body: { motivo },
              }),
            )
          }
          alCerrar={() => setAnulando(false)}
        />
      )}
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
