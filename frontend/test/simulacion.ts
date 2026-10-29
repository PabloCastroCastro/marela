import { vi } from 'vitest'

// API simulada para los tests de pantallas: sesión de Better Auth, explotaciones del usuario y gestión
// de la plataforma, con un estado que las pruebas preparan y que cambia como lo haría el backend.

type Rol = 'administrador' | 'empleado'

export type ExplotacionSimulada = {
  id: string
  nombre: string
  rega: string
  rol: Rol
  municipio?: string
  provincia?: string
  activa?: boolean
  // El usuario es miembro, pero el administrador lo ha desactivado
  miembroDesactivado?: boolean
}

// Equipo de A Veiga, que gestiona Ana
export type MiembroSimulado = {
  id: string
  usuarioId: string
  usuario: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  // Tiene acceso a otras explotaciones: su administrador no puede restablecerle la contraseña
  otras?: boolean
}

// Lo que ve el propietario en la gestión de la plataforma
export type ExplotacionDePlataforma = {
  id: string
  nombre: string
  rega: string
  municipio: string | null
  provincia: string | null
  activa: boolean
  miembros: number
  creadaEn: string
}

// Animales de A Veiga
export type AnimalSimulado = {
  id: string
  crotal: string | null
  nombre: string | null
  raza: string
  sexo: 'hembra' | 'macho'
  fechaNacimiento: string
  madreId: string | null
  madreTexto: string | null
  padreId: string | null
  padreTexto: string | null
  origen: 'nacido' | 'comprado'
  fechaEntrada: string | null
  regaOrigen: string | null
  estado: 'activo' | 'vendido' | 'muerto' | 'baja'
  tipoBaja: 'venta' | 'muerte' | 'sacrificio' | 'robo_extravio' | 'otra' | null
  fechaBaja: string | null
  causaBaja: string | null
  observaciones: string | null
  partoId?: string | null
  // No dejar hijas para reposición (GH-110)
  noAptaReposicion?: { desde: string; motivo: string; alcance: 'hijas' | 'descendencia' } | null
}

export const animalSimulado = (
  cambios: Partial<AnimalSimulado> & { id: string; crotal: string | null },
): AnimalSimulado => ({
  nombre: null,
  raza: 'Rubia Gallega',
  sexo: 'hembra',
  fechaNacimiento: '2020-01-01',
  madreId: null,
  madreTexto: null,
  padreId: null,
  padreTexto: null,
  origen: 'nacido',
  fechaEntrada: null,
  regaOrigen: null,
  estado: 'activo',
  tipoBaja: null,
  fechaBaja: null,
  causaBaja: null,
  observaciones: null,
  partoId: null,
  ...cambios,
})

export type PesadaSimulada = {
  id: string
  animalId: string
  fecha: string
  kg: number
  momento: 'nacimiento' | 'destete' | 'venta' | 'otro'
}

export type TratamientoSimulado = {
  id: string
  animalId: string
  fecha: string
  producto: string
  dosis: string | null
  via: string | null
  motivo: 'enfermedad' | 'vacuna' | 'desparasitacion' | 'otro'
  diagnostico: string | null
  aplicadoPor: { id: string | null; nombre: string } | null
  lote: string | null
  diasSupresion: number
  observaciones: string | null
  anulacion: { en: string; por: string; motivo: string } | null
}

// Día en que termina la supresión: la fecha más los días
const finSupresion = (t: TratamientoSimulado) =>
  new Date(Date.parse(`${t.fecha}T00:00:00Z`) + t.diasSupresion * 86_400_000)
    .toISOString()
    .slice(0, 10)

export type EventoSimulado = {
  id: string
  animalId: string
  tipo: 'cubricion' | 'inseminacion' | 'diagnostico' | 'aborto' | 'destete'
  fecha: string
  padreId: string | null
  padreTexto: string | null
  metodo: 'ecografia' | 'palpacion' | null
  resultado: 'gestante' | 'vacia' | null
  observaciones: string | null
  anulacion: { en: string; por: string; motivo: string } | null
}

const masDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)

export type PartoSimulado = {
  id: string
  madreId: string
  fecha: string
  tipo: 'normal' | 'con_ayuda' | 'cesarea'
  padreId: string | null
  padreTexto: string | null
  observaciones: string | null
  anulacion: { en: string; por: string; motivo: string } | null
}

export type ParcelaSimulada = {
  id: string
  provincia: string | null
  municipio: string | null
  poligono: string | null
  parcela: string | null
  recinto: string | null
  agregado?: string | null
  zona?: string | null
  uso?: string | null
  contorno?: unknown
  referenciaCatastral: string | null
  superficie: number
}

export type FincaSimulada = {
  id: string
  nombre: string
  municipio: string | null
  provincia: string | null
  regimen: 'propiedad' | 'arrendamiento' | 'aparceria' | 'cesion' | 'otro'
  observaciones: string | null
  activa: boolean
  parcelas: ParcelaSimulada[]
}

export type LaborSimulada = {
  id: string
  fincaId: string
  tipo: 'siembra' | 'cosecha' | 'otra'
  fecha: string
  cultivo: string | null
  labor: string | null
  superficie: number
  cantidad: number | null
  unidad: 'kg' | 't' | 'pacas' | 'rolos' | 'remolques' | null
  realizadaPor: { id: string | null; nombre: string } | null
  observaciones: string | null
}

export type AplicacionSimulada = {
  id: string
  fincaId: string
  tipo: 'abono' | 'fitosanitario'
  fecha: string
  producto: string
  tipoAbono: 'mineral' | 'organico' | null
  dosis: number
  unidadDosis: 'kg_ha' | 't_ha' | 'l_ha' | 'm3_ha'
  superficie: number
  aplicadoPor: { id: string | null; nombre: string } | null
  lote: string | null
  plaga: string | null
  diasSeguridad: number
  finSeguridad: string
  ropo: string | null
  equipo: string | null
  observaciones: string | null
  anulacion: { en: string; por: string; motivo: string } | null
}

export type PastoreoSimulado = {
  id: string
  fincaId: string
  fechaEntrada: string
  fechaSalida: string | null
  animales: number
  observaciones: string | null
}

export type AlmacenSimulado = {
  id: string
  nombre: string
  tipo: 'hierba_verde' | 'hierba_seca' | 'maiz' | 'pienso' | 'otro'
  unidad: 'unidades' | 'kg'
  activo: boolean
}

export type MovimientoSimulado = {
  id: string
  almacenId: string
  tipo: 'entrada' | 'salida' | 'ajuste'
  fecha: string
  cantidad: number
  origen: 'compra' | 'produccion_propia' | null
  fincaId: string | null
  ajuste: 'recuento' | 'merma' | null
  motivo: string | null
  observaciones: string | null
}

export const movimientoSimulado = (
  datos: Partial<MovimientoSimulado> &
    Pick<MovimientoSimulado, 'id' | 'almacenId' | 'tipo' | 'cantidad'>,
): MovimientoSimulado => ({
  fecha: '2026-10-01',
  origen: datos.tipo === 'entrada' ? 'compra' : null,
  fincaId: null,
  ajuste: null,
  motivo: null,
  observaciones: null,
  ...datos,
})

export type EquipoSimulado = {
  id: string
  nombre: string
  tipo: 'maquinaria' | 'infraestructura'
  descripcion: string | null
  activo: boolean
}

export type TareaSimulada = {
  id: string
  titulo: string
  equipoId: string | null
  descripcion: string | null
  fechaLimite: string | null
  prioridad: 'baja' | 'normal' | 'alta'
  asignadaAId: string | null
  hecha: { en: string; porId: string } | null
}

export type FacturaSimulada = {
  id: string
  tipo: 'recibida' | 'emitida'
  numero: string
  fecha: string
  tercero: string
  nif: string
  nifExtranjero: boolean
  concepto: string
  impuesto: 'iva' | 'compensacion'
  lineas: { base: number; porcentaje: number; cuota: number }[]
  pagadaEn: string | null
  archivo: { nombre: string; tipo: string; tamano: number } | null
  animalIds: string[]
  // Las entradas de comida compradas con ella (GH-36)
  movimientoIds?: string[]
}

export type ApunteSimulado = {
  id: string
  tipo: 'ingreso' | 'gasto'
  categoria: string
  fecha: string
  concepto: string
  importe: number
  observaciones: string | null
  archivo: { nombre: string; tipo: string; tamano: number } | null
  anulacion: { en: string; por: string; motivo: string } | null
}

export type VentaSimulada = {
  id: string
  fecha: string
  comprador: string
  modoPrecio: 'total' | 'por_animal' | 'por_kg'
  precio: number
  animales: { animalId: string; kg: number | null }[]
  facturaId: string | null
  observaciones: string | null
}

export type EstadoSimulado = {
  usuario: {
    id: string
    name: string
    email: string
    username: string
    propietario: boolean
    debeCambiarContrasena: boolean
  }
  contrasena: string
  conSesion: boolean
  explotaciones: ExplotacionSimulada[]
  plataforma: ExplotacionDePlataforma[]
  miembros: MiembroSimulado[]
  animales: AnimalSimulado[]
  pesadas: PesadaSimulada[]
  tratamientos: TratamientoSimulado[]
  eventos: EventoSimulado[]
  partos: PartoSimulado[]
  fincas: FincaSimulada[]
  labores: LaborSimulada[]
  aplicaciones: AplicacionSimulada[]
  pastoreos: PastoreoSimulado[]
  almacenes: AlmacenSimulado[]
  movimientos: MovimientoSimulado[]
  equipos: EquipoSimulado[]
  tareas: TareaSimulada[]
  facturas: FacturaSimulada[]
  apuntes: ApunteSimulado[]
  ventas: VentaSimulada[]
  // Régimen fiscal guardado (GH-34); sin él, el de por defecto
  fiscal?: { regimen: 'reagp' | 'general'; compensacionReagp: number; tiposIva: number[] }
  // Sin cobertura: ninguna petición llega (fetch falla como sin red), o solo las que cumplan esto
  sinRed?: boolean | ((ruta: string, metodo: string) => boolean)
}

const MODULOS: Record<Rol, string[]> = {
  administrador: ['animales', 'comida', 'fincas', 'mantenimiento', 'finanzas', 'administracion'],
  empleado: ['animales', 'comida', 'fincas', 'mantenimiento'],
}

export const A_VEIGA: ExplotacionSimulada = {
  id: '00000000-0000-7000-8003-000000000001',
  nombre: 'A Veiga',
  rega: 'ES150780000001',
  rol: 'administrador',
  municipio: 'Lalín',
  provincia: 'Pontevedra',
}

export const O_SOUTO: ExplotacionSimulada = {
  id: '00000000-0000-7000-8003-000000000002',
  nombre: 'O Souto',
  rega: 'ES270280000002',
  rol: 'empleado',
}

