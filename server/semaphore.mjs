// Fuente UNICA del semaforo en el servidor. Antes cada plantilla de informe repetia su propia
// copia de los colores y los cortes, y bastaba tocar una para que el PDF dejara de coincidir con
// la pantalla. Las plantillas importan de aqui; el cliente tiene su equivalente en
// src/design-system/tokens.ts (no se puede compartir el archivo: aquel es TS y esto es .mjs).
//
// Cuatro niveles con su propio color, como en los formatos institucionales: verde, lima, ambar
// y rojo. Se mantienen asi a peticion expresa — cada concepto se distingue por color, no solo
// por la etiqueta.
export const SEMAPHORE_GREEN = '#059669'
export const SEMAPHORE_LIME = '#65A30D'
export const SEMAPHORE_AMBER = '#D97706'
export const SEMAPHORE_RED = '#DC2626'
export const SEMAPHORE_NO_DATA = '#94A3B8'

export const CONCEPT_COLORS = {
  OPTIMO: SEMAPHORE_GREEN,
  ACEPTABLE: SEMAPHORE_LIME,
  DEFICIENTE: SEMAPHORE_AMBER,
  MUY_DEFICIENTE: SEMAPHORE_RED,
}

export const CONCEPT_LABELS = {
  OPTIMO: 'Óptimo',
  ACEPTABLE: 'Aceptable',
  DEFICIENTE: 'Deficiente',
  MUY_DEFICIENTE: 'Muy deficiente',
}

export function conceptFromPercent(percent) {
  if (percent === null || percent === undefined) return null
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}

/** Color del semaforo para un porcentaje. `null` (sin dato) devuelve gris, nunca rojo. */
export function semaphoreColor(percent) {
  const concept = conceptFromPercent(percent)
  return concept ? CONCEPT_COLORS[concept] : SEMAPHORE_NO_DATA
}
