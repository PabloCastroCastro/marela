import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { api, datos } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton, BotonIcono } from '../componentes/Boton'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { hoy } from '../formato'
import estilos from './Comida.module.css'
import { type Almacen, CLAVE_COMIDA, cantidad as formatoCantidad, leerCantidad } from './datos'

// La ración del día en dos toques, desde la tarjeta del almacén (GH-30): con − y + se elige cuánto
// (empieza en 1, y se puede escribir) y "Sacar" registra la salida de hoy, con "Deshacer". El resto
// (otra fecha, entradas, ajustes), con "Registrar".
export function SacarRacion({ almacen }: { almacen: Almacen }) {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [texto, setTexto] = useState('1')
  const n = leerCantidad(texto)
  const valida = texto.trim() !== '' && Number.isFinite(n) && n > 0
  const ruta = { explotacionId: explotacion.id, almacenId: almacen.id }
  const refrescar = () => cliente.invalidateQueries({ queryKey: [...CLAVE_COMIDA, explotacion.id] })

  // Más o menos 1, sin bajar de 1; con decimales, al entero siguiente
  const sumar = (paso: 1 | -1) => {
    const actual = valida ? n : 1
    const siguiente = paso > 0 ? Math.floor(actual) + 1 : Math.ceil(actual) - 1
    setTexto(String(Math.max(1, siguiente)))
  }

  const deshacer = useMutation({
    mutationFn: (movimientoId: string) =>
      datos(
        api.DELETE(
          '/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos/{movimientoId}',
          { params: { path: { ...ruta, movimientoId } } },
        ),
      ),
    onSuccess: refrescar,
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  const sacar = useMutation({
    mutationFn: () =>
      datos(
        api.POST('/api/explotaciones/{explotacionId}/almacenes/{almacenId}/movimientos', {
          params: { path: ruta },
          body: { tipo: 'salida', fecha: hoy(), cantidad: n },
        }),
      ),
    onSuccess: async (m) => {
      await refrescar()
      setTexto('1')
      // Es de hoy, la más reciente: el stock que deja es el del almacén
      const mensaje = `Salida de ${formatoCantidad(m.cantidad, almacen.unidad)} de ${almacen.nombre}`
      avisar({
        tipo: m.stock < 0 ? 'aviso' : 'exito',
        mensaje:
          m.stock < 0
            ? `${mensaje}. El stock queda en ${formatoCantidad(m.stock, almacen.unidad)}`
            : mensaje,
        accion: { texto: 'Deshacer', alPulsar: () => deshacer.mutate(m.id) },
      })
    },
    onError: (error) => avisar({ tipo: 'error', mensaje: error.message }),
  })

  return (
    <div className={estilos.racion}>
      <div className={estilos.contador}>
        <BotonIcono
          etiqueta="Una menos"
          icono={<Minus aria-hidden size={20} />}
          disabled={valida && n <= 1}
          onClick={() => sumar(-1)}
        />
        <input
          className={estilos.cifraRacion}
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Cantidad que sacar de ${almacen.nombre} (${almacen.unidad === 'kg' ? 'kg' : 'unidades'})`}
          aria-invalid={valida ? undefined : true}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        <BotonIcono
          etiqueta="Una más"
          icono={<Plus aria-hidden size={20} />}
          onClick={() => sumar(1)}
        />
      </div>
      <Boton
        variante="secundario"
        disabled={!valida}
        cargando={sacar.isPending}
        aria-label={`Sacar de ${almacen.nombre}`}
        onClick={() => sacar.mutate()}
      >
        Sacar
      </Boton>
    </div>
  )
}
