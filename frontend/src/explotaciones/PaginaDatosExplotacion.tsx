import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { api, datos, erroresPorCampo } from '../api/cliente'
import { useAvisos } from '../componentes/Avisos'
import { Boton } from '../componentes/Boton'
import { CamposExplotacion, type DatosExplotacion, type Provincia } from './CamposExplotacion'
import { CLAVE_EXPLOTACIONES } from './datos'
import { useExplotacionActual } from './ExplotacionActual'
import estilos from './Explotaciones.module.css'

// Datos de la explotación, que edita su administrador (GH-11)
export function PaginaDatosExplotacion() {
  const explotacion = useExplotacionActual()
  const cliente = useQueryClient()
  const { avisar } = useAvisos()
  const [formulario, setFormulario] = useState<DatosExplotacion>({
    nombre: explotacion.nombre,
    rega: explotacion.rega,
    municipio: explotacion.municipio ?? '',
    provincia: explotacion.provincia ?? '',
  })

  const guardar = useMutation({
    mutationFn: () =>
      datos(
        api.PATCH('/api/explotaciones/{explotacionId}', {
          params: { path: { explotacionId: explotacion.id } },
          body: { ...formulario, provincia: formulario.provincia as Provincia },
        }),
      ),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: CLAVE_EXPLOTACIONES })
      avisar({ tipo: 'exito', mensaje: 'Datos de la explotación guardados' })
    },
  })

  const errores = erroresPorCampo(guardar.error)
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? guardar.error.message : null

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    guardar.mutate()
  }

  return (
    <section className={estilos.datosExplotacion}>
      <h1>Datos de la explotación</h1>
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        {errorGeneral && (
          <p className={estilos.error} role="alert">
            {errorGeneral}
          </p>
        )}
        <CamposExplotacion datos={formulario} alCambiar={setFormulario} errores={errores} />
        <div className={estilos.acciones}>
          <Boton type="submit" icono={<Save aria-hidden size={20} />} cargando={guardar.isPending}>
            Guardar los datos
          </Boton>
        </div>
      </form>
    </section>
  )
}
