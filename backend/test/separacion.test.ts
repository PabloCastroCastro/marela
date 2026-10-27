import { randomUUID } from 'node:crypto'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { eq, sql } from 'drizzle-orm'
import { index, pgTable, text } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, pool } from '../src/db/cliente.js'
import { enExplotacion } from '../src/db/explotacion.js'
import { id } from '../src/db/schema/comun.js'
import { auditoria, deExplotacion, separacionPorExplotacion } from '../src/db/schema/explotacion.js'
import * as schema from '../src/db/schema/index.js'

// Separación de datos por explotación con Row-Level Security. Aún no hay tablas de datos, así que
// se crea una de prueba con las mismas piezas que usarán las reales; su SQL lo genera drizzle-kit
// igual que en una migración.
const notas = pgTable(
  'prueba_notas',
  { id: id(), ...deExplotacion(), texto: text('texto').notNull(), ...auditoria() },
  (t) => [index('prueba_notas_explotacion_idx').on(t.explotacionId), separacionPorExplotacion()],
)

const { organization, user } = schema

async function crearExplotacion(nombre: string) {
  const rega = `ES${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`
  const [e] = await db
    .insert(organization)
    .values({ name: nombre, slug: `${rega.toLowerCase()}-${randomUUID()}`, rega })
    .returning()
  if (!e) throw new Error('No se pudo crear la explotación')
  return e.id
}

async function crearUsuario(nombre: string) {
  const [u] = await db
    .insert(user)
    .values({ name: nombre, email: `${randomUUID()}@prueba.test` })
    .returning()
  if (!u) throw new Error('No se pudo crear el usuario')
  return u.id
}

let a: string
let b: string
let ana: string
let xose: string

beforeAll(async () => {
  const sentencias = await generateMigration(
    generateDrizzleJson(schema),
    generateDrizzleJson({ ...schema, notas }),
  )
  await db.execute(sql`drop table if exists prueba_notas`)
  for (const s of sentencias) await db.execute(sql.raw(s))

  a = await crearExplotacion('Explotación A')
  b = await crearExplotacion('Explotación B')
  ana = await crearUsuario('Ana')
  xose = await crearUsuario('Xosé')
})

afterAll(async () => {
  await db.execute(sql`drop table if exists prueba_notas`)
  await pool.end()
})

describe('separación por explotación', () => {
  it('cada explotación solo ve sus datos', async () => {
    await enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.insert(notas).values({ texto: 'nota de A' }),
    )
    await enExplotacion({ explotacionId: b, usuarioId: xose }, (tx) =>
      tx.insert(notas).values({ texto: 'nota de B' }),
    )

    const deA = await enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.select().from(notas),
    )
    const deB = await enExplotacion({ explotacionId: b, usuarioId: xose }, (tx) =>
      tx.select().from(notas),
    )
    expect(deA.map((n) => n.texto)).toEqual(['nota de A'])
    expect(deA[0]?.explotacionId).toBe(a)
    expect(deB.map((n) => n.texto)).toEqual(['nota de B'])
  })

  it('no deja escribir en otra explotación', async () => {
    const intento = enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.insert(notas).values({ explotacionId: b, texto: 'intrusa' }),
    )
    await expect(intento).rejects.toMatchObject({ cause: { code: '42501' } })
  })

  it('no deja modificar ni borrar datos de otra explotación', async () => {
    const [deB] = await enExplotacion({ explotacionId: b, usuarioId: xose }, (tx) =>
      tx.select().from(notas),
    )
    if (!deB) throw new Error('Falta la nota de B')

    const cambiadas = await enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.update(notas).set({ texto: 'cambiada' }).where(eq(notas.id, deB.id)).returning(),
    )
    const borradas = await enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.delete(notas).where(eq(notas.id, deB.id)).returning(),
    )
    expect(cambiadas).toEqual([])
    expect(borradas).toEqual([])

    // Tampoco moviendo una fila propia a otra explotación
    const mover = enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.update(notas).set({ explotacionId: b }),
    )
    await expect(mover).rejects.toMatchObject({ cause: { code: '42501' } })
  })

  it('sin explotación fijada no se ve nada', async () => {
    const filas = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role marela_app`)
      return tx.select().from(notas)
    })
    expect(filas).toEqual([])
  })
})

describe('auditoría', () => {
  it('guarda quién creó y modificó cada fila, y cuándo', async () => {
    const [creada] = await enExplotacion({ explotacionId: a, usuarioId: ana }, (tx) =>
      tx.insert(notas).values({ texto: 'auditada' }).returning(),
    )
    if (!creada) throw new Error('No se creó la nota')
    expect(creada.creadoPor).toBe(ana)
    expect(creada.modificadoPor).toBe(ana)

    // Xosé también trabaja en A
    const [modificada] = await enExplotacion({ explotacionId: a, usuarioId: xose }, (tx) =>
      tx.update(notas).set({ texto: 'corregida' }).where(eq(notas.id, creada.id)).returning(),
    )
    expect(modificada?.creadoPor).toBe(ana)
    expect(modificada?.creadoEn).toEqual(creada.creadoEn)
    expect(modificada?.modificadoPor).toBe(xose)
    expect(modificada?.modificadoEn.getTime()).toBeGreaterThanOrEqual(creada.modificadoEn.getTime())
  })
})

describe('esquema', () => {
  it('genera identificadores UUID v7', async () => {
    const id = await crearUsuario('Uuid')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('solo admite los roles administrador y empleado', async () => {
    const intento = db
      .insert(schema.member)
      .values({ organizationId: a, userId: ana, role: 'owner' })
    await expect(intento).rejects.toMatchObject({ cause: { code: '23514' } })
  })

  it('exige un código REGA válido', async () => {
    const intento = db.insert(organization).values({ name: 'Mal', slug: randomUUID(), rega: '123' })
    await expect(intento).rejects.toMatchObject({ cause: { code: '23514' } })
  })
})
