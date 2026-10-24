import { createLucideIcon } from 'lucide-react'

// Iconos propios que Lucide no tiene, dibujados con su mismo estilo (24 × 24, trazo de 2 px, extremos
// redondeados) para que se usen igual que los suyos: <Vaca aria-hidden size={24} />

// Cabeza de vaca de frente: cuernos, orejas, ojos y morro con los ollares
export const Vaca = createLucideIcon('vaca', [
  ['path', { d: 'M7 6C5.3 6 4 4.8 4 3', key: 'cuerno-izquierdo' }],
  ['path', { d: 'M17 6c1.7 0 3-1.2 3-3', key: 'cuerno-derecho' }],
  ['path', { d: 'M7 8.5H4.5a1.5 1.5 0 0 0 0 3h2.7', key: 'oreja-izquierda' }],
  ['path', { d: 'M17 8.5h2.5a1.5 1.5 0 0 1 0 3h-2.7', key: 'oreja-derecha' }],
  ['path', { d: 'M8.4 15.4C7.5 12.8 7 9.6 7 6h10c0 3.6-.5 6.8-1.4 9.4', key: 'cabeza' }],
  ['rect', { x: '7.5', y: '15', width: '9', height: '6', rx: '3', key: 'morro' }],
  ['path', { d: 'M10.5 18h.01', key: 'ollar-izquierdo' }],
  ['path', { d: 'M13.5 18h.01', key: 'ollar-derecho' }],
  ['path', { d: 'M9.8 10h.01', key: 'ojo-izquierdo' }],
  ['path', { d: 'M14.2 10h.01', key: 'ojo-derecho' }],
])
