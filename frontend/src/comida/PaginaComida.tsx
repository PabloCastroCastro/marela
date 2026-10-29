import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Wheat } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, datos } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { BotonFlotante } from '../componentes/BotonFlotante'
import { clases } from '../componentes/clases'
import { Esqueleto, EstadoError, EstadoVacio } from '../componentes/Estados'
import { Tarjeta } from '../componentes/Etiquetas'
import { rutaExplotacion } from '../explotaciones/datos'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Comida.module.css'
import { type Almacen, CLAVE_COMIDA, cantidad, TIPOS_ALMACEN, useAlmacenes } from './datos'
import { FormularioAlmacen } from './FormularioAlmacen'
import { MenuRegistrarComida } from './MenuRegistrarComida'
import { InsigniaNegativo } from './PaginaAlmacen'
import { SacarRacion } from './SacarRacion'

// Comida: el stock de cada almacén, en una tarjeta (GH-29), en rojo si es negativo, con la ración del
// día en dos toques (contador y "Sacar") y "Registrar" para lo demás (GH-30). Cada tarjeta lleva a
// la ficha del almacén. El
// administrador crea y reactiva los almacenes; los edita y desactiva desde su ficha.
export function PaginaComida() {
  const explotacion = useExplotacionActual()
  const administrador = explotacion.modulos.includes('administracion')
  const almacenes = useAlmacenes(explotacion.id)
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [anadiendo, setAnadiendo] = useState(false)

  const reactivar = useMutation({
    mutationFn: (a: Almacen) =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}/almacenes/{almacenId}/estado', {
          params: { path: { explotacionId: explotacion.id, almacenId: a.id } },
          body: { activo: true },
        }),
      ),
    onSuccess: async (a) => {
      await cliente.invalidateQueries({ queryKey: [...CLAVE_COMIDA, explotacion.id] })
      avisar({ tipo: 'exito', mensaje: `${a.nombre} vuelve a estar activo` })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const activos = almacenes.data?.filter((a) => a.activo) ?? []
  const desactivados = almacenes.data?.filter((a) => !a.activo) ?? []
  const anadir = administrador ? () => setAnadiendo(true) : undefined

  return (
    <section className={estilos.pagina}>
      <div className={estilos.titulo}>
        <h1>Comida</h1>
        {anadir && (
          <div className={estilos.soloAncho}>
            <Boton icono={<Plus aria-hidden size={20} />} onClick={anadir}>
              Añadir almacén
            </Boton>
          </div>
        )}
      </div>

      {almacenes.isPending ? (
        <Esqueleto bloques={[{ alto: '7rem' }, { alto: '7rem' }, { alto: '7rem' }]} />
      ) : almacenes.isError ? (
        <EstadoError alReintentar={() => almacenes.refetch()} reintentando={almacenes.isFetching} />
      ) : activos.length === 0 ? (
        <EstadoVacio
          icono={<Wheat size={32} />}
          titulo="No hay almacenes activos"
          descripcion={
            administrador
              ? 'Crea uno para cada comida que guardéis: pacas, silos, pienso…'
              : 'El administrador de la explotación los configura.'
          }
          accion={
            anadir && (
              <Boton icono={<Plus aria-hidden size={20} />} onClick={anadir}>
                Añadir almacén
              </Boton>
            )
          }
        />
      ) : (
        <ul className={estilos.almacenes} aria-label="Almacenes">
          {activos.map((a) => (
            <li key={a.id}>
              <Tarjeta
                aria-label={a.nombre}
                className={clases(estilos.almacen, a.stock < 0 && estilos.almacenNegativo)}
              >
                <h2 className={estilos.nombreAlmacen}>
                  {/* Toda la tarjeta lleva a la ficha, salvo el botón de registrar */}
                  <Link to={`${rutaExplotacion(explotacion.id)}/comida/${a.id}`}>{a.nombre}</Link>
                </h2>
                <p className={clases(estilos.stock, a.stock < 0 && estilos.negativo)}>
                  {cantidad(a.stock, a.unidad)}
                </p>
                <span className={estilos.insignias}>
                  <span className={estilos.suave}>{TIPOS_ALMACEN[a.tipo]}</span>
                  {a.stock < 0 && <InsigniaNegativo />}
                </span>
                <div className={estilos.pieAlmacen}>
                  <SacarRacion almacen={a} />
                  <MenuRegistrarComida almacen={a} tamano="compacto" />
                </div>
              </Tarjeta>
            </li>
          ))}
        </ul>
      )}

      {administrador && desactivados.length > 0 && (
        <Tarjeta aria-labelledby="almacenes-desactivados">
          <h2 id="almacenes-desactivados" className={estilos.tituloTarjeta}>
            Desactivados
          </h2>
          <ul className={estilos.desactivados}>
            {desactivados.map((a) => (
              <li key={a.id}>
                <div>
                  <Link to={`${rutaExplotacion(explotacion.id)}/comida/${a.id}`}>{a.nombre}</Link>
                  <span className={estilos.suave}>{TIPOS_ALMACEN[a.tipo]}</span>
                </div>
                <Boton
                  variante="secundario"
                  tamano="compacto"
                  icono={<RotateCcw aria-hidden size={18} />}
                  cargando={reactivar.isPending && reactivar.variables?.id === a.id}
                  onClick={() => reactivar.mutate(a)}
                  aria-label={`Reactivar ${a.nombre}`}
                >
                  Reactivar
                </Boton>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {anadir && (
        <BotonFlotante
          etiqueta="Añadir almacén"
          icono={<Plus aria-hidden size={26} />}
          alPulsar={anadir}
        />
      )}
      {anadiendo && <FormularioAlmacen alCerrar={() => setAnadiendo(false)} />}
    </section>
  )
}
