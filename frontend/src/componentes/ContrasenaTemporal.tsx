import { Copy, TriangleAlert } from 'lucide-react'
import { useAvisos } from './Avisos'
import { Boton } from './Boton'
import estilos from './ContrasenaTemporal.module.css'

// Contraseña temporal recién generada (alta de un usuario o restablecimiento): se muestra una sola
// vez, con un botón para copiarla. La persona la cambiará la primera vez que entre.
export function ContrasenaTemporal({ contrasena }: { contrasena: string }) {
  const { avisar } = useAvisos()
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(contrasena)
      avisar({ tipo: 'exito', mensaje: 'Contraseña copiada' })
    } catch {
      avisar({ tipo: 'error', mensaje: 'No se ha podido copiar; apúntala a mano' })
    }
  }

  return (
    <div className={estilos.contrasenaTemporal}>
      <p>Dale esta contraseña temporal. La cambiará la primera vez que entre.</p>
      <div className={estilos.caja}>
        <code>{contrasena}</code>
        <Boton
          variante="secundario"
          tamano="compacto"
          icono={<Copy aria-hidden size={18} />}
          onClick={copiar}
        >
          Copiar
        </Boton>
      </div>
      <p className={estilos.aviso} role="note">
        <TriangleAlert aria-hidden size={18} />
        Apúntala ahora: no se volverá a mostrar.
      </p>
    </div>
  )
}
