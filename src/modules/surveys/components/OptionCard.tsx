import { Check } from 'lucide-react'
import { motion } from 'framer-motion'

// Tarjeta seleccionable para opción única/múltiple — reemplaza el radio/checkbox nativo (regla 11).
// Al seleccionarse se eleva en Z con halo del color de marca (seccion 10.2 / 10.6).
export function OptionCard({ label, emoji, selected, onClick, multiple, color, disabled, shape, lineColor }: {
  label: string
  emoji?: string
  selected: boolean
  onClick(): void
  multiple?: boolean
  color: string
  disabled?: boolean
  // Fuerza la forma de la marca (checkbox/radio) independientemente de `multiple`, para el estilo
  // de check circular de color que pide una tarjeta de linea aunque la pregunta sea de opcion multiple.
  shape?: 'round' | 'square'
  // Color de identidad de ESTA opcion (ej. cada linea de Responsabilidad Social con su propio
  // color) — a diferencia de `color` (acento compartido de toda la pregunta/encuesta), este se ve
  // SIEMPRE, este seleccionada o no la opcion, no solo como resalte al elegirla.
  lineColor?: string
}) {
  const markShape = shape || (multiple ? 'square' : 'round')
  const identityColor = lineColor || color
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`survey-option ${selected ? 'is-selected' : ''}`}
      style={selected ? { borderColor: identityColor, background: `${identityColor}14`, boxShadow: `0 10px 24px ${identityColor}26` } : lineColor ? { borderColor: `${identityColor}55` } : undefined}
      aria-pressed={selected}
    >
      <span
        className={`survey-option-mark is-${markShape}`}
        style={selected ? { background: identityColor, borderColor: identityColor } : lineColor ? { background: `${identityColor}1a`, borderColor: identityColor } : undefined}
      >
        {selected && (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.16 }}>
            <Check size={12} strokeWidth={3} />
          </motion.span>
        )}
      </span>
      {emoji && <span className="survey-option-emoji">{emoji}</span>}
      <span className="survey-option-label">{label}</span>
    </button>
  )
}
