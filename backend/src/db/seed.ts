import { hashPassword } from 'better-auth/crypto'
import { config } from '../config.js'
import { hoyEnMadrid } from '../fechas.js'
import { db, pool } from './cliente.js'
import { enExplotacion } from './explotacion.js'
import { migrar } from './migrar.js'
import {
  account,
  animales,
  member,
  organization,
  pesos,
  type RolExplotacion,
  tratamientos,
  user,
} from './schema/index.js'

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
const ANIMAL = 5
const PESADA = 6
const TRATAMIENTO = 7

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

// Animales de A Veiga, dados de alta por Ana: vacas, un toro propio, un toro comprado y terneros con
// su madre y su padre (propio o dosis externa)
type AnimalEjemplo = {
  n: number
  crotal: string
  nombre?: string
  raza: string
  sexo: 'hembra' | 'macho'
  nacimiento: string
  madre?: number
  padre?: number
  padreTexto?: string
  comprado?: { entrada: string; rega: string }
}

const animalesVeiga: AnimalEjemplo[] = [
  {
    n: 1,
    crotal: 'ES041503456789',
    nombre: 'Marela',
    raza: 'Rubia Gallega',
    sexo: 'hembra',
    nacimiento: '2019-03-14',
  },
  {
    n: 2,
    crotal: 'ES041503456790',
    nombre: 'Bonita',
    raza: 'Rubia Gallega',
    sexo: 'hembra',
    nacimiento: '2020-05-02',
  },
  {
    n: 3,
    crotal: 'ES041503456791',
    nombre: 'Pinta',
    raza: 'Cruzada',
    sexo: 'hembra',
    nacimiento: '2018-04-21',
  },
  {
    n: 4,
    crotal: 'ES041503456812',
    nombre: 'Moreno',
    raza: 'Rubia Gallega',
    sexo: 'macho',
    nacimiento: '2018-11-20',
  },
  {
    n: 5,
    crotal: 'ES071203300145',
    nombre: 'Lucero',
    raza: 'Limusina',
    sexo: 'macho',
    nacimiento: '2021-02-08',
    comprado: { entrada: '2023-06-15', rega: 'ES270280000002' },
  },
  {
    n: 6,
    crotal: 'ES041503457001',
    raza: 'Rubia Gallega',
    sexo: 'hembra',
    nacimiento: '2026-02-11',
    madre: 1,
    padre: 4,
  },
  {
    n: 7,
    crotal: 'ES041503457002',
    raza: 'Cruzada',
    sexo: 'macho',
    nacimiento: '2026-03-03',
    madre: 3,
    padre: 5,
  },
  {
    n: 8,
    crotal: 'ES041503457003',
    raza: 'Rubia Gallega',
    sexo: 'macho',
    nacimiento: '2026-04-19',
    madre: 2,
    padreTexto: 'Dosis RG-1187',
  },
]

// Pesadas: [animal, fecha, kg, momento]
const pesadasVeiga = [
  [1, '2025-10-02', 612, 'otro'],
  [1, '2026-10-01', 640, 'otro'],
  [6, '2026-02-11', 38, 'nacimiento'],
  [6, '2026-04-15', 102, 'otro'],
  [6, '2026-06-20', 171, 'otro'],
  [6, '2026-08-28', 236, 'destete'],
  [6, '2026-10-10', 281.5, 'otro'],
  [7, '2026-03-03', 41, 'nacimiento'],
  [7, '2026-06-20', 152, 'otro'],
] as const

// Tratamientos: una desparasitación y una vacuna de las adultas, y la ternera con neumonía hace tres
// días, para que haya una supresión en curso. Uno anulado, registrado en el animal equivocado.
const haceTresDias = new Date(Date.parse(`${hoyEnMadrid()}T12:00:00Z`) - 3 * 864e5)
  .toISOString()
  .slice(0, 10)

