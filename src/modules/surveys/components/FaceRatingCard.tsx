import { motion } from 'framer-motion'
import { useTilt } from './useTilt'
import type { SurveyOption } from '../types'

// Tarjeta de carita animada (idle float + tilt 3D + pop al seleccionar + halo de color) — pensada
// para escalas de satisfaccion con expresiones (ej. Tabita), reutiliza useTilt tal cual (mismo tilt
// ya validado en la pregunta de ODS), no una implementacion nueva de seguimiento de puntero.
export function FaceRatingCard({ option, index, selected, dimmed, disabled, onClick }: {
  option: SurveyOption
  index: number
  selected: boolean
  dimmed: boolean
  disabled?: boolean
  onClick(): void
}) {
  const tiltRef = useTilt<HTMLButtonElement>()
  return (
    <motion.button
      ref={tiltRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`survey-face-card ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}
      style={{ animationDelay: `${index * 0.4}s` }}
      aria-pressed={selected}
    >
      <span className="survey-face-glow" style={{ background: `radial-gradient(circle, ${option.color || '#0F7A54'}40, transparent 70%)` }} />
      {option.imageUrl
        ? <img src={option.imageUrl} alt="" className="survey-face-image" />
        : <span className="survey-face-image survey-face-image-placeholder">{option.emoji || option.label.slice(0, 1)}</span>}
      <span className="survey-face-label">{option.label}</span>
    </motion.button>
  )
}
