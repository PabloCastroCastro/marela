import { serve } from '@hono/node-server'
import { crearApp } from './app.js'
import { config } from './config.js'
import { pool } from './db/cliente.js'
import { logger } from './logger.js'

const server = serve(
  { fetch: crearApp().fetch, port: config.puerto, hostname: '0.0.0.0' },
  (info) => {
    logger.info({ puerto: info.port }, `Backend escuchando en el puerto ${info.port}`)
  },
)

// Cierre ordenado al parar el contenedor
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Parando el backend')
    server.close(() => {
      pool.end().finally(() => process.exit(0))
    })
  })
}
