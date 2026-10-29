import { describe, expect, it } from 'vitest'
import { ErrorConfiguracion, leerConfig } from '../src/config.js'

const valida = {
  ENTORNO: 'produccion',
  DATABASE_URL: 'postgres://marela:clave@db:5432/marela',
  TZ: 'Europe/Madrid',
  BETTER_AUTH_SECRET: 'una-clave-de-prueba-con-mas-de-32-caracteres',
  URL_PUBLICA: 'https://servidor.ejemplo.ts.net:8444/',
}

const problemas = (env: Record<string, string | undefined>) => {
  try {
    leerConfig(env)
  } catch (error) {
    if (error instanceof ErrorConfiguracion) return error.problemas
    throw error
  }
  return []
}

describe('configuración', () => {
  it('aplica los valores por defecto', () => {
    expect(leerConfig(valida)).toEqual({
      entorno: 'produccion',
      puerto: 3000,
      baseDeDatos: { url: valida.DATABASE_URL, poolMax: 10, timeoutConexionMs: 5000 },
      zonaHoraria: 'Europe/Madrid',
      secretoAuth: valida.BETTER_AUTH_SECRET,
      urlPublica: 'https://servidor.ejemplo.ts.net:8444',
      nivelLog: 'info',
      directorioArchivos: 'uploads',
    })
  })

  it('indica las variables que faltan', () => {
    expect(problemas({})).toEqual(
      expect.arrayContaining([
        'ENTORNO: falta la variable',
        'DATABASE_URL: falta la variable',
        'TZ: falta la variable',
        'BETTER_AUTH_SECRET: falta la variable',
        'URL_PUBLICA: falta la variable',
      ]),
    )
  })

  it('rechaza valores no válidos', () => {
    expect(
      problemas({
        ...valida,
        DATABASE_URL: 'mysql://x',
        TZ: 'UTC',
        PORT: '0',
        BETTER_AUTH_SECRET: 'corta',
        URL_PUBLICA: 'ftp://servidor',
      }),
    ).toHaveLength(5)
  })
})