export function estadoInicial(cambios: Partial<EstadoSimulado> = {}): EstadoSimulado {
  return {
    usuario: {
      id: 'u1',
      name: 'Ana Varela',
      email: 'ana@marela.test',
      username: 'ana',
      propietario: false,
      debeCambiarContrasena: false,
    },
    contrasena: 'contraseña-correcta',
    conSesion: false,
    explotaciones: [{ ...A_VEIGA }, { ...O_SOUTO }],
    plataforma: [],
    miembros: [
      {
        id: 'm1',
        usuarioId: 'u1',
        usuario: 'ana',
        nombre: 'Ana Varela',
        email: 'ana@marela.test',
        rol: 'administrador',
        activo: true,
      },
      {
        id: 'm2',
        usuarioId: 'u2',
        usuario: 'maria',
        nombre: 'María Souto',
        email: 'maria@marela.test',
        rol: 'empleado',
        activo: true,
      },
      {
        id: 'm3',
        usuarioId: 'u3',
        usuario: 'xose',
        nombre: 'Xosé Lema',
        email: 'xose@marela.test',
        rol: 'empleado',
        activo: true,
        otras: true,
      },
    ],
    animales: [
      animalSimulado({
        id: 'a1',
        crotal: 'ES041503456789',
        nombre: 'Marela',
        fechaNacimiento: '2019-03-14',
      }),
      animalSimulado({
        id: 'a2',
        crotal: 'ES041503456812',
        nombre: 'Moreno',
        sexo: 'macho',
        fechaNacimiento: '2018-11-20',
      }),
      animalSimulado({
        id: 'a3',
        crotal: 'ES041503457001',
        fechaNacimiento: '2026-02-11',
        madreId: 'a1',
        padreId: 'a2',
      }),
      animalSimulado({
        id: 'a4',
        crotal: 'ES041503457099',
        nombre: 'Vendida',
        raza: 'Limusina',
        estado: 'vendido',
        tipoBaja: 'venta',
        fechaBaja: '2026-05-01',
        causaBaja: 'Venta',
      }),
    ],
    pesadas: [
      { id: 'p1', animalId: 'a3', fecha: '2026-02-11', kg: 38, momento: 'nacimiento' },
      { id: 'p2', animalId: 'a3', fecha: '2026-04-12', kg: 98, momento: 'otro' },
    ],
    eventos: [],
    partos: [],
    labores: [
      {
        id: 'l1',
        fincaId: 'f1',
        tipo: 'cosecha',
        fecha: '2026-05-12',
        cultivo: 'Pradera de raigrás',
        labor: null,
        superficie: 3.4456,
        cantidad: 42,
        unidad: 'rolos',
        realizadaPor: { id: null, nombre: 'Contratista Hermanos Rey' },
        observaciones: null,
      },
    ],
    pastoreos: [],
    aplicaciones: [
      {
        id: 'ap1',
        fincaId: 'f1',
        tipo: 'abono',
        fecha: '2026-02-20',
        producto: 'Purín de vacuno',
        tipoAbono: 'organico',
        dosis: 30,
        unidadDosis: 'm3_ha',
        superficie: 3.4456,
        aplicadoPor: null,
        lote: null,
        plaga: null,
        diasSeguridad: 0,
        finSeguridad: '2026-02-20',
        ropo: null,
        equipo: null,
        observaciones: null,
        anulacion: null,
      },
    ],
    fincas: [
      {
        id: 'f1',
        nombre: 'Agra de abaixo',
        municipio: 'Lalín',
        provincia: 'Pontevedra',
        regimen: 'propiedad',
        observaciones: null,
        activa: true,
        parcelas: [
          {
            id: 'pc1',
            provincia: '36',
            municipio: '24',
            poligono: '12',
            parcela: '45',
            recinto: '1',
            referenciaCatastral: null,
            superficie: 2.3456,
          },
          {
            id: 'pc2',
            provincia: '36',
            municipio: '24',
            poligono: '12',
            parcela: '46',
            recinto: '1',
            referenciaCatastral: null,
            superficie: 1.1,
          },
        ],
      },
      {
        id: 'f2',
        nombre: 'Leira vella',
        municipio: 'Lalín',
        provincia: 'Pontevedra',
        regimen: 'cesion',
        observaciones: null,
        activa: false,
        parcelas: [
          {
            id: 'pc3',
            provincia: null,
            municipio: null,
            poligono: null,
            parcela: null,
            recinto: null,
            referenciaCatastral: '36024A012000950000KS',
            superficie: 0.35,
          },
        ],
      },
    ],
    tratamientos: [
      {
        id: 't1',
        animalId: 'a1',
        fecha: '2026-04-10',
        producto: 'Ivermectina 1 %',
        dosis: '10 ml',
        via: 'subcutanea',
        motivo: 'desparasitacion',
        diagnostico: null,
        aplicadoPor: { id: 'u1', nombre: 'Ana Varela' },
        lote: 'L2403A',
        diasSupresion: 49,
        observaciones: null,
        anulacion: null,
      },
    ],
    // Los de por defecto y uno desactivado
    almacenes: [
      {
        id: 'al1',
        nombre: 'Pacas de hierba verde',
        tipo: 'hierba_verde',
        unidad: 'unidades',
        activo: true,
      },
      {
        id: 'al2',
        nombre: 'Pacas de hierba seca',
        tipo: 'hierba_seca',
        unidad: 'unidades',
        activo: true,
      },
      { id: 'al3', nombre: 'Silo de maíz', tipo: 'maiz', unidad: 'kg', activo: true },
      { id: 'al4', nombre: 'Silo de pienso', tipo: 'pienso', unidad: 'kg', activo: true },
      {
        id: 'al5',
        nombre: 'Pacas de paja',
        tipo: 'otro',
        unidad: 'unidades',
        activo: false,
      },
    ],
    movimientos: [],
    equipos: [
      {
        id: 'eq1',
        nombre: 'Tractor John Deere',
        tipo: 'maquinaria',
        descripcion: 'Matrícula E-1234-BCD',
        activo: true,
      },
      {
        id: 'eq2',
        nombre: 'Nave de las vacas',
        tipo: 'infraestructura',
        descripcion: null,
        activo: true,
      },
    ],
    // Una del tractor sin asignar, una de otra persona y una hecha
    tareas: [
      {
        id: 'ta1',
        titulo: 'Cambiar la rueda',
        equipoId: 'eq1',
        descripcion: null,
        fechaLimite: '2026-01-10',
        prioridad: 'alta',
        asignadaAId: null,
        hecha: null,
      },
      {
        id: 'ta2',
        titulo: 'Pintar la nave',
        equipoId: 'eq2',
        descripcion: null,
        fechaLimite: null,
        prioridad: 'normal',
        asignadaAId: 'u2',
        hecha: null,
      },
      {
        id: 'ta3',
        titulo: 'Cambiar el aceite',
        equipoId: 'eq1',
        descripcion: null,
        fechaLimite: null,
        prioridad: 'normal',
        asignadaAId: 'u1',
        hecha: { en: '2026-10-01T10:00:00.000Z', porId: 'u1' },
      },
    ],
    // Una compra de pienso pendiente y una venta cobrada, con su archivo
    facturas: [
      {
        id: 'fa1',
        tipo: 'recibida',
        numero: 'P-381',
        fecha: '2026-10-15',
        tercero: 'Piensos do Norte',
        nif: 'B15000003',
        nifExtranjero: false,
        concepto: 'Pienso de engorde',
        impuesto: 'iva',
        lineas: [{ base: 1000, porcentaje: 10, cuota: 100 }],
        pagadaEn: null,
        archivo: null,
        animalIds: [],
      },
      {
        id: 'fa2',
        tipo: 'emitida',
        numero: '2026-0006',
        fecha: '2026-10-20',
        tercero: 'Carnes Galegas',
        nif: '12345678Z',
        nifExtranjero: false,
        concepto: 'Venta de terneros',
        impuesto: 'compensacion',
        lineas: [{ base: 2000, porcentaje: 10.5, cuota: 210 }],
        pagadaEn: '2026-10-25',
        archivo: { nombre: 'venta.pdf', tipo: 'application/pdf', tamano: 120_000 },
        animalIds: [],
      },
    ],
    ventas: [],
    // Una ayuda de la PAC, un seguro y un gasto anulado (GH-37)
    apuntes: [
      {
        id: 'ap1',
        tipo: 'ingreso',
        categoria: 'subvencion',
        fecha: '2026-10-20',
        concepto: 'Pago básico PAC',
        importe: 3250.4,
        observaciones: null,
        archivo: null,
        anulacion: null,
      },
      {
        id: 'ap2',
        tipo: 'gasto',
        categoria: 'seguro',
        fecha: '2026-10-10',
        concepto: 'Seguro del tractor',
        importe: 420,
        observaciones: null,
        archivo: null,
        anulacion: null,
      },
      {
        id: 'ap3',
        tipo: 'gasto',
        categoria: 'combustible',
        fecha: '2026-10-05',
        concepto: 'Gasóleo repetido',
        importe: 80,
        observaciones: null,
        archivo: null,
        anulacion: { en: '2026-10-06T10:00:00.000Z', por: 'Ana Varela', motivo: 'Repetido' },
      },
    ],
    ...cambios,
  }
}

const json = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status })
const errorApi = (status: number, codigo: string, detalles?: unknown) =>
  json({ error: { codigo, mensaje: codigo, detalles } }, status)

const DETALLE = /^\/api\/explotaciones\/([^/]+)$/
const EQUIPO = /^\/api\/explotaciones\/([^/]+)\/miembros(?:\/([^/]+))?(?:\/([^/]+))?$/
const ANIMALES = /^\/api\/explotaciones\/([^/]+)\/animales(?:\/([^/]+))?$/
const BAJA = /^\/api\/explotaciones\/[^/]+\/animales\/([^/]+)\/baja$/
const REPOSICION = /^\/api\/explotaciones\/[^/]+\/animales\/([^/]+)\/reposicion$/
const PESOS = /^\/api\/explotaciones\/[^/]+\/animales\/([^/]+)\/pesos(?:\/([^/]+))?$/
const TRATAMIENTOS_ANIMAL = /^\/api\/explotaciones\/[^/]+\/animales\/([^/]+)\/tratamientos$/
const REPRODUCCION_ANIMAL = /^\/api\/explotaciones\/[^/]+\/animales\/([^/]+)\/reproduccion$/
// Los partos de una vaca (GET y POST) o la anulación de uno
const PARTOS =
  /^\/api\/explotaciones\/[^/]+\/(?:animales\/([^/]+)\/partos|partos\/([^/]+)\/anulacion)$/
const REPRODUCCION = /^\/api\/explotaciones\/[^/]+\/reproduccion(?:\/([^/]+)\/anulacion)?$/
const TRATAMIENTOS = /^\/api\/explotaciones\/[^/]+\/tratamientos(?:\/([^/]+)\/anulacion)?$/

// Los pastoreos de una finca, la entrada, un pastoreo o su salida
const PASTOREOS =
  /^\/api\/explotaciones\/[^/]+\/(?:fincas\/([^/]+)\/pastoreos|pastoreos(?:\/([^/]+)(\/salida)?)?)$/

// Los abonados y tratamientos de una finca, el registro o la anulación de uno
const APLICACIONES =
  /^\/api\/explotaciones\/[^/]+\/(?:fincas\/([^/]+)\/aplicaciones|aplicaciones(?:\/([^/]+)\/anulacion)?)$/

// Las labores de una finca, el registro o una labor
const LABORES = /^\/api\/explotaciones\/[^/]+\/(?:fincas\/([^/]+)\/labores|labores(?:\/([^/]+))?)$/
const FINCAS = /^\/api\/explotaciones\/[^/]+\/fincas(?:\/([^/]+))?(\/estado)?$/
// La maquinaria y las infraestructuras, una o su estado
const EQUIPOS = /^\/api\/explotaciones\/[^/]+\/equipos(?:\/([^/]+))?(\/estado)?$/
// Las tareas de mantenimiento, una, su estado de hecha o las personas a quien asignarlas
const TAREAS = /^\/api\/explotaciones\/([^/]+)\/tareas(?:\/([^/]+))?(\/hecha)?$/
// Los almacenes de comida, uno o su estado
// Las facturas, el siguiente número, una, su pago o su archivo
const FACTURAS =
  /^\/api\/explotaciones\/([^/]+)\/facturas(?:\/([^/]+))?(?:\/(pago|archivo|entradas-comida))?$/
