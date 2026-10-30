import { Download, FileArchive, FileSpreadsheet, FileText } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Boton } from '../componentes/Boton'
import { HojaInferior } from '../componentes/HojaInferior'
import { useExplotacionActual } from '../explotaciones/ExplotacionActual'
import estilos from './Finanzas.module.css'

export type Listado = 'facturas' | 'ventas' | 'apuntes' | 'periodo'
type Formato = 'xlsx' | 'csv' | 'zip'

const FORMATOS: Record<Formato, { texto: string; ayuda: string; icono: ReactNode }> = {
  xlsx: {
    texto: 'Excel (.xlsx)',
    ayuda: 'Con fechas e importes que se pueden sumar y ordenar',
    icono: <FileSpreadsheet aria-hidden size={20} />,
  },
  csv: {
    texto: 'CSV',
    ayuda: 'Texto separado por punto y coma, para otros programas',
    icono: <FileText aria-hidden size={20} />,
  },
  zip: {
    texto: 'Excel y adjuntos (.zip)',
    ayuda: 'El Excel y los PDF y fotos de cada una, con nombres legibles',
    icono: <FileArchive aria-hidden size={20} />,
  },
}

// La dirección de la descarga, con los filtros que tengan valor
export const urlExportacion = (
  explotacionId: string,
  listado: Listado,
  formato: Formato,
  filtros: Record<string, string | undefined>,
) => {
  const consulta = new URLSearchParams({ formato })
  for (const [clave, valor] of Object.entries(filtros)) if (valor) consulta.set(clave, valor)
  return `/api/explotaciones/${explotacionId}/exportaciones/${listado}?${consulta}`
}

// Exportar para el gestor (GH-40): lo que se ve, con los mismos filtros, en Excel, CSV o un .zip con
// los adjuntos. La descarga la hace el navegador, con la sesión.
export function BotonExportar({
  listado,
  filtros,
  formatos,
  texto = 'Exportar',
  descripcion,
}: {
  listado: Listado
  filtros: Record<string, string | undefined>
  formatos: Formato[]
  texto?: string
  descripcion: string
}) {
  const explotacion = useExplotacionActual()
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <Boton
        variante="secundario"
        tamano="compacto"
        icono={<Download aria-hidden size={18} />}
        onClick={() => setAbierta(true)}
      >
        {texto}
      </Boton>
      <HojaInferior
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        titulo={texto}
        pie={
          <Boton variante="texto" onClick={() => setAbierta(false)}>
            Cerrar
          </Boton>
        }
      >
        <div className={estilos.formulario}>
          <p className={estilos.suave}>{descripcion}</p>
          <ul className={estilos.descargas} aria-label="Formatos">
            {formatos.map((f) => (
              <li key={f}>
                <a
                  href={urlExportacion(explotacion.id, listado, f, filtros)}
                  download
                  className={estilos.descarga}
                  onClick={() => setAbierta(false)}
                >
                  {FORMATOS[f].icono}
                  <span className={estilos.textoDescarga}>
                    <span className={estilos.tituloDescarga}>{FORMATOS[f].texto}</span>
                    <span className={estilos.suave}>{FORMATOS[f].ayuda}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </HojaInferior>
    </>
  )
}
