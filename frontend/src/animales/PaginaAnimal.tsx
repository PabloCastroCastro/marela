import { ArrowLeft, Pencil } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { edad, fecha } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, identificacion, SEXOS, useAnimal } from './datos'
import { FormularioAnimal } from './FormularioAnimal'
import { InsigniaEstado } from './InsigniaEstado'

// Ficha de un animal: sus datos, su madre y su padre, y sus hijos (GH-15)
export function PaginaAnimal() {
  const explotacion = useExplotacionActual()
  const { animalId = '' } = useParams()
  const animal = useAnimal(explotacion.id, animalId)
  const [editando, setEditando] = useState(false)
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
          </div>
        </div>
        <Boton
          variante="secundario"
          icono={<Pencil aria-hidden size={18} />}
          onClick={() => setEditando(true)}
        >
          Editar
        </Boton>
      </div>

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
            {a.estado !== 'activo' && (
              <Dato titulo="Baja">
                {fecha(a.fechaBaja ?? '')}
                {a.causaBaja ? `: ${a.causaBaja}` : ''}
              </Dato>
            )}
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
                    {h.estado !== 'activo' && ` · ${h.estado}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

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