// Las entradas de comida de todos los almacenes, con su factura (GH-36)
// Las ventas (GH-38), una o su factura
const VENTAS = /^\/api\/explotaciones\/([^/]+)\/ventas(?:\/([^/]+))?(\/factura)?$/

// Como el backend: el total repartido, por animal o por kg
const importesVenta = (v: VentaSimulada) => {
  const n = v.animales.length
  const total = Math.round(v.precio * 100)
  const centimos =
    v.modoPrecio === 'total'
      ? v.animales.map(
          (_, i) => Math.floor(total / n) + (i < total - Math.floor(total / n) * n ? 1 : 0),
        )
      : v.modoPrecio === 'por_animal'
        ? v.animales.map(() => total)
        : v.animales.map((a) => Math.round((a.kg ?? 0) * v.precio * 100))
  return centimos.map((c) => c / 100)
}

// Los otros ingresos y gastos (GH-37), uno, su anulación o su archivo
const APUNTES = /^\/api\/explotaciones\/([^/]+)\/apuntes(?:\/([^/]+))?(?:\/(anulacion|archivo))?$/
const ENTRADAS_COMIDA = /^\/api\/explotaciones\/([^/]+)\/entradas-comida$/

// La factura de una entrada de comida, si la tiene
const facturaDe = (estado: EstadoSimulado, movimientoId: string) => {
  const fa = estado.facturas.find((x) => x.movimientoIds?.includes(movimientoId))
  return fa ? { id: fa.id, numero: fa.numero, tercero: fa.tercero } : null
}

const entradaDe = (estado: EstadoSimulado, m: MovimientoSimulado) => {
  const a = estado.almacenes.find((x) => x.id === m.almacenId)
  return {
    id: m.id,
    fecha: m.fecha,
    cantidad: m.cantidad,
    origen: m.origen,
    observaciones: m.observaciones,
    almacen: { id: m.almacenId, nombre: a?.nombre ?? '', unidad: a?.unidad ?? 'kg' },
  }
}
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'
const ALMACENES = /^\/api\/explotaciones\/([^/]+)\/almacenes(?:\/([^/]+))?(\/estado)?$/
// Los movimientos de un almacén, el registro o uno
const MOVIMIENTOS = /^\/api\/explotaciones\/[^/]+\/almacenes\/([^/]+)\/movimientos(?:\/([^/]+))?$/

// Como movimientos_con_stock: cada movimiento en orden, con lo que cambió el stock y el que dejó. Un
// recuento fija el stock en lo contado.
function conStock(estado: EstadoSimulado, almacenId: string) {
  const orden = estado.movimientos
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.almacenId === almacenId)
    .sort((a, b) => a.m.fecha.localeCompare(b.m.fecha) || a.i - b.i)
  let stock = 0
  return orden.map(({ m }) => {
    const antes = stock
    stock =
      m.ajuste === 'recuento'
        ? m.cantidad
        : m.tipo === 'entrada'
          ? stock + m.cantidad
          : stock - m.cantidad
    const finca = estado.fincas.find((x) => x.id === m.fincaId)
    return {
      ...m,
      finca: finca ? { id: finca.id, nombre: finca.nombre } : null,
      diferencia: stock - antes,
      stock,
      creadoEn: '2026-10-01T10:00:00.000Z',
      modificadoEn: '2026-10-01T10:00:00.000Z',
    }
  })
}
const EN_PLATAFORMA = /^\/api\/plataforma\/explotaciones\/([^/]+)$/

