import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Boton } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Animales.module.css'
import type { AnimalDetalle } from './datos'
import { FormularioBaja } from './FormularioBaja'
import { FormularioEvento } from './FormularioEvento'
import { FormularioPesada } from './FormularioPesada'
import { FormularioReposicion } from './FormularioReposicion'
import { FormularioTratamiento } from './FormularioTratamiento'
import { type TipoRegistro, tiposPara, useEventos } from './reproduccion'

type Opcion = 'pesada' | 'tratamiento' | 'baja' | 'reposicion' | TipoRegistro

// Textos del menú. La inseminación va con la cubrición: el formulario deja elegir entre las dos.
const TEXTOS: Partial<Record<Opcion, string>> = {
  pesada: 'Pesada',
  tratamiento: 'Tratamiento',
  parto: 'Parto',
  cubricion: 'Cubrición o inseminación',
  diagnostico: 'Diagnóstico de gestación',
  aborto: 'Aborto',
  destete: 'Destete',
}

// Acceso rápido desde la ficha a registrar cualquier cosa del animal (GH-24): "Registrar" abre la
// lista de opciones y cada una, su formulario
export function MenuRegistrar({ animal }: { animal: AnimalDetalle }) {
  const explotacion = useExplotacionActual()
  const eventos = useEventos(explotacion.id, animal.id)
  const [abierto, setAbierto] = useState(false)
  const [opcion, setOpcion] = useState<Opcion>()

  // El destete, solo si aún no lo tiene
  const destetado = eventos.data?.some(
    (e) => e.tipo === 'destete' && e.animalId === animal.id && !e.anulacion,
  )
  const tipos = tiposPara(animal).filter((t) => t !== 'destete' || !destetado)
  const opciones: Opcion[] = ['pesada', 'tratamiento', ...tipos.filter((t) => t !== 'inseminacion')]

  const elegir = (o: Opcion) => {
    setAbierto(false)
    setOpcion(o)
  }
  const cerrar = () => setOpcion(undefined)

  return (
    <>
      <Boton
        icono={<ChevronDown aria-hidden size={18} />}
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
      >
        Registrar
      </Boton>
      <HojaInferior abierta={abierto} alCerrar={() => setAbierto(false)} titulo="Registrar">
        <div className={estilos.opcionesRegistrar}>
          {opciones.map((o) => (
            <Boton key={o} variante="secundario" anchoCompleto onClick={() => elegir(o)}>
              {TEXTOS[o]}
            </Boton>
          ))}
          {/* Reposición (GH-110): una vaca con una enfermedad que pasa a su descendencia */}
          {animal.sexo === 'hembra' && (
            <Boton variante="secundario" anchoCompleto onClick={() => elegir('reposicion')}>
              {animal.noAptaReposicion
                ? 'Quitar la marca de reposición'
                : 'No apta para reposición'}
            </Boton>
          )}
          {animal.estado === 'activo' && (
            <Boton
              variante="secundario"
              anchoCompleto
              className={estilos.peligro}
              onClick={() => elegir('baja')}
            >
              Dar de baja
            </Boton>
          )}
        </div>
      </HojaInferior>

      {opcion === 'pesada' && <FormularioPesada animal={animal} alCerrar={cerrar} />}
      {opcion === 'tratamiento' && <FormularioTratamiento animales={[animal]} alCerrar={cerrar} />}
      {opcion === 'baja' && <FormularioBaja animal={animal} alCerrar={cerrar} />}
      {opcion === 'reposicion' && <FormularioReposicion animal={animal} alCerrar={cerrar} />}
      {opcion &&
        opcion !== 'pesada' &&
        opcion !== 'tratamiento' &&
        opcion !== 'baja' &&
        opcion !== 'reposicion' && (
          <FormularioEvento
            animales={[animal]}
            tipos={tipos}
            tipoInicial={opcion}
            alCerrar={cerrar}
          />
        )}
    </>
  )
}
