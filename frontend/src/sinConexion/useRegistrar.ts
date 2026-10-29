import { useSesion } from '../auth/sesion'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import { enviarOGuardar, type Pendiente } from './cola'

export const AVISO_GUARDADO = 'Sin conexión: se ha guardado en el móvil y se enviará al recuperarla'

type Registro = Omit<
  Pendiente,
  'estado' | 'creadoEn' | 'usuarioId' | 'explotacionId' | 'metodo'
> & { metodo?: Pendiente['metodo'] }

// enviarOGuardar con el usuario y la explotación de ahora (GH-32): envía el registro y, si no llega
// al servidor, lo deja en la cola de pendientes
export function useRegistrar() {
  const explotacion = useExplotacionActual()
  const sesion = useSesion()
  return <T>(registro: Registro, enviar: () => Promise<T>) =>
    enviarOGuardar(
      {
        metodo: 'POST',
        usuarioId: sesion.data?.usuario.id ?? '',
        explotacionId: explotacion.id,
        ...registro,
      },
      enviar,
    )
}
