// Formatos de la interfaz, en español de España (skill diseno-frontend, "Tipografía")

const formatoFecha = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// dd/mm/aaaa. Una fecha sin hora (aaaa-mm-dd) se toma en la zona local, para que no cambie de día.
export function fecha(valor: string | Date) {
  const d =
    typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(`${valor}T00:00:00`)
      : new Date(valor)
  return formatoFecha.format(d)
}

// Fecha de hoy en formato aaaa-mm-dd, en la hora local (la de los campos de fecha)
export function hoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Coma decimal y punto de miles (también en los números de 4 cifras: 1.234)
export const numero = (n: number, decimales = 0) =>
  new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: 'always',
  }).format(n)

export const kilos = (n: number, decimales = 0) => `${numero(n, decimales)} kg`

// Hectáreas con los decimales que tenga, hasta cuatro (la precisión del SIGPAC): "2,3456 ha", "4,5 ha"
export const hectareas = (n: number) =>
  `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4, useGrouping: 'always' }).format(n)} ha`

export const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
  }).format(n)

// Edad a partir de la fecha de nacimiento (aaaa-mm-dd): en días, meses o años, como se dice en la
// explotación ("3 semanas", "8 meses", "6 años")
export function edad(nacimiento: string, hoy = new Date()) {
  const n = new Date(`${nacimiento}T00:00:00`)
  const dias = Math.floor((hoy.getTime() - n.getTime()) / 86_400_000)
  if (dias < 0) return '—'
  if (dias < 31)
    return dias < 14 ? `${dias} ${dias === 1 ? 'día' : 'días'}` : `${Math.floor(dias / 7)} semanas`
  let meses = (hoy.getFullYear() - n.getFullYear()) * 12 + hoy.getMonth() - n.getMonth()
  if (hoy.getDate() < n.getDate()) meses -= 1
  if (meses < 24) return `${Math.max(meses, 1)} ${meses === 1 ? 'mes' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `${anos} años`
}
