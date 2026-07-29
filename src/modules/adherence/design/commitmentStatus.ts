import type { CommitmentStatus } from '../types'

/**
 * Etiquetas y colores de los estados de un compromiso. Viven aqui, en un solo sitio, porque los
 * usan el panel del auditor, la pagina del profesional y el informe: tres copias es como una
 * actividad acaba llamandose distinto segun quien la mire.
 *
 * El color NO es el semaforo de cumplimiento (§5.1): un compromiso pendiente no es «malo», solo
 * esta sin empezar. Es un estado de flujo, no un nivel de calidad.
 */
export const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  CUMPLIDO: 'Cumplido',
  INCUMPLIDO: 'Incumplido',
}

export const COMMITMENT_STATUS_COLORS: Record<CommitmentStatus, string> = {
  PENDIENTE: '#64748B',
  EN_PROCESO: '#0284C7',
  CUMPLIDO: '#059669',
  INCUMPLIDO: '#DC2626',
}

export const COMMITMENT_STATUSES: CommitmentStatus[] = ['PENDIENTE', 'EN_PROCESO', 'CUMPLIDO', 'INCUMPLIDO']

/** Una actividad esta vencida si tiene fecha, ya paso y aun no se cumplio. */
export function isCommitmentOverdue(dueDate: string | null, status: CommitmentStatus) {
  if (!dueDate || status === 'CUMPLIDO') return false
  return new Date(`${String(dueDate).slice(0, 10)}T23:59:59`) < new Date()
}
