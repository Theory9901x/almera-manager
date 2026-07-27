// Fuente UNICA del semaforo en el servidor. Antes cada plantilla de informe repetia su propia
// copia de los colores y los cortes, y bastaba tocar una para que el PDF dejara de coincidir con
// la pantalla. Las plantillas importan de aqui; el cliente tiene su equivalente en
// src/design-system/tokens.ts (no se puede compartir el archivo: aquel es TS y esto es .mjs).
//
// El semaforo es de TRES colores, siempre: verde, amarillo y rojo. Los cuatro conceptos
// institucionales se mantienen porque estan guardados en base y salen en los informes, pero
// Optimo y Aceptable comparten el verde: ambos son "cumple", y lo que los distingue es la
// etiqueta, no el color.
export const SEMAPHORE_GREEN = '#16A34A'
// Amarillo oscurecido a proposito: el amarillo puro (#EAB308) sobre blanco queda ilegible como
// texto, y estos colores se usan sobre todo para escribir porcentajes, no solo para rellenar
// barras. Este tono sigue leyendose amarillo y mantiene contraste suficiente.
export const SEMAPHORE_YELLOW = '#CA8A04'
export const SEMAPHORE_RED = '#DC2626'
export const SEMAPHORE_NO_DATA = '#94A3B8'

export const CONCEPT_COLORS = {
  OPTIMO: SEMAPHORE_GREEN,
  ACEPTABLE: SEMAPHORE_GREEN,
  DEFICIENTE: SEMAPHORE_YELLOW,
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