// Sustituye fetch por la API simulada. Devuelve el mock, para comprobar las llamadas.
export function simularApi(estado: EstadoSimulado) {
  const mock = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const peticion =
      entrada instanceof Request
        ? entrada
        : new Request(new URL(String(entrada), 'http://localhost'), opciones)
    const ruta = new URL(peticion.url).pathname
    const metodo = peticion.method
    const sinRed = typeof estado.sinRed === 'function' ? estado.sinRed(ruta, metodo) : estado.sinRed
    if (sinRed) throw new TypeError('Failed to fetch')
    // Un archivo llega como formulario (GH-35)
    const formulario = peticion.headers.get('content-type')?.startsWith('multipart/form-data')
      ? await peticion.formData()
      : null
    const cuerpo =
      !formulario && ['POST', 'PUT', 'PATCH'].includes(metodo)
        ? await peticion.json().catch(() => ({}))
        : {}

    if (ruta === '/api/auth/get-session') {
      return json(estado.conSesion ? { user: estado.usuario, session: {} } : null)
    }
    if (ruta === '/api/auth/sign-in/username' || ruta === '/api/auth/sign-in/email') {
      const quien = cuerpo.username ?? cuerpo.email
      const coincide = quien === estado.usuario.username || quien === estado.usuario.email
      if (!coincide || cuerpo.password !== estado.contrasena) {
        return json({ code: 'INVALID_USERNAME_OR_PASSWORD', message: 'Invalid' }, 401)
      }
      estado.conSesion = true
      return json({ user: estado.usuario })
    }
    if (ruta === '/api/auth/sign-out') {
      estado.conSesion = false
      return json({ success: true })
    }
    if (ruta === '/api/auth/change-password') {
      if (cuerpo.currentPassword !== estado.contrasena) {
        return json({ code: 'INVALID_PASSWORD', message: 'Invalid' }, 400)
      }
      estado.contrasena = cuerpo.newPassword
      estado.usuario.debeCambiarContrasena = false
      return json({ token: null })
    }
    if (ruta === '/api/health') return json({ estado: 'ok', api: 'ok', baseDeDatos: 'ok' })

    if (!estado.conSesion) return errorApi(401, 'no_autenticado')

    if (ruta === '/api/explotaciones') {
      return json(
        estado.explotaciones
          .filter((e) => e.activa !== false)
          .map(({ id, nombre, rega, rol }) => ({ id, nombre, rega, rol })),
      )
    }
    const detalle = ruta.match(DETALLE)
    if (detalle) {
      const e = estado.explotaciones.find((x) => x.id === detalle[1])
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.activa === false) return errorApi(403, 'explotacion_desactivada')
      if (e.miembroDesactivado) return errorApi(403, 'miembro_desactivado')
      if (metodo === 'PATCH') {
        if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
        Object.assign(e, cuerpo)
      }
      return json({
        id: e.id,
        nombre: e.nombre,
        rega: e.rega,
        rol: e.rol,
        municipio: e.municipio ?? null,
        provincia: e.provincia ?? null,
        modulos: MODULOS[e.rol],
      })
    }

    const tratamiento = (t: TratamientoSimulado) => ({
      ...t,
      finSupresion: finSupresion(t),
      creadoEn: '2026-10-01T10:00:00.000Z',
      modificadoEn: '2026-10-01T10:00:00.000Z',
    })
    const resumenAnimal = (id: string | null) => {
      const x = estado.animales.find((y) => y.id === id)
      return x ? { id: x.id, crotal: x.crotal, nombre: x.nombre } : null
    }
    const evento = (e: EventoSimulado) => ({
      ...e,
      animal: resumenAnimal(e.animalId),
      padre: resumenAnimal(e.padreId),
      fechaPrevistaParto:
        e.tipo === 'cubricion' || e.tipo === 'inseminacion' ? masDias(e.fecha, 283) : null,
      creadoEn: '2026-10-01T10:00:00.000Z',
      modificadoEn: '2026-10-01T10:00:00.000Z',
    })
    const deReproduccion = ruta.match(REPRODUCCION_ANIMAL)
    if (deReproduccion) {
      const id = deReproduccion[1]
      const hijos = estado.animales.filter((x) => x.madreId === id).map((x) => x.id)
      return json(
        estado.eventos
          .filter((e) => e.animalId === id || (e.tipo === 'destete' && hijos.includes(e.animalId)))
          .sort((x, y) => y.fecha.localeCompare(x.fecha))
          .map(evento),
      )
    }
    if (ruta.endsWith('/labores/opciones')) {
      return json({
        personas: estado.miembros
          .filter((m) => m.activo)
          .map((m) => ({ id: m.usuarioId, nombre: m.nombre })),
        cultivos: [],
        labores: [],
      })
    }
    const deLabores = ruta.match(LABORES)
    if (deLabores) {
      const [, fincaId, laborId] = deLabores
      const sello = {
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      }
      const persona = (c: {
        realizadaPorId?: string | null
        realizadaPorTexto?: string | null
      }) => {
        const m = estado.miembros.find((x) => x.usuarioId === c.realizadaPorId)
        return m
          ? { id: m.usuarioId, nombre: m.nombre }
          : c.realizadaPorTexto
            ? { id: null, nombre: c.realizadaPorTexto }
            : null
      }
      const datosDe = (c: Record<string, unknown>) => ({
        tipo: c.tipo as LaborSimulada['tipo'],
        fecha: c.fecha as string,
        cultivo: (c.cultivo as string) || null,
        labor: (c.labor as string) || null,
        cantidad: (c.cantidad as number) ?? null,
        unidad: (c.unidad as LaborSimulada['unidad']) ?? null,
        realizadaPor: persona(c),
        observaciones: (c.observaciones as string) || null,
      })
      if (fincaId) {
        return json(
          estado.labores
            .filter((l) => l.fincaId === fincaId)
            .sort((x, y) => y.fecha.localeCompare(x.fecha))
            .map((l) => ({ ...l, ...sello })),
        )
      }
      if (!laborId && metodo === 'POST') {
        // Reenviadas con los ids del dispositivo (GH-32): las que ya se guardaron
        const ids = cuerpo.ids as string[] | undefined
        const ya = estado.labores.filter((x) => ids?.includes(x.id))
        if (ids?.length && ya.length === ids.length)
          return json(
            ya.map((l) => ({ ...l, ...sello })),
            201,
          )
        const creadas = (cuerpo.fincaIds as string[]).map((id, i) => {
          const f = estado.fincas.find((x) => x.id === id)
          const nueva: LaborSimulada = {
            id: ids?.[i] ?? `l${estado.labores.length + i + 1}`,
            fincaId: id,
            superficie: cuerpo.superficie ?? f?.parcelas.reduce((t, x) => t + x.superficie, 0) ?? 0,
            ...datosDe(cuerpo),
          }
          return nueva
        })
        estado.labores.push(...creadas)
        return json(
          creadas.map((l) => ({ ...l, ...sello })),
          201,
        )
      }
      const l = estado.labores.find((x) => x.id === laborId)
      if (!l) return errorApi(404, 'labor_no_encontrada')
      if (metodo === 'DELETE') estado.labores = estado.labores.filter((x) => x !== l)
      else Object.assign(l, { superficie: cuerpo.superficie, ...datosDe(cuerpo) })
      return json({ ...l, ...sello })
    }

    const dePastoreos = ruta.match(PASTOREOS)
    if (dePastoreos) {
      const [, fincaId, pastoreoId, salida] = dePastoreos
      const sello = {
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      }
      const enCurso = (id: string, excepto?: string) =>
        estado.pastoreos.some((p) => p.fincaId === id && !p.fechaSalida && p.id !== excepto)
      const ocupada = errorApi(409, 'pastoreo_en_curso')
      if (fincaId) {
        return json(
          estado.pastoreos
            .filter((p) => p.fincaId === fincaId)
            .sort(
              (x, y) =>
                Number(Boolean(x.fechaSalida)) - Number(Boolean(y.fechaSalida)) ||
                y.fechaEntrada.localeCompare(x.fechaEntrada),
            )
            .map((p) => ({ ...p, ...sello })),
        )
      }
      if (!pastoreoId && metodo === 'POST') {
        // Reenviado con el id del dispositivo (GH-32): el que ya se guardó
        const ya = estado.pastoreos.find((x) => cuerpo.id && x.id === cuerpo.id)
        if (ya) return json({ ...ya, ...sello }, 201)
        if (!cuerpo.fechaSalida && enCurso(cuerpo.fincaId)) return ocupada
        const nuevo: PastoreoSimulado = {
          id: (cuerpo.id as string | undefined) ?? `ps${estado.pastoreos.length + 1}`,
          fincaId: cuerpo.fincaId,
          fechaEntrada: cuerpo.fechaEntrada,
          fechaSalida: cuerpo.fechaSalida || null,
          animales: cuerpo.animales,
          observaciones: cuerpo.observaciones || null,
        }
        estado.pastoreos.push(nuevo)
        return json({ ...nuevo, ...sello }, 201)
      }
      const p = estado.pastoreos.find((x) => x.id === pastoreoId)
      if (!p) return errorApi(404, 'pastoreo_no_encontrado')
      if (salida) {
        if (p.fechaSalida && p.fechaSalida !== cuerpo.fechaSalida)
          return errorApi(409, 'ya_salieron')
        p.fechaSalida = cuerpo.fechaSalida
      } else if (metodo === 'DELETE') estado.pastoreos = estado.pastoreos.filter((x) => x !== p)
      else {
        if (!cuerpo.fechaSalida && enCurso(p.fincaId, p.id)) return ocupada
        Object.assign(p, {
          fechaEntrada: cuerpo.fechaEntrada,
          fechaSalida: cuerpo.fechaSalida || null,
          animales: cuerpo.animales,
          observaciones: cuerpo.observaciones || null,
        })
      }
      return json({ ...p, ...sello })
    }

    // Cartografía (GH-52): un recinto de Lalín, el de la referencia pedida
    if (ruta.endsWith('/cartografia/recinto')) {
      const q = new URL(peticion.url).searchParams
      const [provincia, municipio, agregado, zona, poligono, parcela, recinto] = (
        q.get('referencia') ?? '36:24:0:0:57:37:2'
      ).split(':')
      return json({
        provincia,
        municipio,
        agregado,
        zona,
        poligono,
        parcela,
        recinto,
        superficie: 1.2346,
        uso: 'PS',
        contorno: {
          type: 'Polygon',
          coordinates: [
            [
              [-8.096, 42.679],
              [-8.095, 42.679],
              [-8.095, 42.68],
              [-8.096, 42.679],
            ],
          ],
        },
        referenciaCatastral: '36024A05700037',
        nombreMunicipio: 'Lalín',
        nombreProvincia: 'Pontevedra',
      })
    }
    if (ruta.endsWith('/cartografia/catastro')) {
      const referencia = new URL(peticion.url).searchParams.get('referencia') ?? ''
      return json({
        referenciaCatastral: referencia.replace(/\s/g, '').toUpperCase(),
        superficie: 0.7295,
        contorno: null,
        nombreMunicipio: 'Lalín',
        nombreProvincia: 'Pontevedra',
      })
    }
    if (ruta.endsWith('/cartografia/municipio')) return json({ recuadro: null })
    if (ruta.endsWith('/fincas/contornos')) {
      return json(
        estado.fincas.flatMap((f) =>
          f.parcelas.flatMap((p) =>
            p.contorno ? [{ fincaId: f.id, parcelaId: p.id, contorno: p.contorno }] : [],
          ),
        ),
      )
    }
    if (ruta.endsWith('/aplicaciones/opciones')) {
      return json({
        personas: estado.miembros
          .filter((m) => m.activo)
          .map((m) => ({ id: m.usuarioId, nombre: m.nombre })),
        abonos: [],
        fitosanitarios: [],
        plagas: [],
        equipos: [],
      })
    }
    const deAplicaciones = ruta.match(APLICACIONES)
    if (deAplicaciones) {
      const [, fincaId, aplicacionId] = deAplicaciones
      const sello = {
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      }
      if (fincaId) {
        return json(
          estado.aplicaciones
            .filter((a) => a.fincaId === fincaId)
            .sort((x, y) => y.fecha.localeCompare(x.fecha))
            .map((a) => ({ ...a, ...sello })),
        )
      }
      if (!aplicacionId && metodo === 'POST') {
        const m = estado.miembros.find((x) => x.usuarioId === cuerpo.aplicadoPorId)
        const fito = cuerpo.tipo === 'fitosanitario'
        const dias = fito ? (cuerpo.diasSeguridad as number) : 0
        const ids = cuerpo.ids as string[] | undefined
        const ya = estado.aplicaciones.filter((x) => ids?.includes(x.id))
        if (ids?.length && ya.length === ids.length)
          return json(
            ya.map((a) => ({ ...a, ...sello })),
            201,
          )
        const creadas = (cuerpo.fincaIds as string[]).map((id, i) => {
          const f = estado.fincas.find((x) => x.id === id)
          const nueva: AplicacionSimulada = {
            id: ids?.[i] ?? `ap${estado.aplicaciones.length + i + 1}`,
            fincaId: id,
            tipo: cuerpo.tipo,
            fecha: cuerpo.fecha,
            producto: cuerpo.producto,
            tipoAbono: fito ? null : cuerpo.tipoAbono,
            dosis: cuerpo.dosis,
            unidadDosis: cuerpo.unidadDosis,
            superficie: cuerpo.superficie ?? f?.parcelas.reduce((t, x) => t + x.superficie, 0) ?? 0,
            aplicadoPor: m
              ? { id: m.usuarioId, nombre: m.nombre }
              : cuerpo.aplicadoPorTexto
                ? { id: null, nombre: cuerpo.aplicadoPorTexto }
                : null,
            lote: cuerpo.lote || null,
            plaga: fito ? cuerpo.plaga : null,
            diasSeguridad: dias,
            finSeguridad: new Date(Date.parse(`${cuerpo.fecha}T00:00:00Z`) + dias * 864e5)
              .toISOString()
              .slice(0, 10),
            ropo: (fito && cuerpo.ropo) || null,
            equipo: (fito && cuerpo.equipo) || null,
            observaciones: cuerpo.observaciones || null,
            anulacion: null,
          }
          return nueva
        })
        estado.aplicaciones.push(...creadas)
        return json(
          creadas.map((a) => ({ ...a, ...sello })),
          201,
        )
      }
      const a = estado.aplicaciones.find((x) => x.id === aplicacionId)
      if (!a) return errorApi(404, 'aplicacion_no_encontrada')
      a.anulacion = {
        en: '2026-10-02T10:00:00.000Z',
        por: estado.usuario.name,
        motivo: cuerpo.motivo,
      }
      return json({ ...a, ...sello })
    }

    if (ruta.startsWith('/api/explotaciones/') && ruta.endsWith('/fiscal')) {
      const e = estado.explotaciones.find((x) => ruta.includes(x.id))
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
      if (metodo === 'PUT')
        estado.fiscal = {
          regimen: cuerpo.regimen,
          compensacionReagp: cuerpo.compensacionReagp,
          tiposIva: [...new Set(cuerpo.tiposIva as number[])].sort((a, b) => b - a),
        }
      return json({
        ...(estado.fiscal ?? { regimen: 'reagp', compensacionReagp: 10.5, tiposIva: [21, 10, 4] }),
        configurado: Boolean(estado.fiscal),
        modificadoEn: estado.fiscal ? '2026-10-29T10:00:00.000Z' : null,
      })
    }

    const deVentas = ruta.match(VENTAS)
    if (deVentas) {
      const [, explotacionId, ventaId, conFactura] = deVentas
      const e = estado.explotaciones.find((x) => x.id === explotacionId)
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
      const completa = (v: VentaSimulada) => {
        const importes = importesVenta(v)
        const fa = estado.facturas.find((x) => x.id === v.facturaId)
        return {
          id: v.id,
          fecha: v.fecha,
          comprador: v.comprador,
          modoPrecio: v.modoPrecio,
          precio: v.precio,
          total: Math.round(importes.reduce((s, x) => s + x, 0) * 100) / 100,
          kg: v.animales.every((a) => a.kg !== null)
            ? v.animales.reduce((s, a) => s + (a.kg ?? 0), 0)
            : null,
          animales: v.animales.map((a, i) => {
            const animal = estado.animales.find((x) => x.id === a.animalId)
            return {
              id: a.animalId,
              crotal: animal?.crotal ?? null,
              nombre: animal?.nombre ?? null,
              kg: a.kg,
              importe: importes[i] ?? 0,
            }
          }),
          factura: fa
            ? {
                id: fa.id,
                numero: fa.numero,
                total: fa.lineas.reduce((s, l) => s + l.base + l.cuota, 0),
              }
            : null,
          observaciones: v.observaciones,
          creadoEn: '2026-10-01T10:00:00.000Z',
          modificadoEn: '2026-10-01T10:00:00.000Z',
        }
      }
      // Los animales vuelven a estar activos, o pasan a vendidos
      const soltar = (v: VentaSimulada) => {
        for (const a of v.animales) {
          const animal = estado.animales.find((x) => x.id === a.animalId)
          if (animal)
            Object.assign(animal, {
              estado: 'activo',
              tipoBaja: null,
              fechaBaja: null,
              causaBaja: null,
            })
        }
      }
      const vender = (v: VentaSimulada) => {
        for (const a of v.animales) {
          const animal = estado.animales.find((x) => x.id === a.animalId)
          if (animal)
            Object.assign(animal, {
              estado: 'vendido',
              tipoBaja: 'venta',
              fechaBaja: v.fecha,
              causaBaja: `Venta a ${v.comprador}`,
            })
        }
      }
      // Sin excepciones: ningún animal con la supresión en curso
      const enSupresion = () => {
        const detalles = (cuerpo.animales as { animalId: string }[]).flatMap((a, i) => {
          const hasta = estado.tratamientos
            .filter((t) => t.animalId === a.animalId && !t.anulacion)
            .map(finSupresion)
            .filter((f) => f > cuerpo.fecha)
            .sort()
            .at(-1)
          const animal = estado.animales.find((x) => x.id === a.animalId)
          return hasta
            ? [
                {
                  campo: `animales.${i}.animalId`,
                  mensaje: `${animal?.crotal} tiene la supresión hasta el ${hasta.split('-').reverse().join('/')}`,
                  hasta,
                },
              ]
            : []
        })
        return detalles.length > 0
          ? json(
              {
                error: {
                  codigo: 'supresion_en_curso',
                  mensaje: `No se puede vender: ${detalles.map((d) => d.mensaje).join('; ')}`,
                  detalles,
                },
              },
              409,
            )
          : null
      }
      const datosVenta = (id: string): VentaSimulada => ({
        id,
        fecha: cuerpo.fecha,
        comprador: cuerpo.comprador.trim(),
        modoPrecio: cuerpo.modoPrecio,
        precio: cuerpo.precio,
        animales: (cuerpo.animales as { animalId: string; kg?: number | null }[]).map((a) => ({
          animalId: a.animalId,
          kg: a.kg ?? null,
        })),
        facturaId: cuerpo.facturaId ?? null,
        observaciones: cuerpo.observaciones?.trim() || null,
      })
      if (!ventaId && metodo === 'GET') return json(estado.ventas.map(completa))
      if (!ventaId) {
        const bloqueo = enSupresion()
        if (bloqueo) return bloqueo
        const nueva = datosVenta(`ve${estado.ventas.length + 1}`)
        estado.ventas.push(nueva)
        vender(nueva)
        return json(completa(nueva), 201)
      }
      const v = estado.ventas.find((x) => x.id === ventaId)
      if (!v) return errorApi(404, 'venta_no_encontrada')
      if (conFactura) {
        v.facturaId = cuerpo.facturaId
        return json(completa(v))
      }
      if (metodo === 'GET') return json(completa(v))
      if (metodo === 'DELETE') {
        soltar(v)
        estado.ventas = estado.ventas.filter((x) => x !== v)
        return new Response(null, { status: 204 })
      }
      const bloqueo = enSupresion()
      if (bloqueo) return bloqueo
      soltar(v)
      Object.assign(v, datosVenta(v.id))
      vender(v)
      return json(completa(v))
    }

    const deApuntes = ruta.match(APUNTES)
    if (deApuntes) {
      const [, explotacionId, apunteId, accion] = deApuntes
      const e = estado.explotaciones.find((x) => x.id === explotacionId)
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
      const completo = (ap: ApunteSimulado) => ({
        ...ap,
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      })
      const datosApunte = () => ({
        tipo: cuerpo.tipo,
        categoria: cuerpo.categoria,
        fecha: cuerpo.fecha,
        concepto: cuerpo.concepto.trim(),
        importe: cuerpo.importe,
        observaciones: cuerpo.observaciones?.trim() || null,
      })
      if (!apunteId && metodo === 'GET') {
        const q = new URL(peticion.url).searchParams
        return json(
          estado.apuntes
            .filter((x) => !q.get('tipo') || x.tipo === q.get('tipo'))
            .filter((x) => !q.get('categoria') || x.categoria === q.get('categoria'))
            .filter((x) => q.get('estado') !== 'vigente' || !x.anulacion)
            .filter((x) => q.get('estado') !== 'anulado' || x.anulacion)
            .map(completo),
        )
      }
      if (!apunteId) {
        const nuevo: ApunteSimulado = {
          id: `ap${estado.apuntes.length + 1}`,
          archivo: null,
          anulacion: null,
          ...datosApunte(),
        }
        estado.apuntes.push(nuevo)
        return json(completo(nuevo), 201)
      }
      const ap = estado.apuntes.find((x) => x.id === apunteId)
      if (!ap) return errorApi(404, 'apunte_no_encontrado')
      if (metodo === 'GET' && !accion) return json(completo(ap))
      if (ap.anulacion) return errorApi(409, 'ya_anulado')
      if (accion === 'anulacion') {
        ap.anulacion = {
          en: '2026-10-29T10:00:00.000Z',
          por: estado.usuario.name,
          motivo: cuerpo.motivo,
        }
        return json(completo(ap))
      }
      if (accion === 'archivo') {
        if (metodo === 'DELETE') ap.archivo = null
        const archivo = formulario?.get('archivo')
        if (metodo === 'PUT' && archivo instanceof File)
          ap.archivo = { nombre: archivo.name, tipo: archivo.type, tamano: archivo.size }
        return json(completo(ap))
      }
      Object.assign(ap, datosApunte())
      return json(completo(ap))
    }

    const deEntradas = ruta.match(ENTRADAS_COMIDA)
    if (deEntradas) {
      const e = estado.explotaciones.find((x) => x.id === deEntradas[1])
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
      const q = new URL(peticion.url).searchParams
      return json(
        estado.movimientos
          .filter((m) => m.tipo === 'entrada')
          .filter((m) => !q.get('origen') || m.origen === q.get('origen'))
          .map((m) => ({ ...entradaDe(estado, m), factura: facturaDe(estado, m.id) })),
      )
    }

    const deFacturas = ruta.match(FACTURAS)
    if (deFacturas) {
      const [, explotacionId, facturaId, accion] = deFacturas
      const e = estado.explotaciones.find((x) => x.id === explotacionId)
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
      const completa = (fa: FacturaSimulada) => {
        const base = fa.lineas.reduce((s, l) => s + l.base, 0)
        const cuota = fa.lineas.reduce((s, l) => s + l.cuota, 0)
        return {
          ...fa,
          baseImponible: base,
          cuota,
          total: Math.round((base + cuota) * 100) / 100,
          animales: estado.animales
            .filter((a) => fa.animalIds.includes(a.id))
            .map((a) => ({ id: a.id, crotal: a.crotal, nombre: a.nombre })),
          entradasComida: estado.movimientos
            .filter((m) => fa.movimientoIds?.includes(m.id))
            .map((m) => entradaDe(estado, m)),
          ventaId: estado.ventas.find((v) => v.facturaId === fa.id)?.id ?? null,
          creadoEn: '2026-10-01T10:00:00.000Z',
          modificadoEn: '2026-10-01T10:00:00.000Z',
        }
      }
      const q = new URL(peticion.url).searchParams
      if (facturaId === 'siguiente-numero') {
        const anio = (q.get('fecha') ?? '2026').slice(0, 4)
        const ultimo = Math.max(
          0,
          ...estado.facturas
            .filter((x) => x.tipo === 'emitida' && x.numero.startsWith(`${anio}-`))
            .map((x) => Number(x.numero.slice(5))),
        )
        return json({ numero: `${anio}-${String(ultimo + 1).padStart(4, '0')}` })
      }
      if (!facturaId && metodo === 'GET') {
        const texto = q.get('q')?.toLowerCase()
        return json(
          estado.facturas
            .filter((x) => !q.get('tipo') || x.tipo === q.get('tipo'))
            .filter((x) => q.get('estado') !== 'pendiente' || !x.pagadaEn)
            .filter((x) => q.get('estado') !== 'pagada' || x.pagadaEn)
            .filter(
              (x) =>
                !texto || [x.tercero, x.numero, x.nif].some((t) => t.toLowerCase().includes(texto)),
            )
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map(completa),
        )
      }
      const datosFactura = () => {
        const nif = String(cuerpo.nif)
          .toUpperCase()
          .replace(/[\s.-]/g, '')
        // Solo se comprueba la letra de los DNI
        const dni = /^\d{8}[A-Z]$/.test(nif)
        if (!cuerpo.nifExtranjero && dni && LETRAS_DNI[Number(nif.slice(0, 8)) % 23] !== nif[8])
          return null
        return {
          tipo: cuerpo.tipo,
          numero: cuerpo.numero.trim(),
          fecha: cuerpo.fecha,
          tercero: cuerpo.tercero.trim(),
          nif,
          nifExtranjero: cuerpo.nifExtranjero ?? false,
          concepto: cuerpo.concepto.trim(),
          impuesto: cuerpo.impuesto ?? 'iva',
          lineas: cuerpo.lineas,
          pagadaEn: cuerpo.pagadaEn ?? null,
          animalIds: cuerpo.animalIds ?? [],
        }
      }
      const nifNoValido = () =>
        errorApi(400, 'validacion', [{ campo: 'nif', mensaje: 'El NIF no es válido' }])
      if (!facturaId) {
        const datos = datosFactura()
        if (!datos) return nifNoValido()
        if (
          datos.tipo === 'emitida' &&
          estado.facturas.some((x) => x.tipo === 'emitida' && x.numero === datos.numero)
        )
          return errorApi(409, 'numero_en_uso', [
            { campo: 'numero', mensaje: 'Ya hay una factura emitida con este número' },
          ])
        const nueva: FacturaSimulada = {
          id: `fa${estado.facturas.length + 1}`,
          archivo: null,
          ...datos,
        }
        estado.facturas.push(nueva)
        return json(completa(nueva), 201)
      }
      const fa = estado.facturas.find((x) => x.id === facturaId)
      if (!fa) return errorApi(404, 'factura_no_encontrada')
      if (accion === 'entradas-comida') {
        fa.movimientoIds = cuerpo.movimientoIds
        return json(completa(fa))
      }
      if (accion === 'pago') {
        fa.pagadaEn = cuerpo.pagadaEn
        return json(completa(fa))
      }
      if (accion === 'archivo') {
        if (metodo === 'DELETE') fa.archivo = null
        if (metodo === 'PUT') {
          const archivo = formulario?.get('archivo')
          if (!(archivo instanceof File)) return errorApi(400, 'validacion')
          fa.archivo = { nombre: archivo.name, tipo: archivo.type, tamano: archivo.size }
        }
        return json(completa(fa))
      }
      if (metodo === 'GET') return json(completa(fa))
      if (metodo === 'DELETE') {
        estado.facturas = estado.facturas.filter((x) => x !== fa)
        return new Response(null, { status: 204 })
      }
      const datos = datosFactura()
      if (!datos) return nifNoValido()
      Object.assign(fa, datos)
      return json(completa(fa))
    }

    const deTareas = ruta.match(TAREAS)
    if (deTareas) {
      const [, explotacionId, tareaId, hecha] = deTareas
      const e = estado.explotaciones.find((x) => x.id === explotacionId)
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      const persona = (id: string | null) => {
        const m = estado.miembros.find((x) => x.usuarioId === id)
        return id ? { id, nombre: m?.nombre ?? id } : null
      }
      const completa = (t: TareaSimulada) => {
        const equipo = estado.equipos.find((x) => x.id === t.equipoId)
        return {
          id: t.id,
          titulo: t.titulo,
          equipo: equipo ? { id: equipo.id, nombre: equipo.nombre } : null,
          descripcion: t.descripcion,
          fechaLimite: t.fechaLimite,
          prioridad: t.prioridad,
          asignadaA: persona(t.asignadaAId),
          hecha: t.hecha ? { en: t.hecha.en, por: persona(t.hecha.porId) } : null,
          creadoEn: '2026-10-01T10:00:00.000Z',
          modificadoEn: '2026-10-01T10:00:00.000Z',
        }
      }
      if (tareaId === 'personas')
        return json(estado.miembros.map((m) => ({ id: m.usuarioId, nombre: m.nombre })))
      const q = new URL(peticion.url).searchParams
      if (!tareaId && metodo === 'GET')
        return json(
          estado.tareas
            .filter((t) => q.get('estado') !== 'pendiente' || !t.hecha)
            .filter((t) => q.get('estado') !== 'hecha' || t.hecha)
            .filter(
              (t) =>
                q.get('para') !== 'mi' ||
                t.asignadaAId === null ||
                t.asignadaAId === estado.usuario.id,
            )
            .filter((t) => !q.get('equipoId') || t.equipoId === q.get('equipoId'))
            .map(completa),
        )
      // Solo el administrador asigna
      const asigna = (antes: string | null) =>
        (cuerpo.asignadaAId ?? null) !== antes && e.rol !== 'administrador'
      const datosTarea = () => ({
        titulo: (cuerpo.titulo as string).trim(),
        equipoId: cuerpo.equipoId ?? null,
        descripcion: (cuerpo.descripcion as string | undefined)?.trim() || null,
        fechaLimite: cuerpo.fechaLimite ?? null,
        prioridad: cuerpo.prioridad ?? 'normal',
        asignadaAId: cuerpo.asignadaAId ?? null,
      })
      if (!tareaId) {
        if (asigna(null)) return errorApi(403, 'sin_permiso')
        const nueva: TareaSimulada = {
          id: `ta${estado.tareas.length + 1}`,
          hecha: null,
          ...datosTarea(),
        }
        estado.tareas.push(nueva)
        return json(completa(nueva), 201)
      }
      const t = estado.tareas.find((x) => x.id === tareaId)
      if (!t) return errorApi(404, 'tarea_no_encontrada')
      if (hecha) {
        t.hecha = cuerpo.hecha ? { en: '2026-10-29T10:00:00.000Z', porId: estado.usuario.id } : null
        return json(completa(t))
      }
      if (metodo === 'DELETE') {
        estado.tareas = estado.tareas.filter((x) => x !== t)
        return json(completa(t))
      }
      if (asigna(t.asignadaAId)) return errorApi(403, 'sin_permiso')
      Object.assign(t, datosTarea())
      return json(completa(t))
    }

    const deEquipos = ruta.match(EQUIPOS)
    if (deEquipos) {
      const [, equipoId, estadoEquipo] = deEquipos
      const completo = (e: EquipoSimulado) => ({
        ...e,
        tareasPendientes: estado.tareas.filter((t) => t.equipoId === e.id && !t.hecha).length,
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      })
      const q = new URL(peticion.url).searchParams
      if (!equipoId && metodo === 'GET')
        return json(
          estado.equipos
            .filter((e) => !q.get('tipo') || e.tipo === q.get('tipo'))
            .filter((e) => !q.get('activo') || String(e.activo) === q.get('activo'))
            .filter(
              (e) =>
                !q.get('q') ||
                `${e.nombre} ${e.descripcion ?? ''}`
                  .toLowerCase()
                  .includes((q.get('q') ?? '').toLowerCase()),
            )
            .map(completo)
            .sort(
              (x, y) => y.tareasPendientes - x.tareasPendientes || x.nombre.localeCompare(y.nombre),
            ),
        )
      const repetido = (nombre: string, id?: string) =>
        estado.equipos.some(
          (e) => e.nombre.toLowerCase() === nombre.trim().toLowerCase() && e.id !== id,
        )
      const nombreEnUso = () =>
        errorApi(409, 'nombre_en_uso', [
          { campo: 'nombre', mensaje: 'Ya hay un equipo con este nombre' },
        ])
      const datosEquipo = () => ({
        nombre: (cuerpo.nombre as string).trim(),
        tipo: cuerpo.tipo,
        descripcion: (cuerpo.descripcion as string | undefined)?.trim() || null,
      })
      if (!equipoId) {
        if (repetido(cuerpo.nombre)) return nombreEnUso()
        const nuevo: EquipoSimulado = {
          id: `eq${estado.equipos.length + 1}`,
          activo: true,
          ...datosEquipo(),
        }
        estado.equipos.push(nuevo)
        return json(completo(nuevo), 201)
      }
      const e = estado.equipos.find((x) => x.id === equipoId)
      if (!e) return errorApi(404, 'equipo_no_encontrado')
      if (metodo === 'GET') return json(completo(e))
      if (estadoEquipo) e.activo = cuerpo.activo
      else {
        if (repetido(cuerpo.nombre, e.id)) return nombreEnUso()
        Object.assign(e, datosEquipo())
      }
      return json(completo(e))
    }

    const deMovimientos = ruta.match(MOVIMIENTOS)
    if (deMovimientos) {
      const [, almacenId = '', movimientoId] = deMovimientos
      const a = estado.almacenes.find((x) => x.id === almacenId)
      if (!a) return errorApi(404, 'almacen_no_encontrado')
      const ver = (id: string) => conStock(estado, almacenId).find((m) => m.id === id)
      const datosMovimiento = () => ({
        tipo: cuerpo.tipo,
        fecha: cuerpo.fecha,
        cantidad: cuerpo.cantidad,
        origen: cuerpo.origen ?? null,
        fincaId: cuerpo.fincaId ?? null,
        ajuste: cuerpo.ajuste ?? null,
        motivo: cuerpo.motivo || null,
        observaciones: cuerpo.observaciones || null,
      })
      if (!movimientoId && metodo === 'GET') {
        const q = new URL(peticion.url).searchParams
        // Las facturas (GH-36), solo para el administrador
        const verFacturas =
          estado.explotaciones.find((x) => ruta.includes(x.id))?.rol === 'administrador'
        if (q.get('factura') && !verFacturas) return errorApi(403, 'sin_permiso')
        return json(
          conStock(estado, almacenId)
            .filter((m) => !q.get('tipo') || m.tipo === q.get('tipo'))
            .filter((m) => !q.get('origen') || m.origen === q.get('origen'))
            .filter((m) => q.get('factura') !== 'con' || facturaDe(estado, m.id))
            .filter((m) => q.get('factura') !== 'sin' || !facturaDe(estado, m.id))
            .filter((m) => !q.get('desde') || m.fecha >= (q.get('desde') ?? ''))
            .filter((m) => !q.get('hasta') || m.fecha <= (q.get('hasta') ?? ''))
            .map((m) => (verFacturas ? { ...m, factura: facturaDe(estado, m.id) } : m))
            .reverse(),
        )
      }
      if (!movimientoId) {
        if (!a.activo) return errorApi(409, 'almacen_desactivado')
        const nuevo: MovimientoSimulado = {
          id: `mv${estado.movimientos.length + 1}`,
          almacenId,
          ...datosMovimiento(),
        }
        estado.movimientos.push(nuevo)
        return json(ver(nuevo.id), 201)
      }
      const m = estado.movimientos.find((x) => x.id === movimientoId && x.almacenId === almacenId)
      if (!m) return errorApi(404, 'movimiento_no_encontrado')
      if (metodo === 'DELETE') {
        const borrado = ver(m.id)
        estado.movimientos = estado.movimientos.filter((x) => x !== m)
        return json(borrado)
      }
      Object.assign(m, datosMovimiento())
      return json(ver(m.id))
    }

    const deAlmacenes = ruta.match(ALMACENES)
    if (deAlmacenes) {
      const [, explotacionId, almacenId, estadoAlmacen] = deAlmacenes
      const e = estado.explotaciones.find((x) => x.id === explotacionId)
      if (!e) return errorApi(404, 'explotacion_no_encontrada')
      const completo = (a: AlmacenSimulado) => ({
        ...a,
        stock: conStock(estado, a.id).at(-1)?.stock ?? 0,
        conMovimientos: estado.movimientos.some((m) => m.almacenId === a.id),
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      })
      if (metodo === 'GET' && !almacenId) return json(estado.almacenes.map(completo))
      if (metodo === 'GET') {
        const a = estado.almacenes.find((x) => x.id === almacenId)
        return a ? json(completo(a)) : errorApi(404, 'almacen_no_encontrado')
      }
      if (e.rol !== 'administrador') return errorApi(403, 'sin_permiso')
      const repetido = (nombre: string, id?: string) =>
        estado.almacenes.some(
          (a) => a.nombre.toLowerCase() === nombre.trim().toLowerCase() && a.id !== id,
        )
      const nombreEnUso = () =>
        errorApi(409, 'nombre_en_uso', [
          { campo: 'nombre', mensaje: 'Ya hay un almacén con este nombre' },
        ])
      if (!almacenId) {
        if (repetido(cuerpo.nombre)) return nombreEnUso()
        const nuevo: AlmacenSimulado = {
          id: `al${estado.almacenes.length + 1}`,
          nombre: cuerpo.nombre.trim(),
          tipo: cuerpo.tipo,
          unidad: cuerpo.unidad,
          activo: true,
        }
        estado.almacenes.push(nuevo)
        return json(completo(nuevo), 201)
      }
      const a = estado.almacenes.find((x) => x.id === almacenId)
      if (!a) return errorApi(404, 'almacen_no_encontrado')
      if (estadoAlmacen) a.activo = cuerpo.activo
      else {
        if (repetido(cuerpo.nombre, a.id)) return nombreEnUso()
        if (cuerpo.unidad !== a.unidad && estado.movimientos.some((m) => m.almacenId === a.id))
          return errorApi(409, 'unidad_con_movimientos', [
            { campo: 'unidad', mensaje: 'El almacén ya tiene movimientos: su unidad no cambia' },
          ])
        Object.assign(a, { nombre: cuerpo.nombre.trim(), tipo: cuerpo.tipo, unidad: cuerpo.unidad })
      }
      return json(completo(a))
    }

    const deFincas = ruta.match(FINCAS)
    if (deFincas) {
      const [, fincaId, estadoFinca] = deFincas
      const hoy = new Date().toISOString().slice(0, 10)
      const finSeguridad = (f: FincaSimulada) =>
        estado.aplicaciones
          .filter((a) => a.fincaId === f.id && !a.anulacion && a.finSeguridad > hoy)
          .map((a) => a.finSeguridad)
          .sort()
          .at(-1) ?? null
      const pastoreoEnCurso = (f: FincaSimulada) => {
        const p = estado.pastoreos.find((x) => x.fincaId === f.id && !x.fechaSalida)
        return p ? { id: p.id, desde: p.fechaEntrada, animales: p.animales } : null
      }
      const ficha = (f: FincaSimulada) => ({
        ...f,
        // Las parcelas, con los datos del mapa (GH-52) aunque no los tengan
        parcelas: f.parcelas.map((p) => ({
          agregado: p.recinto ? '0' : null,
          zona: p.recinto ? '0' : null,
          uso: null,
          contorno: null,
          ...p,
        })),
        superficie: f.parcelas.reduce((t, x) => t + x.superficie, 0),
        numeroParcelas: f.parcelas.length,
        finSeguridad: finSeguridad(f),
        pastoreo: pastoreoEnCurso(f),
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      })
      const conIds = (ps: (Omit<ParcelaSimulada, 'id'> & { id?: string })[]) =>
        ps.map((x, i) => ({
          provincia: x.provincia || null,
          municipio: x.municipio || null,
          poligono: x.poligono || null,
          parcela: x.parcela || null,
          recinto: x.recinto || null,
          agregado: x.recinto ? x.agregado || '0' : null,
          zona: x.recinto ? x.zona || '0' : null,
          uso: x.uso ?? null,
          contorno: x.contorno ?? null,
          referenciaCatastral: x.referenciaCatastral || null,
          superficie: x.superficie,
          id: x.id ?? `pc${Date.now()}${i}`,
        }))
      const repetida = (nombre: string, id?: string) =>
        estado.fincas.some((f) => f.nombre.toLowerCase() === nombre.toLowerCase() && f.id !== id)
      if (!fincaId && metodo === 'GET') {
        const q = new URL(peticion.url).searchParams
        const texto = (q.get('q') ?? '').toLowerCase()
        return json(
          estado.fincas
            .filter((f) => !q.get('activa') || String(f.activa) === q.get('activa'))
            .filter((f) => !q.get('seguridad') || finSeguridad(f))
            .filter((f) => !q.get('pastoreo') || pastoreoEnCurso(f))
            .filter((f) => !texto || `${f.nombre} ${f.municipio}`.toLowerCase().includes(texto))
            .map(ficha),
        )
      }
      if (!fincaId && metodo === 'POST') {
        if (repetida(cuerpo.nombre)) {
          return errorApi(409, 'nombre_en_uso', [
            { campo: 'nombre', mensaje: 'Ya hay una finca con este nombre' },
          ])
        }
        const nueva: FincaSimulada = {
          id: `f${estado.fincas.length + 1}`,
          nombre: cuerpo.nombre,
          municipio: cuerpo.municipio || null,
          provincia: cuerpo.provincia || null,
          regimen: cuerpo.regimen,
          observaciones: cuerpo.observaciones || null,
          activa: true,
          parcelas: conIds(cuerpo.parcelas),
        }
        estado.fincas.push(nueva)
        return json(ficha(nueva), 201)
      }
      const f = estado.fincas.find((x) => x.id === fincaId)
      if (!f) return errorApi(404, 'finca_no_encontrada')
      if (estadoFinca) f.activa = cuerpo.activa
      else if (metodo === 'PUT') {
        if (repetida(cuerpo.nombre, f.id)) {
          return errorApi(409, 'nombre_en_uso', [
            { campo: 'nombre', mensaje: 'Ya hay una finca con este nombre' },
          ])
        }
        Object.assign(f, {
          nombre: cuerpo.nombre,
          municipio: cuerpo.municipio || null,
          provincia: cuerpo.provincia || null,
          regimen: cuerpo.regimen,
          observaciones: cuerpo.observaciones || null,
          parcelas: conIds(cuerpo.parcelas),
        })
      }
      return json(ficha(f))
    }

    const deParto = ruta.match(PARTOS)
    if (deParto) {
      const [, madreId, partoId] = deParto
      const parto = (x: PartoSimulado) => ({
        ...x,
        padre: resumenAnimal(x.padreId),
        terneros: estado.animales
          .filter((t) => t.partoId === x.id)
          .map((t) => ({
            id: t.id,
            crotal: t.crotal,
            nombre: t.nombre,
            sexo: t.sexo,
            estado: t.estado,
          })),
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      })
      if (partoId) {
        const x = estado.partos.find((y) => y.id === partoId)
        if (!x) return errorApi(404, 'parto_no_encontrado')
        estado.animales = estado.animales.filter((t) => t.partoId !== x.id)
        x.anulacion = {
          en: '2026-10-20T10:00:00.000Z',
          por: estado.usuario.name,
          motivo: cuerpo.motivo,
        }
        return json(parto(x))
      }
      if (metodo === 'GET') {
        return json(
          estado.partos
            .filter((x) => x.madreId === madreId)
            .sort((x, y) => y.fecha.localeCompare(x.fecha))
            .map(parto),
        )
      }
      // Reenviado con el id del dispositivo (GH-33): el que ya se guardó
      const ya = estado.partos.find((x) => cuerpo.id && x.id === cuerpo.id)
      if (ya) return json(parto(ya), 201)
      const terneros = cuerpo.terneros as {
        id?: string
        crotal?: string
        sexo: 'hembra' | 'macho'
        estado: string
        raza: string
        peso?: number | null
      }[]
      const repetido = terneros.findIndex(
        (t) => t.crotal && estado.animales.some((x) => x.crotal === t.crotal),
      )
      if (repetido >= 0) {
        return errorApi(409, 'crotal_en_uso', [
          { campo: `terneros.${repetido}.crotal`, mensaje: 'Ya hay un animal con este crotal' },
        ])
      }
      // El padre, como en el backend: el de la última cubrición o inseminación de la madre
      const cubricion = estado.eventos
        .filter(
          (e) =>
            e.animalId === madreId &&
            !e.anulacion &&
            (e.tipo === 'cubricion' || e.tipo === 'inseminacion'),
        )
        .sort((x, y) => x.fecha.localeCompare(y.fecha))
        .at(-1)
      const nuevo: PartoSimulado = {
        id: (cuerpo.id as string | undefined) ?? `pa${estado.partos.length + 1}`,
        madreId: madreId ?? '',
        fecha: cuerpo.fecha,
        tipo: cuerpo.tipo ?? 'normal',
        padreId: cubricion ? cubricion.padreId : (cuerpo.padreId ?? null),
        padreTexto: cubricion ? cubricion.padreTexto : (cuerpo.padreTexto ?? null),
        observaciones: cuerpo.observaciones || null,
        anulacion: null,
      }
      estado.partos.push(nuevo)
      for (const t of terneros) {
        const muerto = t.estado === 'muerto'
        const ternero = animalSimulado({
          id: t.id ?? `a${estado.animales.length + 1}`,
          crotal: t.crotal || null,
          raza: t.raza,
          sexo: t.sexo,
          fechaNacimiento: cuerpo.fecha,
          madreId: madreId ?? null,
          padreId: nuevo.padreId,
          padreTexto: nuevo.padreTexto,
          partoId: nuevo.id,
          ...(muerto
            ? {
                estado: 'muerto',
                tipoBaja: 'muerte',
                fechaBaja: cuerpo.fecha,
                causaBaja: 'Nacido muerto',
              }
            : {}),
        })
        estado.animales.push(ternero)
        if (t.peso != null) {
          estado.pesadas.push({
            id: `p${estado.pesadas.length + 1}`,
            animalId: ternero.id,
            fecha: cuerpo.fecha,
            kg: t.peso,
            momento: 'nacimiento',
          })
        }
      }
      return json(parto(nuevo), 201)
    }
    const enReproduccion = ruta.match(REPRODUCCION)
    if (enReproduccion) {
      const [, eventoId] = enReproduccion
      if (eventoId) {
        const e = estado.eventos.find((x) => x.id === eventoId)
        if (!e) return errorApi(404, 'evento_no_encontrado')
        e.anulacion = {
          en: '2026-10-20T10:00:00.000Z',
          por: estado.usuario.name,
          motivo: cuerpo.motivo,
        }
        return json(evento(e))
      }
      const ids = cuerpo.animalIds as string[]
      const machos = estado.animales.filter((x) => ids.includes(x.id) && x.sexo === 'macho')
      if (cuerpo.tipo !== 'destete' && machos.length > 0) {
        return errorApi(400, 'validacion', [
          {
            campo: 'animalIds',
            mensaje: `Solo las hembras; no lo son ${machos.map((x) => x.crotal).join(', ')}`,
          },
        ])
      }
      if (
        (cuerpo.tipo === 'cubricion' || cuerpo.tipo === 'inseminacion') &&
        !cuerpo.padreId &&
        !cuerpo.padreTexto
      ) {
        return errorApi(400, 'validacion', [{ campo: 'padreId', mensaje: 'Indica el toro' }])
      }
      const creados = ids.map((animalId, i) => ({
        id: `e${estado.eventos.length + i + 1}`,
        animalId,
        tipo: cuerpo.tipo,
        fecha: cuerpo.fecha,
        padreId: cuerpo.padreId ?? null,
        padreTexto: cuerpo.padreTexto ?? null,
        metodo: cuerpo.metodo ?? null,
        resultado: cuerpo.resultado ?? null,
        observaciones: cuerpo.observaciones || null,
        anulacion: null,
      }))
      estado.eventos.push(...creados)
      if (cuerpo.tipo === 'destete' && cuerpo.pesoDestete != null) {
        estado.pesadas.push({
          id: `p${estado.pesadas.length + 1}`,
          animalId: ids[0] ?? '',
          fecha: cuerpo.fecha,
          kg: cuerpo.pesoDestete,
          momento: 'destete',
        })
      }
      return json(creados.map(evento), 201)
    }

    if (ruta.endsWith('/tratamientos/opciones')) {
      return json({
        personas: estado.miembros
          .filter((m) => m.activo)
          .map((m) => ({ id: m.usuarioId, nombre: m.nombre })),
        productos: [...new Set(estado.tratamientos.map((t) => t.producto))].sort(),
      })
    }
    const deUnAnimal = ruta.match(TRATAMIENTOS_ANIMAL)
    if (deUnAnimal) {
      return json(
        estado.tratamientos
          .filter((t) => t.animalId === deUnAnimal[1])
          .sort((x, y) => y.fecha.localeCompare(x.fecha))
          .map(tratamiento),
      )
    }
    const deTratamientos = ruta.match(TRATAMIENTOS)
    if (deTratamientos) {
      const [, tratamientoId] = deTratamientos
      if (tratamientoId) {
        const t = estado.tratamientos.find((x) => x.id === tratamientoId)
        if (!t) return errorApi(404, 'tratamiento_no_encontrado')
        if (t.anulacion) return errorApi(409, 'ya_anulado')
        t.anulacion = {
          en: '2026-10-20T10:00:00.000Z',
          por: estado.usuario.name,
          motivo: cuerpo.motivo,
        }
        return json(tratamiento(t))
      }
      if (!cuerpo.producto?.trim()) {
        return errorApi(400, 'validacion', [
          { campo: 'producto', mensaje: 'Indica el producto o medicamento' },
        ])
      }
      // Reenviados con los ids del dispositivo (GH-33): los que ya se guardaron
      const ids = cuerpo.ids as string[] | undefined
      const ya = estado.tratamientos.filter((x) => ids?.includes(x.id))
      if (ids?.length && ya.length === ids.length) return json(ya.map(tratamiento), 201)
      const persona = estado.miembros.find((m) => m.usuarioId === cuerpo.aplicadoPorId)
      const creados = (cuerpo.animalIds as string[]).map((animalId, i) => {
        const t: TratamientoSimulado = {
          id: ids?.[i] ?? `t${estado.tratamientos.length + i + 1}`,
          animalId,
          fecha: cuerpo.fecha,
          producto: cuerpo.producto,
          dosis: cuerpo.dosis || null,
          via: cuerpo.via ?? null,
          motivo: cuerpo.motivo,
          diagnostico: cuerpo.diagnostico || null,
          aplicadoPor: persona
            ? { id: persona.usuarioId, nombre: persona.nombre }
            : cuerpo.aplicadoPorTexto
              ? { id: null, nombre: cuerpo.aplicadoPorTexto }
              : null,
          lote: cuerpo.lote || null,
          diasSupresion: cuerpo.diasSupresion,
          observaciones: cuerpo.observaciones || null,
          anulacion: null,
        }
        return t
      })
      estado.tratamientos.push(...creados)
      return json(creados.map(tratamiento), 201)
    }

    const dePesos = ruta.match(PESOS)
    if (dePesos) {
      const [, animalId = '', pesoId] = dePesos
      if (!estado.animales.some((x) => x.id === animalId)) {
        return errorApi(404, 'animal_no_encontrado')
      }
      const sello = {
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-01T10:00:00.000Z',
      }
      if (metodo === 'GET') {
        return json(
          estado.pesadas
            .filter((p) => p.animalId === animalId)
            .sort((x, y) => x.fecha.localeCompare(y.fecha))
            .map((p) => ({ ...p, ...sello })),
        )
      }
      const repetido =
        cuerpo.momento !== 'otro' &&
        estado.pesadas.some(
          (p) =>
            p.animalId === animalId &&
            p.momento === cuerpo.momento &&
            p.id !== (pesoId ?? cuerpo.id),
        )
      if (metodo !== 'DELETE' && repetido) {
        return errorApi(409, 'momento_repetido', [
          { campo: 'momento', mensaje: 'El animal ya tiene esa pesada' },
        ])
      }
      // Reenviada con el id del dispositivo (GH-31): la que ya se guardó
      const ya = estado.pesadas.find((x) => metodo === 'POST' && cuerpo.id && x.id === cuerpo.id)
      if (ya) return json({ ...ya, ...sello }, 201)
      if (metodo === 'POST') {
        const nueva = {
          id: (cuerpo.id as string | undefined) ?? `p${estado.pesadas.length + 1}`,
          animalId,
          fecha: cuerpo.fecha as string,
          kg: cuerpo.kg as number,
          momento: (cuerpo.momento ?? 'otro') as PesadaSimulada['momento'],
        }
        estado.pesadas.push(nueva)
        return json({ ...nueva, ...sello }, 201)
      }
      const p = estado.pesadas.find((x) => x.id === pesoId && x.animalId === animalId)
      if (!p) return errorApi(404, 'pesada_no_encontrada')
      if (metodo === 'DELETE') {
        estado.pesadas = estado.pesadas.filter((x) => x !== p)
      } else {
        Object.assign(p, { fecha: cuerpo.fecha, kg: cuerpo.kg, momento: cuerpo.momento })
      }
      return json({ ...p, ...sello })
    }

    const deReposicion = ruta.match(REPOSICION)
    if (deReposicion) {
      const a = estado.animales.find((x) => x.id === deReposicion[1])
      if (!a) return errorApi(404, 'animal_no_encontrado')
      if (!cuerpo.apta && !cuerpo.motivo?.trim())
        return errorApi(400, 'validacion', [{ campo: 'motivo', mensaje: 'Indica el motivo' }])
      a.noAptaReposicion = cuerpo.apta
        ? null
        : {
            desde: cuerpo.fecha ?? '2026-10-29',
            motivo: cuerpo.motivo.trim(),
            alcance: cuerpo.alcance ?? 'hijas',
          }
      return json({
        ...a,
        noAptaReposicion: a.noAptaReposicion ?? null,
        madreNoAptaReposicion: null,
        madre: null,
        padre: null,
        hijos: [],
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-02T10:00:00.000Z',
      })
    }

    const deBaja = ruta.match(BAJA)
    if (deBaja) {
      const a = estado.animales.find((x) => x.id === deBaja[1])
      if (!a) return errorApi(404, 'animal_no_encontrado')
      if (metodo === 'POST') {
        if (cuerpo.tipo === 'otra' && !cuerpo.causa) {
          return errorApi(400, 'validacion', [
            { campo: 'causa', mensaje: 'Explica la causa de la baja' },
          ])
        }
        const porTipo = {
          muerte: 'muerto',
          sacrificio: 'muerto',
          robo_extravio: 'baja',
          otra: 'baja',
        } as const
        Object.assign(a, {
          estado: porTipo[cuerpo.tipo as keyof typeof porTipo],
          tipoBaja: cuerpo.tipo,
          fechaBaja: cuerpo.fecha,
          causaBaja: cuerpo.causa ?? null,
        })
      } else {
        if (a.tipoBaja === 'venta') return errorApi(409, 'baja_por_venta')
        Object.assign(a, { estado: 'activo', tipoBaja: null, fechaBaja: null, causaBaja: null })
      }
      return json({
        ...a,
        madre: null,
        padre: null,
        hijos: [],
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-02T10:00:00.000Z',
      })
    }

    const deAnimales = ruta.match(ANIMALES)
    if (deAnimales) {
      const [, , animalId] = deAnimales
      const resumen = (id: string | null) => {
        const p = estado.animales.find((x) => x.id === id)
        return p ? { id: p.id, crotal: p.crotal, nombre: p.nombre } : null
      }
      const hoy = new Date().toISOString().slice(0, 10)
      // Como la función gestacion() del backend
      const gestacion = (a: AnimalSimulado) => {
        const vivos = estado.eventos.filter((e) => e.animalId === a.id && !e.anulacion)
        const cierre =
          vivos
            .filter(
              (e) => e.tipo === 'aborto' || (e.tipo === 'diagnostico' && e.resultado === 'vacia'),
            )
            .map((e) => e.fecha)
            .concat(
              estado.partos.filter((x) => x.madreId === a.id && !x.anulacion).map((x) => x.fecha),
            )
            .sort()
            .at(-1) ?? ''
        const cubricion = vivos
          .filter((e) => (e.tipo === 'cubricion' || e.tipo === 'inseminacion') && e.fecha > cierre)
          .sort((x, y) => x.fecha.localeCompare(y.fecha))
          .at(-1)
        const positivo = vivos.some(
          (e) => e.tipo === 'diagnostico' && e.resultado === 'gestante' && e.fecha > cierre,
        )
        if (!cubricion && !positivo) return null
        return {
          desde: cubricion?.fecha ?? null,
          fechaPrevistaParto: cubricion ? masDias(cubricion.fecha, 283) : null,
          confirmada: positivo,
        }
      }
      const supresion = (a: AnimalSimulado) =>
        estado.tratamientos
          .filter((t) => t.animalId === a.id && !t.anulacion)
          .map(finSupresion)
          .filter((fin) => fin > hoy)
          .sort()
          .at(-1) ?? null
      // La marca de la madre, si le afecta: a las hijas siempre, a los hijos si es toda la descendencia
      const afectado = (a: AnimalSimulado) => {
        const marca = estado.animales.find((m) => m.id === a.madreId)?.noAptaReposicion
        return marca && (a.sexo === 'hembra' || marca.alcance === 'descendencia') ? marca : null
      }
      const ficha = (a: AnimalSimulado) => ({
        ...a,
        noAptaReposicion: a.noAptaReposicion ?? null,
        madreNoAptaReposicion: afectado(a),
        finSupresion: supresion(a),
        gestacion: gestacion(a),
        madre: resumen(a.madreId),
        padre: resumen(a.padreId),
        creadoEn: '2026-10-01T10:00:00.000Z',
        modificadoEn: '2026-10-02T10:00:00.000Z',
      })
      const detalle = (a: AnimalSimulado) => ({
        ...ficha(a),
        hijos: estado.animales
          .filter((h) => h.madreId === a.id || h.padreId === a.id)
          .map((h) => ({
            id: h.id,
            crotal: h.crotal,
            nombre: h.nombre,
            sexo: h.sexo,
            fechaNacimiento: h.fechaNacimiento,
            estado: h.estado,
          })),
      })
      const validar = (datos: AnimalSimulado) => {
        if (datos.crotal && !/^ES[0-9]{12}$/.test(datos.crotal)) {
          return errorApi(400, 'validacion', [
            { campo: 'crotal', mensaje: 'El crotal son las letras ES y 12 dígitos' },
          ])
        }
        if (estado.animales.some((x) => x.crotal === datos.crotal && x.id !== datos.id)) {
          return errorApi(409, 'crotal_en_uso', [
            { campo: 'crotal', mensaje: 'Ya hay un animal con este crotal' },
          ])
        }
        return null
      }
      if (animalId === 'razas') return json(['Limusina', 'Rubia Gallega'])
      if (!animalId && metodo === 'GET') {
        const q = new URL(peticion.url).searchParams
        const texto = (q.get('q') ?? '').toLowerCase()
        return json(
          estado.animales
            .filter((a) => !q.get('estado') || a.estado === q.get('estado'))
            .filter((a) => !q.get('sexo') || a.sexo === q.get('sexo'))
            .filter((a) => !q.get('supresion') || supresion(a) !== null)
            .filter((a) => !q.get('gestacion') || gestacion(a) !== null)
            .filter((a) => !q.get('crotal') || a.crotal === null)
            .filter((a) => !q.get('reposicion') || Boolean(afectado(a)))
            .filter(
              (a) =>
                !texto ||
                [a.crotal, a.nombre ?? '', a.raza].join(' ').toLowerCase().includes(texto),
            )
            .map(ficha),
        )
      }
      if (!animalId && metodo === 'POST') {
        const nuevo = animalSimulado({ ...cuerpo, id: `a${estado.animales.length + 1}` })
        const fallo = validar(nuevo)
        if (fallo) return fallo
        estado.animales.push(nuevo)
        return json(detalle(nuevo), 201)
      }
      const a = estado.animales.find((x) => x.id === animalId)
      if (!a) return errorApi(404, 'animal_no_encontrado')
      if (metodo === 'PATCH') {
        const fallo = validar({ ...a, ...cuerpo })
        if (fallo) return fallo
        Object.assign(a, cuerpo)
      }
      return json(detalle(a))
    }

    const equipo = ruta.match(EQUIPO)
    if (equipo) {
      const [, , miembroId, accion] = equipo
      const sinMiembro = ({ otras: _o, ...m }: MiembroSimulado) => m
      if (!miembroId && metodo === 'GET') return json(estado.miembros.map(sinMiembro))
      if (!miembroId && metodo === 'POST') {
        if (cuerpo.tipo === 'existente' && cuerpo.usuario !== 'dani') {
          return errorApi(404, 'usuario_no_encontrado', [
            { campo: 'usuario', mensaje: 'No hay ningún usuario activo con este nombre' },
          ])
        }
        const nuevo: MiembroSimulado = {
          id: `m${estado.miembros.length + 1}`,
          usuarioId: `u${estado.miembros.length + 1}`,
          usuario: String(cuerpo.usuario).toLowerCase(),
          nombre: cuerpo.tipo === 'nuevo' ? cuerpo.nombre : 'Dani Rey',
          email: cuerpo.tipo === 'nuevo' ? cuerpo.email : 'dani@marela.test',
          rol: cuerpo.rol,
          activo: true,
        }
        estado.miembros.push(nuevo)
        return json(
          {
            miembro: sinMiembro(nuevo),
            ...(cuerpo.tipo === 'nuevo' ? { contrasenaTemporal: 'Temporal6789' } : {}),
          },
          201,
        )
      }
      const m = estado.miembros.find((x) => x.id === miembroId)
      if (!m) return errorApi(404, 'miembro_no_encontrado')
      if (accion === 'restablecer-contrasena') {
        if (m.otras) return errorApi(409, 'otras_explotaciones')
        return json({ miembro: sinMiembro(m), contrasenaTemporal: 'Nueva2345678' })
      }
      if (metodo === 'PATCH') {
        const despues = { ...m, ...cuerpo }
        const quedan = estado.miembros
          .map((x) => (x.id === m.id ? despues : x))
          .filter((x) => x.rol === 'administrador' && x.activo)
        if (quedan.length === 0) {
          return json(
            {
              error: {
                codigo: 'ultimo_administrador',
                mensaje: 'La explotación tiene que tener al menos un administrador activo',
              },
            },
            409,
          )
        }
        Object.assign(m, cuerpo)
        return json(sinMiembro(m))
      }
    }

    if (ruta.startsWith('/api/plataforma/')) {
      if (!estado.usuario.propietario) return errorApi(403, 'sin_permiso')
      if (ruta === '/api/plataforma/usuarios/restablecer-contrasena') {
        if (cuerpo.usuario !== 'xose') {
          return errorApi(404, 'usuario_no_encontrado', [
            { campo: 'usuario', mensaje: 'No hay ningún usuario con este nombre' },
          ])
        }
        return json({ usuario: 'xose', nombre: 'Xosé Lema', contrasenaTemporal: 'Propia234567' })
      }
      if (ruta === '/api/plataforma/explotaciones' && metodo === 'GET') {
        return json(estado.plataforma)
      }
      if (ruta === '/api/plataforma/explotaciones' && metodo === 'POST') {
        if (estado.plataforma.some((e) => e.rega === cuerpo.rega)) {
          return errorApi(409, 'rega_en_uso', [
            { campo: 'rega', mensaje: 'Ya hay una explotación con este código REGA' },
          ])
        }
        const nueva: ExplotacionDePlataforma = {
          id: `00000000-0000-7000-8009-${String(estado.plataforma.length + 1).padStart(12, '0')}`,
          nombre: cuerpo.nombre,
          rega: cuerpo.rega,
          municipio: cuerpo.municipio,
          provincia: cuerpo.provincia,
          activa: true,
          miembros: 1,
          creadaEn: '2026-10-24T10:00:00.000Z',
        }
        estado.plataforma.push(nueva)
        const nuevo = cuerpo.administrador.tipo === 'nuevo'
        return json(
          {
            explotacion: nueva,
            administrador: {
              id: 'admin-1',
              usuario: String(cuerpo.administrador.usuario).toLowerCase(),
              nombre: nuevo ? cuerpo.administrador.nombre : 'Usuario existente',
            },
            ...(nuevo ? { contrasenaTemporal: 'Temporal2345' } : {}),
          },
          201,
        )
      }
      const una = ruta.match(EN_PLATAFORMA)
      const e = estado.plataforma.find((x) => x.id === una?.[1])
      if (e && metodo === 'PATCH') {
        e.activa = cuerpo.activa
        return json(e)
      }
    }
    return errorApi(404, 'no_encontrado')
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
