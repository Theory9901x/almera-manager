// Paleta fija de 7 gradientes para acentuar los ambitos de una matriz. Los ambitos son
// editables por matriz (nombre y orden), asi que el color se asigna por posicion (order_index),
// no por nombre — el ambito #1 de cualquier matriz siempre usa el primer gradiente, etc.
export const SCOPE_GRADIENTS = [
  { name: 'violet', from: '#7C3AED', to: '#A78BFA' },
  { name: 'cyan', from: '#0891B2', to: '#67E8F9' },
  { name: 'emerald', from: '#059669', to: '#34D399' },
  { name: 'amber', from: '#D97706', to: '#FBBF24' },
  { name: 'fuchsia', from: '#C026D3', to: '#E879F9' },
  { name: 'blue', from: '#2563EB', to: '#60A5FA' },
  { name: 'rose', from: '#E11D48', to: '#FB7185' },
] as const

export function scopeColor(index: number) {
  return SCOPE_GRADIENTS[index % SCOPE_GRADIENTS.length]
}

export function scopeGradientCss(index: number, angle = 135) {
  const { from, to } = scopeColor(index)
  return `linear-gradient(${angle}deg, ${from}, ${to})`
}

// Escala de semaforo de cumplimiento — fija, no editable, igual en toda la interfaz.
export type Concept = 'OPTIMO' | 'ACEPTABLE' | 'DEFICIENTE' | 'MUY_DEFICIENTE'

export const CONCEPT_COLORS: Record<Concept, string> = {
  OPTIMO: '#059669',
  ACEPTABLE: '#65A30D',
  DEFICIENTE: '#D97706',
  MUY_DEFICIENTE: '#DC2626',
}

export const CONCEPT_LABELS: Record<Concept, string> = {
  OPTIMO: 'Óptimo',
  ACEPTABLE: 'Aceptable',
  DEFICIENTE: 'Deficiente',
  MUY_DEFICIENTE: 'Muy deficiente',
}

const NO_DATA_COLOR = '#94A3B8'

export function conceptFromPercent(percent: number | null): Concept | null {
  if (percent === null) return null
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}

export function colorForPercent(percent: number | null): string {
  const concept = conceptFromPercent(percent)
  return concept ? CONCEPT_COLORS[concept] : NO_DATA_COLOR
}
