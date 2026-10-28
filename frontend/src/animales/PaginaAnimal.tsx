import { ArrowLeft, History, Pencil, Undo2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { useConfirmacion } from '../componentes/Confirmacion'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { edad, fecha } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, ESTADOS, identificacion, SEXOS, TIPOS_BAJA, useAnimal } from './datos'
import { FormularioAnimal } from './FormularioAnimal'
import { useDeshacerBaja } from './FormularioBaja'
import { InsigniaEstado } from './InsigniaEstado'
import { InsigniaGestacion } from './InsigniaGestacion'
import { InsigniaSinCrotal } from './InsigniaSinCrotal'
import { InsigniaSupresion } from './InsigniaSupresion'
import { MenuRegistrar } from './MenuRegistrar'
import { TarjetaPesos } from './TarjetaPesos'
import { TarjetaReproduccion } from './TarjetaReproduccion'
import { TarjetaTratamientos } from './TarjetaTratamientos'

// Ficha de un animal: sus datos, su madre y su padre, sus hijos (GH-15), su reproducción (GH-22),
// sus tratamientos (GH-20) y sus pesos (GH-21). "Registrar" da acceso a todo lo que se le puede
// registrar y "Historial", a su línea de tiempo completa (GH-24).
export function PaginaAnimal() {
  const explotacion = useExplotacionActual()
  const { animalId = '' } = useParams()
  const animal = useAnimal(explotacion.id, animalId)
  const [editando, setEditando] = useState(false)
  const deshacer = useDeshacerBaja(animalId)
  const confirmar = useConfirmacion()
  const lista = `${rutaExplotacion(explotacion.id)}/animales`

  const volver = (
    <Link to={lista} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      Animales
    </Link>
  )

  if (animal.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '8rem' }, { alto: '6rem' }]} />
      </section>
    )
  }
  if (animal.isError) {
    const noExiste = animal.error instanceof ErrorApi && animal.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Este animal no está en la explotación"
            descripcion="Puede que se haya escrito mal la dirección."
          />
        ) : (
          <EstadoError alReintentar={() => animal.refetch()} reintentando={animal.isFetching} />
        )}
      </section>
    )
  }

  const a = animal.data
  return (
    <section className={estilos.pagina}>
      <div className={estilos.navegacionFicha}>
        {volver}
        <Link to={`${lista}/${a.id}/historial`} className={estilos.volver}>
          <History aria-hidden size={20} />
          Historial
        </Link>
      </div>
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>
            {a.nombre ?? a.crotal ?? `${a.sexo === 'hembra' ? 'Ternera' : 'Ternero'} sin crotal`}
          </h1>
          <div className={estilos.subtitulo}>
            {a.nombre && a.crotal && <span className={estilos.cifra}>{a.crotal}</span>}
            <InsigniaEstado estado={a.estado} />
            {!a.crotal && a.estado === 'activo' && (
              <InsigniaSinCrotal nacimiento={a.fechaNacimiento} />
            )}
            {a.finSupresion && <InsigniaSupresion fin={a.finSupresion} />}
            {a.gestacion && <InsigniaGestacion gestacion={a.gestacion} />}
          </div>
        </div>
        <div className={estilos.acciones}>
          <MenuRegistrar animal={a} />
          <Boton
            variante="secundario"
            icono={<Pencil aria-hidden size={18} />}
            onClick={() => setEditando(true)}
          >
            Editar
          </Boton>
        </div>
      </div>

      {a.estado !== 'activo' && a.tipoBaja && (
        <Tarjeta aria-labelledby="ficha-baja" className={estilos.baja}>
          <h2 id="ficha-baja">Baja</h2>
          <dl className={estilos.datos}>
            <Dato titulo="Motivo">{TIPOS_BAJA[a.tipoBaja]}</Dato>
            <Dato titulo="Fecha">{fecha(a.fechaBaja ?? '')}</Dato>
            {a.causaBaja && (
              <Dato titulo={a.tipoBaja === 'otra' ? 'Causa' : 'Detalle'}>{a.causaBaja}</Dato>
            )}
          </dl>
          {a.tipoBaja === 'venta' ? (
            <p className={estilos.suave}>Una venta se deshace desde Finanzas.</p>
          ) : (
            <Boton
              variante="secundario"
              icono={<Undo2 aria-hidden size={18} />}
              cargando={deshacer.isPending}
              onClick={async () => {
                const ok = await confirmar({
                  titulo: '¿Deshacer la baja?',
                  mensaje: `${identificacion(a)} volverá a estar entre los animales activos. La baja quedará en el historial.`,
                  textoConfirmar: 'Deshacer la baja',
                })
                if (ok) deshacer.mutate()
              }}
            >
              Deshacer la baja
            </Boton>
          )}
        </Tarjeta>
      )}

      <div className={estilos.tarjetas}>
        <Tarjeta aria-labelledby="ficha-datos">
          <h2 id="ficha-datos">Datos</h2>
          <dl className={estilos.datos}>
            <Dato titulo="Crotal">
              {a.crotal ? (
                <span className={estilos.cifra}>{a.crotal}</span>
              ) : (
                <span className={estilos.suave}>Sin crotal: se pone desde Editar</span>
              )}
            </Dato>
            <Dato titulo="Raza">{a.raza}</Dato>
            <Dato titulo="Sexo">{SEXOS[a.sexo]}</Dato>
            <Dato titulo="Nacimiento">
              {fecha(a.fechaNacimiento)} ({edad(a.fechaNacimiento)})
            </Dato>
            <Dato titulo="Origen">
              {a.origen === 'nacido'
                ? 'Nacido en la explotación'
                : `Comprado, entró el ${fecha(a.fechaEntrada ?? '')} desde ${a.regaOrigen}`}
            </Dato>
          </dl>
        </Tarjeta>

        <Tarjeta aria-labelledby="ficha-familia">
          <h2 id="ficha-familia">Familia</h2>
          <dl className={estilos.datos}>
            <Dato titulo="Madre">
              <Progenitor ficha={a.madre} texto={a.madreTexto} lista={lista} />
            </Dato>
            <Dato titulo="Padre">
              <Progenitor ficha={a.padre} texto={a.padreTexto} lista={lista} />
            </Dato>
          </dl>
          <h3 className={estilos.subtituloTarjeta}>Hijos</h3>
          {a.hijos.length === 0 ? (
            <p className={estilos.suave}>Ninguno registrado</p>
          ) : (
            <ul className={estilos.hijos}>
              {a.hijos.map((h) => (
                <li key={h.id}>
                  <Link to={`${lista}/${h.id}`}>{identificacion(h)}</Link>
                  <span className={estilos.suave}>
                    {SEXOS[h.sexo]} · {fecha(h.fechaNacimiento)}
                    {h.estado !== 'activo' && ` · ${ESTADOS[h.estado].toLowerCase()}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        {(a.sexo === 'hembra' || a.madreId || a.madreTexto) && <TarjetaReproduccion animal={a} />}

        <TarjetaTratamientos animal={a} />

        <TarjetaPesos animal={a} />

        {a.observaciones && (
          <Tarjeta aria-labelledby="ficha-observaciones">
            <h2 id="ficha-observaciones">Observaciones</h2>
            <p className={estilos.observaciones}>{a.observaciones}</p>
          </Tarjeta>
        )}
      </div>

      <p className={estilos.suave}>
        Alta el {fecha(a.creadoEn)} · Última modificación el {fecha(a.modificadoEn)}
      </p>

      {/* Se monta de nuevo al abrirlo, para partir siempre de la ficha actual */}
      {editando && <FormularioAnimal abierto alCerrar={() => setEditando(false)} animal={a} />}
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

function Progenitor({
  ficha,
  texto,
  lista,
}: {
  ficha: AnimalDetalle['madre']
  texto: string | null
  lista: string
}) {
  if (ficha) return <Link to={`${lista}/${ficha.id}`}>{identificacion(ficha)}</Link>
  if (texto) return <>{texto}</>
  return <span className={estilos.suave}>Sin indicar</span>
}
