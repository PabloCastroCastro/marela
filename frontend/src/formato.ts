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

// Coma decimal y punto de miles (también en los números de 4 cifras: 1.234)
export const numero = (n: number, decimales = 0) =>
  new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: 'always',
  }).format(n)

export const kilos = (n: number, decimales = 0) => `${numero(n, decimales)} kg`

export const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
  }).format(n)
