import { FORMATO_NIF } from './db/schema/index.js'

// NIF español (GH-35): DNI, NIE, los de K, L y M (españoles sin DNI y extranjeros) y el de las
// entidades (antiguo CIF), con su letra o dígito de control. La base de datos comprueba el formato;
// aquí, además, el control.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'
const LETRAS_CIF = 'JABCDEFGHI'
const FORMATO = new RegExp(FORMATO_NIF)

// En mayúsculas y sin espacios, guiones ni puntos, como se guarda
export const normalizarNif = (nif: string) => nif.toUpperCase().replace(/[\s.-]/g, '')

const letraDni = (numero: string) => LETRAS_DNI[Number(numero) % 23]

function controlCif(digitos: string) {
  let suma = 0
  for (let i = 0; i < 7; i++) {
    const n = Number(digitos[i])
    // Las posiciones impares (1.ª, 3.ª…) se doblan y se suman sus cifras
    suma += i % 2 === 0 ? Math.floor((n * 2) / 10) + ((n * 2) % 10) : n
  }
  return (10 - (suma % 10)) % 10
}

// Si el NIF (ya normalizado) es válido
export function nifValido(nif: string) {
  if (!FORMATO.test(nif)) return false
  const primera = nif.charAt(0)
  const control = nif.charAt(8)
  // DNI
  if (/[0-9]/.test(primera)) return letraDni(nif.slice(0, 8)) === control
  // NIE: la X, la Y y la Z valen 0, 1 y 2
  if ('XYZ'.includes(primera))
    return letraDni(`${'XYZ'.indexOf(primera)}${nif.slice(1, 8)}`) === control
  // K, L y M: como el DNI, con sus siete cifras
  if ('KLM'.includes(primera)) return letraDni(nif.slice(1, 8)) === control
  // Entidades: el control es una letra (P, Q, R, S, N, W), un dígito (A, B, E, H) o cualquiera de los dos
  const digito = controlCif(nif.slice(1, 8))
  const letra = LETRAS_CIF.charAt(digito)
  if ('PQRSNW'.includes(primera)) return control === letra
  if ('ABEH'.includes(primera)) return control === String(digito)
  return control === letra || control === String(digito)
}
