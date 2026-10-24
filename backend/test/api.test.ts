import { describe, expect, it } from 'vitest'
import { crearApp } from '../src/app.js'

// La base de datos se sustituye en estos tests: no necesitan PostgreSQL
describe('GET /api/health', () => {
  it('responde 200 si la base de datos responde', async () => {
    const res = await crearApp({ comprobarBaseDeDatos: async () => true }).request('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ estado: 'ok', api: 'ok', baseDeDatos: 'ok' })
  })

  it('responde 503 si la base de datos no responde', async () => {
    const res = await crearApp({ comprobarBaseDeDatos: async () => false }).request('/api/health')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ estado: 'error', api: 'ok', baseDeDatos: 'error' })
  })
})

describe('documentación', () => {
  it('publica el contrato y la documentación cuando está activada', async () => {
    const app = crearApp({ documentacion: true })
    const contrato = await app.request('/api/openapi.json')
    expect(contrato.status).toBe(200)
    expect((await contrato.json()).paths).toHaveProperty('/api/health')
    expect((await app.request('/api/docs')).status).toBe(200)
  })

  it('no la publica cuando está desactivada (producción)', async () => {
    const app = crearApp({ documentacion: false })
    expect((await app.request('/api/openapi.json')).status).toBe(404)
    expect((await app.request('/api/docs')).status).toBe(404)
  })
})

describe('rutas inexistentes', () => {
  it('responden 404 con el formato de error común', async () => {
    const res = await crearApp().request('/api/no-existe')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { codigo: 'no_encontrado', mensaje: 'No existe la ruta GET /api/no-existe' },
    })
  })
})
