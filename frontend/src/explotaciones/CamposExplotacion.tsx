import type { components } from '../api/esquema'
import { Campo, Selector } from '../componentes/Campo'

export type Provincia = components['schemas']['Provincia']

// Las mismas provincias que el contrato de la API: si falta o sobra una, no compila
const LISTA = [
  'A Coruña',
  'Álava',
  'Albacete',
  'Alicante',
  'Almería',
  'Asturias',
  'Ávila',
  'Badajoz',
  'Barcelona',
  'Bizkaia',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Cantabria',
  'Castellón',
  'Ceuta',
  'Ciudad Real',
  'Córdoba',
  'Cuenca',
  'Gipuzkoa',
  'Girona',
  'Granada',
  'Guadalajara',
  'Huelva',
  'Huesca',
  'Illes Balears',
  'Jaén',
  'La Rioja',
  'Las Palmas',
  'León',
  'Lleida',
  'Lugo',
  'Madrid',
  'Málaga',
  'Melilla',
  'Murcia',
  'Navarra',
  'Ourense',
  'Palencia',
  'Pontevedra',
  'Salamanca',
  'Santa Cruz de Tenerife',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia',
  'Valladolid',
  'Zamora',
  'Zaragoza',
] as const satisfies readonly Provincia[]

type Faltan = Exclude<Provincia, (typeof LISTA)[number]>
const completa: [Faltan] extends [never] ? true : Faltan = true
export const PROVINCIAS: readonly Provincia[] = completa ? LISTA : []

export type DatosExplotacion = {
  nombre: string
  rega: string
  municipio: string
  provincia: string
}

export const DATOS_VACIOS: DatosExplotacion = { nombre: '', rega: '', municipio: '', provincia: '' }

// Nombre, código REGA, municipio y provincia de una explotación, para crearla o editarla
export function CamposExplotacion({
  datos,
  alCambiar,
  errores,
}: {
  datos: DatosExplotacion
  alCambiar: (datos: DatosExplotacion) => void
  errores: Record<string, string>
}) {
  const cambiar = (campo: keyof DatosExplotacion) => (valor: string) =>
    alCambiar({ ...datos, [campo]: valor })

  return (
    <>
      <Campo
        etiqueta="Nombre"
        value={datos.nombre}
        onChange={(e) => cambiar('nombre')(e.target.value)}
        error={errores.nombre}
        required
      />
      <Campo
        etiqueta="Código REGA"
        ayuda="Las letras ES y 12 dígitos"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={14}
        value={datos.rega}
        onChange={(e) => cambiar('rega')(e.target.value.toUpperCase())}
        error={errores.rega}
        required
      />
      <Campo
        etiqueta="Municipio"
        value={datos.municipio}
        onChange={(e) => cambiar('municipio')(e.target.value)}
        error={errores.municipio}
        required
      />
      <Selector
        etiqueta="Provincia"
        value={datos.provincia}
        onChange={(e) => cambiar('provincia')(e.target.value)}
        error={errores.provincia}
        required
      >
        <option value="" disabled>
          Elige una provincia
        </option>
        {PROVINCIAS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Selector>
    </>
  )
}
