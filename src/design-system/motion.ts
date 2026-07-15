import type { Transition, Variants } from 'framer-motion'

// Primitivas de motion reutilizables — todo modulo consume de aqui, nunca define su propia
// animacion de entrada suelta. El motion siempre comunica un cambio de estado real, nunca decorativo.

export const EASE_STANDARD: Transition = { duration: 0.22, ease: 'easeOut' }
export const EASE_SOFT: Transition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

// Entrada de pagina/seccion: fade + slide-up.
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: EASE_SOFT },
}

// Contenedor con stagger para listas/grids — usar junto con fadeSlideUp en los hijos.
export function staggerContainer(staggerMs = 50): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: staggerMs / 1000 } },
  }
}

// Entrada/salida de un elemento dentro de una lista animada (AnimatePresence).
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: EASE_STANDARD },
  exit: { opacity: 0, y: -8, transition: EASE_STANDARD },
}

// Entrada/salida horizontal (columnas de tabla, chips).
export const slideHorizontal: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: EASE_STANDARD },
  exit: { opacity: 0, x: 16, transition: EASE_STANDARD },
}

// Pulso breve de confirmacion al cambiar un valor (badge, celda).
export const valuePulse: Variants = {
  initial: { scale: 0.6, opacity: 0.4 },
  animate: { scale: 1, opacity: 1, transition: EASE_STANDARD },
}

// Toast: entra desde arriba con leve escala, sale hacia arriba.
export const toastMotion: Variants = {
  hidden: { opacity: 0, y: -12, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.2 } },
}
