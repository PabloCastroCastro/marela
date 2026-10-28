import { ArrowLeft, Ban } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Chips, Insignia } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { fecha, kilos } from '../formato'
import estilos from './Animales.module.css'
import { type AnimalDetalle, identificacion, TIPOS_BAJA, useAnimal } from './datos'
import { deEvento, deParto, unir } from './entradasReproduccion'
import { MenuRegistrar } from './MenuRegistrar'
import { conGanancia, ganancia, MOMENTOS, usePesadas } from './pesos'
import { useEventos, usePartos } from './reproduccion'
import { MOTIVOS_TRATAMIENTO, useTratamientos } from './tratamientos'

type Categoria = 'reproduccion' | 'tratamientos' | 'pesos' | 'altaBaja'
type Filtro = Categoria | 'todo'

const CATEGORIAS: Record<Categoria, string> = {
  reproduccion: 'Reproducción',
  tratamientos: 'Tratamientos',
  pesos: 'Pesos',
  altaBaja: 'Alta y baja',
}

type Entrada = {
  clave: string
  categoria: Categoria
  fecha: string
  // Para ordenar lo del mismo día
  orden: string
  titulo: string
  detalle: ReactNode[]
  lineas: ReactNode[]
  anulacion: { en: string; por: string; motivo: string } | null
}

// Historial del animal (GH-24): todo lo registrado, del más reciente al más antiguo, agrupado por año
// y con filtro por tipo. Los traslados entre explotaciones (GH-19) se añadirán cuando existan.
export function PaginaHistorial() {
  const explotacion = useExplotacionActual()
  const { animalId = '' } = useParams()
  const animal = useAnimal(explotacion.id, animalId)
  const hembra = animal.data?.sexo === 'hembra'
  const pesadas = usePesadas(explotacion.id, animalId)
  const tratamientos = useTratamientos(explotacion.id, animalId)
  const eventos = useEventos(explotacion.id, animalId)
  const partos = usePartos(explotacion.id, animalId, hembra)
  const [filtro, setFiltro] = useState<Filtro>('todo')
  const lista = `${rutaExplotacion(explotacion.id)}/animales`
  const enlace = (a: { id: string; crotal: string | null; nombre: string | null }) => (
    <Link key={a.id} to={`${lista}/${a.id}`}>
      {identificacion(a)}
    </Link>
  )

  const volver = (
    <Link to={`${lista}/${animalId}`} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      {animal.data ? identificacion(animal.data) : 'Ficha'}
    </Link>
  )

  const consultas = [animal, pesadas, tratamientos, eventos, ...(hembra ? [partos] : [])]
  if (consultas.some((c) => c.isPending)) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto bloques={[{ alto: '2rem', ancho: '50%' }, { alto: '4rem' }, { alto: '4rem' }]} />
      </section>
    )
  }
  if (animal.isError && animal.error instanceof ErrorApi && animal.error.estado === 404) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <EstadoVacio
          titulo="Este animal no está en la explotación"
          descripcion="Puede que se haya escrito mal la dirección."
        />
      </section>
    )
  }
  if (consultas.some((c) => c.isError) || !animal.data) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <EstadoError
          alReintentar={() => {
            for (const c of consultas) if (c.isError) c.refetch()
          }}
          reintentando={consultas.some((c) => c.isFetching)}
        />
      </section>
    )
  }

  const a = animal.data
  const entradas: Entrada[] = [
    ...altaYBaja(a, enlace),
    ...conGanancia(pesadas.data ?? []).map(
      (p): Entrada => ({
        clave: p.id,
        categoria: 'pesos',
        fecha: p.fecha,
        orden: p.creadoEn,
        titulo: `Pesada: ${kilos(p.kg, p.kg % 1 ? 1 : 0)}`,
        detalle: [
          p.momento !== 'otro' && MOMENTOS[p.momento],
          p.ganancia !== null && ganancia(p.ganancia),
        ],
        lineas: [],
        anulacion: null,
      }),
    ),
    ...(tratamientos.data ?? []).map(
      (t): Entrada => ({
        clave: t.id,
        categoria: 'tratamientos',
        fecha: t.fecha,
        orden: t.creadoEn,
        titulo: `Tratamiento: ${t.producto}`,
        detalle: [
          MOTIVOS_TRATAMIENTO[t.motivo],
          t.diagnostico,
          t.aplicadoPor && `por ${t.aplicadoPor.nombre}`,
        ],
        lineas: t.diasSupresion > 0 ? [`Supresión hasta el ${fecha(t.finSupresion)}`] : [],
        anulacion: t.anulacion,
      }),
    ),
    ...[
      ...(eventos.data ?? []).map((e) => deEvento(e, a.id, enlace)),
      ...(partos.data ?? []).map((p) => deParto(p, enlace)),
    ].map(
      (e): Entrada => ({
        clave: e.clave,
        categoria: 'reproduccion',
        fecha: e.fecha,
        orden: e.creadoEn,
        titulo: e.titulo,
        detalle: e.detalle,
        lineas: e.observaciones ? [...e.lineas, e.observaciones] : e.lineas,
        anulacion: e.anulacion,
      }),
    ),
  ].sort((x, y) => y.fecha.localeCompare(x.fecha) || y.orden.localeCompare(x.orden))

  const cuantas = (c: Categoria) => entradas.filter((e) => e.categoria === c).length
  const categorias = (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => cuantas(c) > 0)
  const visibles = filtro === 'todo' ? entradas : entradas.filter((e) => e.categoria === filtro)
  const anios = [...new Set(visibles.map((e) => e.fecha.slice(0, 4)))]

  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <h1>Historial</h1>
        <div className={estilos.acciones}>
          <MenuRegistrar animal={a} />
        </div>
      </div>
      <Chips
        etiqueta="Tipo"
        opciones={[
          { valor: 'todo' as Filtro, texto: `Todo (${entradas.length})` },
          ...categorias.map((c) => ({
            valor: c as Filtro,
            texto: `${CATEGORIAS[c]} (${cuantas(c)})`,
          })),
        ]}
        seleccion={filtro}
        alCambiar={setFiltro}
        envolver
      />
      {anios.map((anio) => (
        <section key={anio} aria-labelledby={`anio-${anio}`} className={estilos.anio}>
          <h2 id={`anio-${anio}`} className={estilos.tituloAnio}>
            {anio}
          </h2>
          <ol className={estilos.lineaTiempo}>
            {visibles
              .filter((e) => e.fecha.startsWith(anio))
              .map((e) => (
                <li
                  key={`${e.categoria}-${e.clave}`}
                  className={e.anulacion ? estilos.anulado : undefined}
                >
                  <span className={estilos.diaTiempo}>{fecha(e.fecha).slice(0, 5)}</span>
                  <div>
                    <span className={estilos.categoriaTiempo}>{CATEGORIAS[e.categoria]}</span>
                    <span className={estilos.producto}>{e.titulo}</span>
                    {e.detalle.some(Boolean) && (
                      <span className={estilos.suave}>{unir(e.detalle)}</span>
                    )}
                    {e.lineas.map((l, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: líneas fijas de cada entrada
                      <span key={i} className={estilos.suave}>
                        {l}
                      </span>
                    ))}
                    {e.anulacion && (
                      <span className={estilos.motivoAnulacion}>
                        <Insignia icono={<Ban aria-hidden />}>Anulado</Insignia>
                        {e.anulacion.motivo}
                      </span>
                    )}
                  </div>
                </li>
              ))}
          </ol>
        </section>
      ))}
    </section>
  )
}

