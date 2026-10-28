import type { ReactNode } from 'react'
import { fecha } from '../formato'
import { SEXOS } from './datos'
import {
  type EventoReproductivo,
  METODOS,
  type Parto,
  RESULTADOS,
  TIPOS_EVENTO,
  TIPOS_PARTO,
} from './reproduccion'

// Cómo se cuenta cada evento reproductivo (GH-22) y cada parto (GH-23), en la tarjeta de la ficha y
// en el historial del animal (GH-24)

type Resumen = { id: string; crotal: string | null; nombre: string | null }

export type EntradaReproductiva = {
  clave: string
  fecha: string
  creadoEn: string
  titulo: string
  // Datos que van en una línea separados por " · " (sin la fecha)
  detalle: ReactNode[]
  lineas: ReactNode[]
  observaciones: string | null
  anulacion: { en: string; por: string; motivo: string } | null
}

export function deEvento(
  e: EventoReproductivo,
  animalId: string,
  enlace: (a: Resumen) => ReactNode,
): EntradaReproductiva {
  const deSuTernero = e.tipo === 'destete' && e.animalId !== animalId
  return {
    clave: e.id,
    fecha: e.fecha,
    creadoEn: e.creadoEn,
    titulo:
      e.tipo === 'diagnostico' && e.resultado
        ? `Diagnóstico: ${RESULTADOS[e.resultado].toLowerCase()}`
        : deSuTernero
          ? 'Destete de su ternero'
          : TIPOS_EVENTO[e.tipo],
    detalle: [
      e.padre ? (
        <span key="padre">con {enlace(e.padre)}</span>
      ) : (
        e.padreTexto && `con ${e.padreTexto}`
      ),
      e.metodo && METODOS[e.metodo],
      deSuTernero && enlace(e.animal),
    ],
    lineas:
      e.fechaPrevistaParto && !e.anulacion
        ? [`Parto previsto el ${fecha(e.fechaPrevistaParto)}`]
        : [],
    observaciones: e.observaciones,
    anulacion: e.anulacion,
  }
}

export function deParto(p: Parto, enlace: (a: Resumen) => ReactNode): EntradaReproductiva {
  return {
    clave: p.id,
    fecha: p.fecha,
    creadoEn: p.creadoEn,
    titulo: p.tipo === 'normal' ? 'Parto' : `Parto ${TIPOS_PARTO[p.tipo].toLowerCase()}`,
    detalle: [
      p.padre ? (
        <span key="padre">de {enlace(p.padre)}</span>
      ) : (
        p.padreTexto && `de ${p.padreTexto}`
      ),
    ],
    lineas: p.terneros.map((t) => (
      <span key={t.id}>
        {enlace(t)} · {SEXOS[t.sexo].toLowerCase()}
        {t.estado === 'muerto' && ', nacido muerto'}
      </span>
    )),
    observaciones: p.observaciones,
    anulacion: p.anulacion,
  }
}

// "a · b · c", sin los vacíos
export const unir = (partes: ReactNode[]) =>
  partes.filter(Boolean).flatMap((d, i) => (i ? [' · ', d] : [d]))
