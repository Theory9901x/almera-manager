import { CHECKLIST_THRESHOLDS, SEMAPHORE_LABELS, semaphoreColor, semaphoreLevel } from '@/design-system'

/**
 * Semaforo de Listas de Chequeo. Mismos COLORES que todo el sistema (§5.1) pero con los cortes
 * del modulo: VERDE DESDE EL 85 %, por decision expresa del usuario.
 *
 * Todo el modulo importa de aqui en vez de llamar a `semaphoreColor` del design system: si cada
 * pantalla tuviera que acordarse de pasar `CHECKLIST_THRESHOLDS` como segundo argumento, la que
 * se olvidara pintaria un 87 % en lima mientras la de al lado lo pinta en verde. El servidor tiene
 * su equivalente en server/checklistScoring.mjs, atado a los mismos cortes.
 */
export const checklistColor = (percent: number | null) => semaphoreColor(percent, CHECKLIST_THRESHOLDS)
export const checklistLevel = (percent: number | null) => semaphoreLevel(percent, CHECKLIST_THRESHOLDS)
export const checklistConceptLabel = (percent: number | null) => {
  const level = checklistLevel(percent)
  return level ? SEMAPHORE_LABELS[level] : 'Sin dato'
}
