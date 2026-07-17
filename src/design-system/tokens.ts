// Fuente unica de verdad para color, tipografia, espaciado y sombra en toda la plataforma.
// Los modulos NO definen sus propios colores/sombras sueltos — todos consumen de aqui.

// Semaforo de cumplimiento — transversal a toda la plataforma. Un mismo porcentaje siempre
// se ve del mismo color, sin importar el modulo. No confundir con el color de identidad (seccion 3).
export type SemaphoreLevel = 'OPTIMO' | 'ACEPTABLE' | 'DEFICIENTE' | 'MUY_DEFICIENTE'

export const SEMAPHORE_COLORS: Record<SemaphoreLevel, string> = {
  OPTIMO: '#059669',
  ACEPTABLE: '#65A30D',
  DEFICIENTE: '#D97706',
  MUY_DEFICIENTE: '#DC2626',
}

export const SEMAPHORE_LABELS: Record<SemaphoreLevel, string> = {
  OPTIMO: 'Óptimo',
  ACEPTABLE: 'Aceptable',
  DEFICIENTE: 'Deficiente',
  MUY_DEFICIENTE: 'Muy deficiente',
}

export const SEMAPHORE_NO_DATA = '#94A3B8'

export function semaphoreLevel(percent: number | null): SemaphoreLevel | null {
  if (percent === null) return null
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}

export function semaphoreColor(percent: number | null): string {
  const level = semaphoreLevel(percent)
  return level ? SEMAPHORE_COLORS[level] : SEMAPHORE_NO_DATA
}

// Identidad de color por modulo del sidebar — "en que modulo estoy", nunca "que tan bien va algo".
// Usado en: franja del PageHeader, icono del modulo en el sidebar, subrayado de tabs internas,
// borde de acento de tarjetas propias del modulo. Nunca como fondo solido ni relleno de boton generico.
export interface ModuleIdentity { key: string; color: string; gradientFrom: string; gradientTo: string }

// Equivalentes hex de la paleta armonica OKLCH (--m-* en index.css), calculados via canvas para
// que el codigo JS que concatena alpha en hex (ej. `${identity.color}18`) siga funcionando —
// oklch(...) como string no admite ese truco. Misma luminosidad/croma en las 11, solo cambia el
// tono, para que ningun modulo pese visualmente mas que otro.
export const MODULE_IDENTITIES: Record<string, ModuleIdentity> = {
  dashboard: { key: 'dashboard', color: '#4263EB', gradientFrom: '#4263EB', gradientTo: '#748FFC' },
  // --m-asistencias (rojo-coral, tono 25)
  almera: { key: 'almera', color: '#bd413f', gradientFrom: '#bd413f', gradientTo: '#e2726b' },
  'technical-assistances': { key: 'technical-assistances', color: '#bd413f', gradientFrom: '#bd413f', gradientTo: '#e2726b' },
  // --m-auditorias (azul-indigo, tono 260)
  'internal-audits': { key: 'internal-audits', color: '#346ecd', gradientFrom: '#346ecd', gradientTo: '#6398ee' },
  audits: { key: 'audits', color: '#346ecd', gradientFrom: '#346ecd', gradientTo: '#6398ee' },
  // --m-matrices (violeta, tono 300)
  'adherence-matrix': { key: 'adherence-matrix', color: '#8156c0', gradientFrom: '#8156c0', gradientTo: '#a682e1' },
  // --m-encuestas (cian-teal, tono 195)
  surveys: { key: 'surveys', color: '#008c8e', gradientFrom: '#008c8e', gradientTo: '#00b2b3' },
  // --m-huella (verde, tono 155)
  'carbon-footprint': { key: 'carbon-footprint', color: '#008b45', gradientFrom: '#008b45', gradientTo: '#3fb171' },
  // --m-usuarios (rosa-fucsia, tono 350)
  admin: { key: 'admin', color: '#b2417f', gradientFrom: '#b2417f', gradientTo: '#d771a4' },
  users: { key: 'users', color: '#b2417f', gradientFrom: '#b2417f', gradientTo: '#d771a4' },
}

export const DEFAULT_MODULE_IDENTITY: ModuleIdentity = { key: 'default', color: '#4F46E5', gradientFrom: '#4F46E5', gradientTo: '#7C3AED' }

export function moduleIdentity(key: string | undefined | null): ModuleIdentity {
  if (!key) return DEFAULT_MODULE_IDENTITY
  return MODULE_IDENTITIES[key] || DEFAULT_MODULE_IDENTITY
}

// Tipografia — una sola familia en todo el sistema (ya cargada como fuente variable del proyecto).
export const FONT_FAMILY = "'Manrope Variable', 'Inter', system-ui, sans-serif"
export const FONT_FAMILY_DISPLAY = "'Space Grotesk Variable', 'Manrope Variable', system-ui, sans-serif"

export const TYPE_SCALE = {
  xs: '11px', sm: '12.5px', base: '14px', md: '16px', lg: '20px', xl: '24px', xxl: '32px',
}

// Espaciado, radios y sombra — escala consistente, nunca sombras/radios ad-hoc.
export const RADII = { sm: '10px', md: '14px', lg: '16px', pill: '999px' }

export const SHADOWS = {
  sm: '0 1px 2px rgba(16,24,40,.045), 0 4px 10px rgba(16,24,40,.035)',
  md: '0 2px 6px rgba(16,24,40,.055), 0 10px 26px rgba(16,24,40,.06)',
  lg: '0 10px 20px rgba(16,24,40,.09), 0 24px 48px rgba(16,24,40,.12)',
}
