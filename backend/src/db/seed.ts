import { hashPassword } from 'better-auth/crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { crearAlmacenesPorDefecto } from '../almacenes.js'
import { config } from '../config.js'
import { hoyEnMadrid } from '../fechas.js'
import { db, pool } from './cliente.js'
import { enExplotacion } from './explotacion.js'
import { migrar } from './migrar.js'
import { RECINTOS_EJEMPLO } from './recintos-ejemplo.js'
import {
  account,
  almacenes,
  animales,
  aplicaciones,
  eventosReproductivos,
  fincas,
  labores,
  member,
  movimientosComida,
  organization,
  parcelas,
  partos,
  pastoreos,
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
const EVENTO = 8
const PARTO = 9
const FINCA = 10
const PARCELA = 11
const LABOR = 12
const APLICACION = 13
const PASTOREO = 14
const MOVIMIENTO = 15

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

  // Los almacenes de comida por defecto, como al crear una explotación, a nombre de su administrador
  for (const [, explotacion, usuario, role] of miembros) {
    if (role === 'administrador')
      await crearAlmacenesPorDefecto(tx, sid(EXPLOTACION, explotacion), sid(USUARIO, usuario))
  }
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
// Fecha de hace n días: lo que depende de hoy (supresiones, gestaciones) sigue en curso
const haceDias = (n: number) =>
  new Date(Date.parse(`${hoyEnMadrid()}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10)
const haceTresDias = haceDias(3)

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

// Eventos reproductivos: Marela, cubierta por Moreno, inseminada después de parir y confirmada
// gestante; Bonita, vacía y cubierta después por Lucero sin diagnóstico; Pinta, inseminada y
// confirmada, con una cubrición anulada; y el destete de la ternera de Marela
type EventoEjemplo = Omit<typeof eventosReproductivos.$inferInsert, 'animalId' | 'padreId'> & {
  animal: number
  padre?: number
  anulado?: string
}

const eventosVeiga: EventoEjemplo[] = [
  { animal: 1, tipo: 'cubricion', fecha: '2025-04-20', padre: 4 },
  { animal: 6, tipo: 'destete', fecha: '2026-08-28' },
  { animal: 1, tipo: 'inseminacion', fecha: haceDias(65), padreTexto: 'Dosis RG-1187' },
  {
    animal: 1,
    tipo: 'diagnostico',
    fecha: haceDias(25),
    metodo: 'ecografia',
    resultado: 'gestante',
  },
  { animal: 2, tipo: 'cubricion', fecha: haceDias(100), padre: 5 },
  { animal: 3, tipo: 'inseminacion', fecha: haceDias(290), padreTexto: 'Dosis LM-0442' },
  {
    animal: 3,
    tipo: 'cubricion',
    fecha: haceDias(285),
    padre: 4,
    anulado: 'Registrada en la vaca equivocada',
  },
  {
    animal: 2,
    tipo: 'diagnostico',
    fecha: haceDias(120),
    metodo: 'palpacion',
    resultado: 'vacia',
    observaciones: 'Repetir la cubrición en el próximo celo',
  },
  {
    animal: 3,
    tipo: 'diagnostico',
    fecha: haceDias(230),
    metodo: 'palpacion',
    resultado: 'gestante',
  },
]

// Partos: el de Marela, del que nació su ternera, y el de Pinta hace cuatro días, con ayuda, de un
// ternero que aún no tiene crotal
const partosVeiga = [
  { n: 1, madre: 1, fecha: '2026-02-11', tipo: 'normal' as const, padre: 4, terneros: [6] },
  {
    n: 2,
    madre: 3,
    fecha: haceDias(4),
    tipo: 'con_ayuda' as const,
    padreTexto: 'Dosis LM-0442',
    terneros: [9],
  },
]

// El ternero de Pinta, sin crotal todavía
const TERNERO_SIN_CROTAL = { n: 9, raza: 'Cruzada', sexo: 'macho' as const, peso: 40 }

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
    for (const { n, madre, padre, padreTexto, terneros, ...p } of partosVeiga) {
      await tx
        .insert(partos)
        .values({
          id: sid(PARTO, n),
          madreId: sid(ANIMAL, madre),
          padreId: padre ? sid(ANIMAL, padre) : null,
          padreTexto: padreTexto ?? null,
          ...p,
        })
        .onConflictDoNothing()
      for (const ternero of terneros) {
        if (ternero === TERNERO_SIN_CROTAL.n) {
          await tx
            .insert(animales)
            .values({
              id: sid(ANIMAL, ternero),
              crotal: null,
              raza: TERNERO_SIN_CROTAL.raza,
              sexo: TERNERO_SIN_CROTAL.sexo,
              fechaNacimiento: p.fecha,
              madreId: sid(ANIMAL, madre),
              padreTexto: padreTexto ?? null,
              partoId: sid(PARTO, n),
            })
            .onConflictDoNothing()
          await tx
            .insert(pesos)
            .values({
              id: sid(PESADA, 100 + n),
              animalId: sid(ANIMAL, ternero),
              fecha: p.fecha,
              kg: TERNERO_SIN_CROTAL.peso,
              momento: 'nacimiento',
            })
            .onConflictDoNothing()
        } else {
          await tx
            .update(animales)
            .set({ partoId: sid(PARTO, n) })
            .where(eq(animales.id, sid(ANIMAL, ternero)))
        }
      }
    }
    for (const [i, { animal, padre, anulado, ...e }] of eventosVeiga.entries()) {
      await tx
        .insert(eventosReproductivos)
        .values({
          id: sid(EVENTO, i + 1),
          animalId: sid(ANIMAL, animal),
          padreId: padre ? sid(ANIMAL, padre) : null,
          ...e,
          ...(anulado
            ? { anuladoEn: new Date(), anuladoPor: sid(USUARIO, 2), motivoAnulacion: anulado }
            : {}),
        })
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

// Fincas de A Veiga (GH-25): dos en propiedad, una arrendada y una antigua ya desactivada
const fincasVeiga = [
  {
    n: 1,
    nombre: 'Agra de abaixo',
    regimen: 'propiedad' as const,
    parcelas: [{ recinto: '36:24:0:0:159:82:1' }, { recinto: '36:24:0:0:159:18:1' }],
  },
  {
    n: 2,
    nombre: 'Chousa do monte',
    regimen: 'arrendamiento' as const,
    observaciones: 'Arrendada a Manuel Rey hasta 2030',
    parcelas: [{ recinto: '36:24:0:0:123:413:1' }],
  },
  {
    n: 3,
    nombre: 'Prado da fonte',
    regimen: 'propiedad' as const,
    parcelas: [{ recinto: '36:24:0:0:159:96:1' }],
  },
  {
    n: 4,
    nombre: 'Leira vella',
    regimen: 'cesion' as const,
    activa: false,
    parcelas: [{ catastral: '36024A012000950000KS', superficie: 0.35 }],
  },
]

await enExplotacion(
  { explotacionId: sid(EXPLOTACION, 1), usuarioId: sid(USUARIO, 2) },
  async (tx) => {
    let numero = 0
    for (const { n, parcelas: suyas, ...f } of fincasVeiga) {
      await tx
        .insert(fincas)
        .values({ id: sid(FINCA, n), municipio: 'Lalín', provincia: 'Pontevedra', ...f })
        .onConflictDoNothing()
      for (const parcela of suyas as {
        recinto?: string
        catastral?: string
        superficie?: number
      }[]) {
        numero += 1
        // Las de recintos reales, con su contorno; las demás, solo con la referencia catastral
        const real = parcela.recinto ? RECINTOS_EJEMPLO[parcela.recinto] : undefined
        const [provincia, municipio, agregado, zona, poligono, numeroParcela, recinto] =
          parcela.recinto?.split(':') ?? []
        const valores = {
          provincia,
          municipio,
          agregado,
          zona,
          poligono,
          parcela: numeroParcela,
          recinto,
          referenciaCatastral: real?.catastral ?? parcela.catastral ?? null,
          superficie: real?.superficie ?? parcela.superficie ?? 0,
          uso: real?.uso ?? null,
          contorno: real?.contorno ?? null,
        }
        await tx
          .insert(parcelas)
          .values({ id: sid(PARCELA, numero), fincaId: sid(FINCA, n), ...valores })
          // Se actualizan: las de bases cargadas antes de GH-91 no tenían recintos reales
          .onConflictDoUpdate({ target: parcelas.id, set: valores })
      }
    }
  },
)

// Labores (GH-26): la pradera de Agra de abaixo, sembrada, ensilada en rolos y segada; el maíz de
// Chousa do monte, con el laboreo, la siembra y la cosecha del contratista
const laboresVeiga: (Omit<typeof labores.$inferInsert, 'fincaId' | 'superficie'> & {
  finca: number
  superficie?: number
})[] = [
  {
    finca: 1,
    tipo: 'siembra',
    fecha: '2025-10-05',
    cultivo: 'Pradera de raigrás',
    realizadaPorId: sid(USUARIO, 2),
  },
  {
    finca: 1,
    tipo: 'cosecha',
    fecha: '2026-05-12',
    cultivo: 'Pradera de raigrás',
    cantidad: 42,
    unidad: 'rolos',
    realizadaPorTexto: 'Contratista Hermanos Rey',
  },
  {
    finca: 1,
    tipo: 'otra',
    fecha: '2026-07-02',
    labor: 'Siega',
    superficie: 0.6512,
    realizadaPorId: sid(USUARIO, 4),
  },
  {
    finca: 2,
    tipo: 'otra',
    fecha: '2026-04-20',
    labor: 'Laboreo',
    realizadaPorTexto: 'Contratista Hermanos Rey',
  },
  {
    finca: 2,
    tipo: 'siembra',
    fecha: '2026-05-02',
    cultivo: 'Maíz forrajero',
    realizadaPorTexto: 'Contratista Hermanos Rey',
    observaciones: 'Variedad de ciclo 300',
  },
  {
    finca: 2,
    tipo: 'cosecha',
    fecha: '2026-09-28',
    cultivo: 'Maíz forrajero',
    cantidad: 6,
    unidad: 'remolques',
    realizadaPorTexto: 'Contratista Hermanos Rey',
  },
]

// Abonados y tratamientos fitosanitarios: purín y abono mineral en la pradera, y un herbicida contra
// la romaza hace una semana, para que haya un plazo de seguridad en curso. Uno anulado.
type AplicacionEjemplo = Omit<typeof aplicaciones.$inferInsert, 'fincaId' | 'superficie'> & {
  finca: number
  superficie?: number
  anulado?: string
}

const aplicacionesVeiga: AplicacionEjemplo[] = [
  {
    finca: 1,
    tipo: 'abono',
    fecha: '2026-02-20',
    producto: 'Purín de vacuno',
    tipoAbono: 'organico',
    dosis: 30,
    unidadDosis: 'm3_ha',
    aplicadoPorId: sid(USUARIO, 4),
  },
  {
    finca: 1,
    tipo: 'abono',
    fecha: '2026-03-15',
    producto: 'NPK 8-24-16',
    tipoAbono: 'mineral',
    dosis: 400,
    unidadDosis: 'kg_ha',
    aplicadoPorId: sid(USUARIO, 2),
    lote: 'AG-2611',
  },
  {
    finca: 1,
    tipo: 'fitosanitario',
    fecha: haceDias(7),
    producto: 'Fluroxipir 20 %',
    dosis: 1.5,
    unidadDosis: 'l_ha',
    superficie: 0.6512,
    plaga: 'Romaza',
    diasSeguridad: 28,
    aplicadoPorTexto: 'Cooperativa do Deza',
    ropo: '3600012345678',
    equipo: 'Pulverizador suspendido 800 l',
    lote: 'FX-0925',
  },
  {
    finca: 2,
    tipo: 'abono',
    fecha: '2026-04-20',
    producto: 'Urea 46 %',
    tipoAbono: 'mineral',
    dosis: 200,
    unidadDosis: 'kg_ha',
    aplicadoPorId: sid(USUARIO, 2),
    anulado: 'Era en Agra de abaixo',
  },
]

// Pastoreos: las vacas con sus crías en Prado da fonte desde hace diez días, en curso, y antes en
// Chousa do monte, tras ensilar el maíz
const pastoreosVeiga: (Omit<typeof pastoreos.$inferInsert, 'fincaId'> & { finca: number })[] = [
  {
    finca: 2,
    fechaEntrada: '2026-09-30',
    fechaSalida: haceDias(10),
    animales: 12,
    observaciones: 'Vacas con sus crías, en la rastrojera del maíz',
  },
  { finca: 3, fechaEntrada: haceDias(10), animales: 12, observaciones: 'Vacas con sus crías' },
  { finca: 1, fechaEntrada: '2026-03-02', fechaSalida: '2026-03-20', animales: 8 },
]

// La de un recinto real, la suya; la de las demás parcelas, la escrita
const superficieParcela = (p: { recinto?: string; superficie?: number }) =>
  (p.recinto ? RECINTOS_EJEMPLO[p.recinto]?.superficie : p.superficie) ?? 0
const superficieFinca = (n: number) =>
  fincasVeiga
    .find((f) => f.n === n)
    ?.parcelas.reduce((t, p) => t + superficieParcela(p as { recinto?: string }), 0) ?? 0

await enExplotacion(
  { explotacionId: sid(EXPLOTACION, 1), usuarioId: sid(USUARIO, 2) },
  async (tx) => {
    for (const [i, { finca, superficie, ...l }] of laboresVeiga.entries()) {
      await tx
        .insert(labores)
        .values({
          id: sid(LABOR, i + 1),
          fincaId: sid(FINCA, finca),
          superficie: superficie ?? superficieFinca(finca),
          ...l,
        })
        .onConflictDoNothing()
    }
    for (const [i, { finca, superficie, anulado, ...a }] of aplicacionesVeiga.entries()) {
      await tx
        .insert(aplicaciones)
        .values({
          id: sid(APLICACION, i + 1),
          fincaId: sid(FINCA, finca),
          superficie: superficie ?? superficieFinca(finca),
          ...a,
          ...(anulado
            ? { anuladoEn: new Date(), anuladoPor: sid(USUARIO, 2), motivoAnulacion: anulado }
            : {}),
        })
        .onConflictDoNothing()
    }
    for (const [i, { finca, ...p }] of pastoreosVeiga.entries()) {
      await tx
        .insert(pastoreos)
        .values({ id: sid(PASTOREO, i + 1), fincaId: sid(FINCA, finca), ...p })
        .onConflictDoNothing()
    }
  },
)

// Pinta tiene paratuberculosis, que afecta a toda su descendencia (GH-110). Solo si aún no se
// ha marcado, para no cambiar lo que ya hay.
await enExplotacion({ explotacionId: sid(EXPLOTACION, 1), usuarioId: sid(USUARIO, 2) }, (tx) =>
  tx
    .update(animales)
    .set({
      noAptaReposicionDesde: haceDias(60),
      motivoNoAptaReposicion: 'Paratuberculosis',
      alcanceNoAptaReposicion: 'descendencia',
    })
    .where(and(eq(animales.id, sid(ANIMAL, 3)), isNull(animales.noAptaReposicionDesde))),
)

// Movimientos de los almacenes de A Veiga, registrados por Ana: la hierba seca de Agra de abaixo, el
// pienso comprado y lo que se les da a diario. El silo de pienso queda en negativo, en rojo.
const movimientosVeiga = [
  {
    almacen: 'Pacas de hierba seca',
    dias: 40,
    tipo: 'entrada' as const,
    cantidad: 120,
    origen: 'produccion_propia' as const,
    finca: 1,
  },
  { almacen: 'Pacas de hierba seca', dias: 20, tipo: 'salida' as const, cantidad: 30 },
  {
    almacen: 'Pacas de hierba seca',
    dias: 10,
    tipo: 'ajuste' as const,
    ajuste: 'recuento' as const,
    cantidad: 86,
    motivo: 'Recuento del pajar',
  },
  { almacen: 'Pacas de hierba seca', dias: 2, tipo: 'salida' as const, cantidad: 6 },
  {
    almacen: 'Silo de maíz',
    dias: 30,
    tipo: 'entrada' as const,
    cantidad: 18_500,
    origen: 'produccion_propia' as const,
    finca: 2,
  },
  { almacen: 'Silo de maíz', dias: 5, tipo: 'salida' as const, cantidad: 2_400 },
  {
    almacen: 'Silo de maíz',
    dias: 3,
    tipo: 'ajuste' as const,
    ajuste: 'merma' as const,
    cantidad: 350,
    motivo: 'Capa estropeada al abrir el silo',
  },
  {
    almacen: 'Silo de pienso',
    dias: 25,
    tipo: 'entrada' as const,
    cantidad: 3_000,
    origen: 'compra' as const,
  },
  { almacen: 'Silo de pienso', dias: 4, tipo: 'salida' as const, cantidad: 3_200 },
]

await enExplotacion(
  { explotacionId: sid(EXPLOTACION, 1), usuarioId: sid(USUARIO, 2) },
  async (tx) => {
    const suyos = await tx.select({ id: almacenes.id, nombre: almacenes.nombre }).from(almacenes)
    const almacenId = new Map(suyos.map((x) => [x.nombre, x.id]))
    for (const [i, { almacen, dias, finca, ...m }] of movimientosVeiga.entries()) {
      const id = almacenId.get(almacen)
      if (!id) continue
      await tx
        .insert(movimientosComida)
        .values({
          id: sid(MOVIMIENTO, i + 1),
          almacenId: id,
          fecha: haceDias(dias),
          fincaId: finca ? sid(FINCA, finca) : null,
          ...m,
        })
        .onConflictDoNothing()
    }
  },
)

await pool.end()
console.log(
  `Datos de ejemplo cargados: ${usuarios.length} usuarios, ${explotaciones.length} explotaciones, ${animalesVeiga.length + 1} animales y ${fincasVeiga.length} fincas (contraseña ${CONTRASENA})`,
)
