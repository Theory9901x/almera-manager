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

/** Cortes institucionales, los de los formatos en papel. Es la escala por defecto del sistema. */
export const THRESHOLDS = { optimo: 90, aceptable: 80, deficiente: 70 }

/**
 * Cortes de LISTAS DE CHEQUEO: verde a partir del 85 %, por decision expresa del usuario para ese
 * modulo. Los COLORES no cambian (§5.1: el semaforo es el mismo en todo el sistema y en el PDF);
 * lo unico propio del modulo es donde empieza el verde. Va aqui, junto a la escala institucional,
 * para que pantalla e informe lean el mismo numero: tener el corte duplicado en el cliente y en
 * la plantilla del PDF es exactamente como el informe deja de coincidir con lo que se vio.
 */
export const CHECKLIST_THRESHOLDS = { optimo: 85, aceptable: 80, deficiente: 70 }

export function conceptFromPercent(percent, thresholds = THRESHOLDS) {
  if (percent === null || percent === undefined) return null
  if (percent >= thresholds.optimo) return 'OPTIMO'
  if (percent >= thresholds.aceptable) return 'ACEPTABLE'
  if (percent >= thresholds.deficiente) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}

/** Color del semaforo para un porcentaje. `null` (sin dato) devuelve gris, nunca rojo. */
export function semaphoreColor(percent, thresholds = THRESHOLDS) {
  const concept = conceptFromPercent(percent, thresholds)
  return concept ? CONCEPT_COLORS[concept] : SEMAPHORE_NO_DATA
}
