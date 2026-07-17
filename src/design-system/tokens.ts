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

export const MODULE_IDENTITIES: Record<string, ModuleIdentity> = {
  dashboard: { key: 'dashboard', color: '#4263EB', gradientFrom: '#4263EB', gradientTo: '#748FFC' },
  almera: { key: 'almera', color: '#3B5BDB', gradientFrom: '#3B5BDB', gradientTo: '#748FFC' },
  'technical-assistances': { key: 'technical-assistances', color: '#3B5BDB', gradientFrom: '#3B5BDB', gradientTo: '#748FFC' },
  'internal-audits': { key: 'internal-audits', color: '#B08900', gradientFrom: '#B08900', gradientTo: '#E0B84D' },
  audits: { key: 'audits', color: '#B08900', gradientFrom: '#B08900', gradientTo: '#E0B84D' },
  'adherence-matrix': { key: 'adherence-matrix', color: '#4F46E5', gradientFrom: '#4F46E5', gradientTo: '#7C3AED' },
  surveys: { key: 'surveys', color: '#0F7A54', gradientFrom: '#0F7A54', gradientTo: '#2FAE74' },
  'carbon-footprint': { key: 'carbon-footprint', color: '#0f5c3f', gradientFrom: '#0f5c3f', gradientTo: '#0ca678' },
  admin: { key: 'admin', color: '#9C36B5', gradientFrom: '#9C36B5', gradientTo: '#BE4BDB' },
  users: { key: 'users', color: '#9C36B5', gradientFrom: '#9C36B5', gradientTo: '#BE4BDB' },
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
