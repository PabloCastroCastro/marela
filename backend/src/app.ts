import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { auth, RUTAS_AUTH } from './auth.js'
import { config } from './config.js'
import { comprobarBaseDeDatos } from './db/cliente.js'
import { manejarError, rutaNoEncontrada, soloMismoOrigen, validacionFallida } from './errores.js'
import { registrarPeticiones } from './peticiones.js'
import { rutasExplotaciones } from './rutas/explotaciones.js'
import { rutasMiembros } from './rutas/miembros.js'
import { rutasPlataforma } from './rutas/plataforma.js'
import { rutasSalud } from './rutas/salud.js'

export const infoOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'API de Marela',
    version: '0.1.0',
    description:
      'API REST de Marela. Todas las rutas cuelgan de /api. Errores con el formato { error: { codigo, mensaje, detalles? } }.',
  },
}

type Dependencias = {
  comprobarBaseDeDatos: () => Promise<boolean>
  // Documentación interactiva y contrato en /api/docs y /api/openapi.json
  documentacion: boolean
}

// Las dependencias se pueden sustituir en los tests
export function crearApp(dependencias: Partial<Dependencias> = {}) {
  const d: Dependencias = {
    comprobarBaseDeDatos,
    documentacion: config.entorno !== 'produccion',
    ...dependencias,
  }

  const app = new OpenAPIHono({ defaultHook: validacionFallida }).basePath('/api')

  app.use(registrarPeticiones())
  app.onError(manejarError)
  app.notFound(rutaNoEncontrada)

  app.route('/', rutasSalud(d.comprobarBaseDeDatos))

  // Autenticación (Better Auth): solo las rutas de RUTAS_AUTH; el resto, 404
  app.post('/auth/*', soloMismoOrigen(config.urlPublica))
  app.on(['GET', 'POST'], '/auth/*', (c) => {
    if (!RUTAS_AUTH.includes(c.req.path.slice('/api/auth'.length))) return rutaNoEncontrada(c)
    return auth.handler(c.req.raw)
  })

  // Las rutas que modifican datos solo se aceptan desde la propia aplicación (protección CSRF)
  for (const ruta of ['/explotaciones/*', '/plataforma/*']) {
    app.on(['POST', 'PUT', 'PATCH', 'DELETE'], ruta, soloMismoOrigen(config.urlPublica))
  }
  app.route('/', rutasExplotaciones())
  app.route('/', rutasMiembros())
  app.route('/', rutasPlataforma())

  // Sesión en la cookie de Better Auth (con el prefijo __Secure- salvo en desarrollo)
  app.openAPIRegistry.registerComponent('securitySchemes', 'sesion', {
    type: 'apiKey',
    in: 'cookie',
    name: '__Secure-marela.session_token',
  })

  if (d.documentacion) {
    app.doc31('/openapi.json', infoOpenApi)
    app.get('/docs', Scalar({ url: '/api/openapi.json', pageTitle: 'API de Marela' }))
  }

  return app
}

export type App = ReturnType<typeof crearApp>