type TratamientoEjemplo = Omit<typeof tratamientos.$inferInsert, 'animalId'> & {
  animal: number
  anulado?: string
}

const tratamientosVeiga: TratamientoEjemplo[] = [
  ...[1, 2, 3, 4, 5].map((animal) => ({
    animal,
    fecha: '2026-04-10',
    producto: 'Ivermectina 1 %',
    dosis: '1 ml por cada 50 kg',
    via: 'subcutanea' as const,
    motivo: 'desparasitacion' as const,
    aplicadoPorId: sid(USUARIO, 2),
    lote: 'L2403A',
    diasSupresion: 49,
  })),
  ...[1, 2, 3].map((animal) => ({
    animal,
    fecha: '2026-06-05',
    producto: 'Vacuna lengua azul serotipo 3',
    dosis: '2 ml',
    via: 'intramuscular' as const,
    motivo: 'vacuna' as const,
    diagnostico: 'Lengua azul',
    aplicadoPorId: sid(USUARIO, 4),
    lote: 'BTV3-0612',
    diasSupresion: 0,
  })),
  {
    animal: 7,
    fecha: '2026-09-15',
    producto: 'Oxitetraciclina LA',
    dosis: '15 ml',
    via: 'intramuscular' as const,
    motivo: 'enfermedad' as const,
    diagnostico: 'Neumonía',
    aplicadoPorTexto: 'Veterinaria de la ADS',
    diasSupresion: 28,
    anulado: 'Registrado en el animal equivocado: era la ternera ES041503457001',
  },
  {
    animal: 6,
    fecha: haceTresDias,
    producto: 'Oxitetraciclina LA',
    dosis: '20 ml',
    via: 'intramuscular' as const,
    motivo: 'enfermedad' as const,
    diagnostico: 'Neumonía',
    aplicadoPorTexto: 'Veterinaria de la ADS',
    lote: 'OX-5521',
    diasSupresion: 28,
    observaciones: 'Repetir a las 72 horas si sigue con fiebre',
  },
]

await enExplotacion(
  { explotacionId: sid(EXPLOTACION, 1), usuarioId: sid(USUARIO, 2) },
  async (tx) => {
    // En orden: madres y padres antes que sus terneros
    for (const a of animalesVeiga) {
      await tx
        .insert(animales)
        .values({
          id: sid(ANIMAL, a.n),
          crotal: a.crotal,
          nombre: a.nombre ?? null,
          raza: a.raza,
          sexo: a.sexo,
          fechaNacimiento: a.nacimiento,
          madreId: a.madre ? sid(ANIMAL, a.madre) : null,
          padreId: a.padre ? sid(ANIMAL, a.padre) : null,
          padreTexto: a.padreTexto ?? null,
          origen: a.comprado ? 'comprado' : 'nacido',
          fechaEntrada: a.comprado?.entrada ?? null,
          regaOrigen: a.comprado?.rega ?? null,
        })
        .onConflictDoNothing()
    }
    for (const [i, [animal, fecha, kg, momento]] of pesadasVeiga.entries()) {
      await tx
        .insert(pesos)
        .values({ id: sid(PESADA, i + 1), animalId: sid(ANIMAL, animal), fecha, kg, momento })
        .onConflictDoNothing()
    }
    for (const [i, { animal, anulado, ...t }] of tratamientosVeiga.entries()) {
      await tx
        .insert(tratamientos)
        .values({
          id: sid(TRATAMIENTO, i + 1),
          animalId: sid(ANIMAL, animal),
          ...t,
          ...(anulado
            ? { anuladoEn: new Date(), anuladoPor: sid(USUARIO, 2), motivoAnulacion: anulado }
            : {}),
        })
        .onConflictDoNothing()
    }
  },
)

await pool.end()
console.log(
  `Datos de ejemplo cargados: ${usuarios.length} usuarios, ${explotaciones.length} explotaciones y ${animalesVeiga.length} animales (contraseña ${CONTRASENA})`,
)
