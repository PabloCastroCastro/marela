import { ArrowLeft, Pencil, Undo2, UserRoundX } from 'lucide-react'
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
import { FormularioBaja, useDeshacerBaja } from './FormularioBaja'
import { InsigniaEstado } from './InsigniaEstado'
import { InsigniaSupresion } from './InsigniaSupresion'
import { TarjetaPesos } from './TarjetaPesos'
import { TarjetaTratamientos } from './TarjetaTratamientos'

// Ficha de un animal: sus datos, su madre y su padre, sus hijos (GH-15), sus
// tratamientos (GH-20) y sus pesos (GH-21)
export function PaginaAnimal() {
  const explotacion = useExplotacionActual()
  const { animalId = '' } = useParams()
  const animal = useAnimal(explotacion.id, animalId)
  const [editando, setEditando] = useState(false)
  const [dandoDeBaja, setDandoDeBaja] = useState(false)
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
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>{a.nombre ?? a.crotal}</h1>
          <div className={estilos.subtitulo}>
            {a.nombre && <span className={estilos.cifra}>{a.crotal}</span>}
            <InsigniaEstado estado={a.estado} />
            {a.finSupresion && <InsigniaSupresion fin={a.finSupresion} />}
          </div>
        </div>
        <div className={estilos.acciones}>
          {a.estado === 'activo' && (
            <Boton
              variante="secundario"
              className={estilos.peligro}
              icono={<UserRoundX aria-hidden size={18} />}
              onClick={() => setDandoDeBaja(true)}
            >
              Dar de baja
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
              <span className={estilos.cifra}>{a.crotal}</span>
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
      {dandoDeBaja && <FormularioBaja animal={a} alCerrar={() => setDandoDeBaja(false)} />}
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
