import { hashPassword } from 'better-auth/crypto'
import { config } from '../config.js'
import { db, pool } from './cliente.js'
import { migrar } from './migrar.js'
import { account, member, organization, type RolExplotacion, user } from './schema/index.js'

// Datos de ejemplo para desarrollo y pruebas (GH-6). Idempotente: usa identificadores fijos y no
// modifica lo que ya existe. Nunca se ejecuta en producción.
//
//   npm run db:seed                                        (desarrollo, fuera de Docker)
//   docker compose -f docker-compose.dev.yml exec backend npm run db:seed
//   docker compose exec backend node dist/db/seed.js       (entorno de pruebas del servidor)

const CONTRASENA = 'marela-dev'

if (config.entorno !== 'desarrollo' && config.entorno !== 'pruebas') {
  console.error(
    `El seed solo se ejecuta con ENTORNO=desarrollo o pruebas (ENTORNO=${config.entorno})`,
  )
  process.exit(1)
}

// Identificador fijo por tipo de dato y número, con formato de UUID v7
const sid = (tipo: number, n: number) =>
  `00000000-0000-7000-8${tipo.toString(16).padStart(3, '0')}-${n.toString(16).padStart(12, '0')}`

const USUARIO = 1
const CUENTA = 2
const EXPLOTACION = 3
const MIEMBRO = 4

const usuarios = [
  { n: 1, usuario: 'propietario', nombre: 'Pablo Propietario', propietario: true },
  { n: 2, usuario: 'ana', nombre: 'Ana Varela' },
  { n: 3, usuario: 'xose', nombre: 'Xosé Lema' },
  { n: 4, usuario: 'maria', nombre: 'María Souto' },
  { n: 5, usuario: 'brais', nombre: 'Brais Otero' },
]

const explotaciones = [
  { n: 1, nombre: 'A Veiga', rega: 'ES150780000001', municipio: 'Lalín', provincia: 'Pontevedra' },
  { n: 2, nombre: 'O Souto', rega: 'ES270280000002', municipio: 'Vilalba', provincia: 'Lugo' },
]

// Ana es administradora de A Veiga y empleada de O Souto
const miembros: [number, number, number, RolExplotacion][] = [
  [1, 1, 2, 'administrador'],
  [2, 1, 4, 'empleado'],
  [3, 2, 3, 'administrador'],
  [4, 2, 2, 'empleado'],
  [5, 2, 5, 'empleado'],
]

await migrar()

const hash = await hashPassword(CONTRASENA)

await db.transaction(async (tx) => {
  await tx
    .insert(user)
    .values(
      usuarios.map((u) => ({
        id: sid(USUARIO, u.n),
        name: u.nombre,
        email: `${u.usuario}@marela.test`,
        emailVerified: true,
        username: u.usuario,
        displayUsername: u.usuario,
        propietario: u.propietario ?? false,
      })),
    )
    .onConflictDoNothing()

  await tx
    .insert(account)
    .values(
      usuarios.map((u) => ({
        id: sid(CUENTA, u.n),
        accountId: sid(USUARIO, u.n),
        providerId: 'credential',
        userId: sid(USUARIO, u.n),
        password: hash,
      })),
    )
    .onConflictDoNothing()

  await tx
    .insert(organization)
    .values(
      explotaciones.map((e) => ({
        id: sid(EXPLOTACION, e.n),
        name: e.nombre,
        slug: e.rega.toLowerCase(),
        rega: e.rega,
        municipio: e.municipio,
        provincia: e.provincia,
      })),
    )
    .onConflictDoNothing()

  await tx
    .insert(member)
    .values(
      miembros.map(([n, explotacion, usuario, role]) => ({
        id: sid(MIEMBRO, n),
        organizationId: sid(EXPLOTACION, explotacion),
        userId: sid(USUARIO, usuario),
        role,
      })),
    )
    .onConflictDoNothing()
})

await pool.end()
console.log(
  `Datos de ejemplo cargados: ${usuarios.length} usuarios y ${explotaciones.length} explotaciones (contraseña ${CONTRASENA})`,
)
