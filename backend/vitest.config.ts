import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Configuración válida para cargar la app; los tests actuales no se conectan a la base de datos
    env: {
      ENTORNO: 'pruebas',
      TZ: 'Europe/Madrid',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://marela:marela@localhost:5432/marela_test',
      LOG_LEVEL: 'silent',
    },
  },
})
