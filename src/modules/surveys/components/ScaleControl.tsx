import { motion } from 'framer-motion'

// Segmented control 1..N para escalas y matrices Likert — nunca un <input type=range> pelado.
// El paso seleccionado se eleva ligeramente en Z (seccion 10.6): profundidad con intencion.
export function ScaleControl({ min, max, value, onChange, minLabel, maxLabel, color, compact, disabled }: {
  min: number
  max: number
  value: number | null
  onChange(value: number): void
  minLabel?: string
  maxLabel?: string
  color: string
  compact?: boolean
  disabled?: boolean
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, index) => min + index)
  return (
    <div className="survey-scale">
      <div className="survey-scale-row">
        {steps.map(step => {
          const active = value === step
          return (
            <button
              key={step}
              type="button"
              disabled={disabled}
              className={`survey-scale-step ${compact ? 'is-compact' : ''} ${active ? 'is-active' : ''}`}
              style={active ? { background: color, borderColor: color, color: '#fff' } : undefined}
              onClick={() => onChange(step)}
              aria-pressed={active}
            >
              <motion.span initial={false} animate={active ? { scale: 1.08 } : { scale: 1 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
                {step}
              </motion.span>
            </button>
          )
        })}
      </div>
      {(minLabel || maxLabel) && (
        <div className="survey-scale-labels">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  )
}