// Nacimiento, entrada en la explotación (si se compró) y baja
function altaYBaja(
  a: AnimalDetalle,
  enlace: (x: { id: string; crotal: string | null; nombre: string | null }) => ReactNode,
): Entrada[] {
  const comun = { categoria: 'altaBaja' as const, lineas: [], anulacion: null }
  const entradas: Entrada[] = [
    {
      ...comun,
      clave: 'nacimiento',
      fecha: a.fechaNacimiento,
      orden: '0',
      titulo: 'Nacimiento',
      detalle: [
        a.madre ? (
          <span key="madre">de {enlace(a.madre)}</span>
        ) : (
          a.madreTexto && `de ${a.madreTexto}`
        ),
        a.origen === 'comprado' && 'fuera de la explotación',
      ],
    },
  ]
  if (a.origen === 'comprado' && a.fechaEntrada)
    entradas.push({
      ...comun,
      clave: 'entrada',
      fecha: a.fechaEntrada,
      orden: '1',
      titulo: 'Entrada en la explotación',
      detalle: [a.regaOrigen && `desde ${a.regaOrigen}`],
    })
  if (a.fechaBaja && a.tipoBaja)
    entradas.push({
      ...comun,
      clave: 'baja',
      fecha: a.fechaBaja,
      // La baja, lo último de su día
      orden: '￿',
      titulo: `Baja: ${TIPOS_BAJA[a.tipoBaja].toLowerCase()}`,
      detalle: [a.causaBaja],
    })
  return entradas
}
