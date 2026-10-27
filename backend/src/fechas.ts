// Fechas de la aplicación, siempre en la zona horaria de España (TZ=Europe/Madrid)

// Fecha de hoy en formato aaaa-mm-dd
export const hoyEnMadrid = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
