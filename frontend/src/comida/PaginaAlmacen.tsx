import { ArrowLeft, Pencil, PowerOff, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorApi } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { clases } from '../componentes/clases'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Comida.module.css'
import { cantidad, TIPOS_ALMACEN, useAlmacen } from './datos'
import { FormularioAlmacen } from './FormularioAlmacen'
import { MenuRegistrarComida } from './MenuRegistrarComida'
import { TarjetaMovimientos } from './TarjetaMovimientos'

// En rojo hasta que una entrada o un ajuste lo corrija (docs/diseno.md, "Stock negativo")
export const InsigniaNegativo = () => (
  <Insignia tipo="peligro" icono={<TriangleAlert aria-hidden size={14} />}>
    Stock negativo
  </Insignia>
)

// Ficha de un almacén: su stock, "Registrar" para las entradas, salidas y ajustes, y el historial de
// movimientos (GH-30). El administrador lo edita.
export function PaginaAlmacen() {
  const explotacion = useExplotacionActual()
  const administrador = explotacion.modulos.includes('administracion')
  const { almacenId = '' } = useParams()
  const almacen = useAlmacen(explotacion.id, almacenId)
  const [editando, setEditando] = useState(false)

  const volver = (
    <Link to={`${rutaExplotacion(explotacion.id)}/comida`} className={estilos.volver}>
      <ArrowLeft aria-hidden size={20} />
      Comida
    </Link>
  )

  if (almacen.isPending) {
    return (
      <section className={estilos.pagina}>
        {volver}
        <Esqueleto
          bloques={[{ alto: '2rem', ancho: '60%' }, { alto: '4rem' }, { alto: '12rem' }]}
        />
      </section>
    )
  }
  if (almacen.isError) {
    const noExiste = almacen.error instanceof ErrorApi && almacen.error.estado === 404
    return (
      <section className={estilos.pagina}>
        {volver}
        {noExiste ? (
          <EstadoVacio
            titulo="Este almacén no está en la explotación"
            descripcion="Puede que se haya escrito mal la dirección."
          />
        ) : (
          <EstadoError alReintentar={() => almacen.refetch()} reintentando={almacen.isFetching} />
        )}
      </section>
    )
  }

  const a = almacen.data
  return (
    <section className={estilos.pagina}>
      {volver}
      <div className={estilos.titulo}>
        <div className={estilos.cabeceraFicha}>
          <h1>{a.nombre}</h1>
          <p className={estilos.suave}>{TIPOS_ALMACEN[a.tipo]}</p>
        </div>
        <div className={estilos.acciones}>
          {a.activo && <MenuRegistrarComida almacen={a} />}
          {administrador && (
            <Boton
              variante="secundario"
              icono={<Pencil aria-hidden size={18} />}
              onClick={() => setEditando(true)}
            >
              Editar
            </Boton>
          )}
        </div>
      </div>

      <div className={estilos.resumenStock}>
        <span className={estilos.suave}>Stock</span>
        <span className={clases(estilos.stock, a.stock < 0 && estilos.negativo)}>
          {cantidad(a.stock, a.unidad)}
        </span>
        <span className={estilos.insignias}>
          {a.stock < 0 && <InsigniaNegativo />}
          {!a.activo && <Insignia icono={<PowerOff aria-hidden size={14} />}>Desactivado</Insignia>}
        </span>
      </div>

      <TarjetaMovimientos almacen={a} />

      {editando && <FormularioAlmacen almacen={a} alCerrar={() => setEditando(false)} />}
    </section>
  )
}
