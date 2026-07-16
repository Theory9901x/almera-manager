import { useRef } from 'react'
import type { PointerEvent } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import type { SurveyOption } from '../types'

// Tarjeta de carita "pseudo-3D": no hay modelos 3D reales de Tabita (solo estas imagenes planas),
// asi que la profundidad se logra con perspective + rotateX/rotateY con resorte (Framer Motion, ya
// dependencia del proyecto, cero peso extra) siguiendo al puntero, mas un balanceo idle continuo
// desfasado por tarjeta, y un "gesto" de pop/squash-stretch al seleccionar. El tilt por puntero solo
// aplica en mouse (pointerType==='mouse'): en touch no se seguiria el dedo y podria interferir con
// el scroll de la pagina (ver el bug de scroll movil ya corregido antes).
export function FaceRatingCard({ option, index, selected, dimmed, disabled, onClick }: {
  option: SurveyOption
  index: number
  selected: boolean
  dimmed: boolean
  disabled?: boolean
  onClick(): void
}) {
  const reduced = useReducedMotion()
  const cardRef = useRef<HTMLButtonElement>(null)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const springConfig = { stiffness: 220, damping: 18, mass: 0.6 }
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [10, -10]), springConfig)
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-10, 10]), springConfig)

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (reduced || event.pointerType !== 'mouse') return
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    pointerX.set((event.clientX - rect.left) / rect.width - 0.5)
    pointerY.set((event.clientY - rect.top) / rect.height - 0.5)
  }
  function resetTilt() {
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <motion.button
      ref={cardRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      className={`survey-face-card ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}
      style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY, transformPerspective: 700 }}
      animate={reduced ? undefined : { y: [0, -8, 0], rotate: [0, -2, 0, 2, 0] }}
      transition={reduced ? undefined : { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }}
      aria-pressed={selected}
    >
      <motion.span
        className="survey-face-glow"
        style={{ background: `radial-gradient(circle, ${option.color || '#0F7A54'}40, transparent 70%)` }}
        animate={{ opacity: selected ? 1 : 0.7, scale: selected ? 1.15 : 1 }}
      />
      <motion.span
        className="survey-face-image-wrap"
        animate={
          selected
            ? reduced
              ? { scale: 1.12, y: -6, rotate: 0 }
              : { scale: [1, 1.28, 0.94, 1.12], y: [0, -10, -2, -6], rotate: [0, -6, 4, 0] }
            : { scale: 1, y: 0, rotate: 0 }
        }
        transition={selected && !reduced ? { duration: 0.5, times: [0, 0.4, 0.7, 1], ease: 'easeOut' } : { duration: 0.25 }}
      >
        {option.imageUrl
          ? <img src={option.imageUrl} alt="" className="survey-face-image" />
          : <span className="survey-face-image survey-face-image-placeholder">{option.emoji || option.label.slice(0, 1)}</span>}
      </motion.span>
      <span className="survey-face-label">{option.label}</span>
    </motion.button>
  )
}
