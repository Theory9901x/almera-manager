import { Check } from 'lucide-react'
import { motion } from 'framer-motion'

// Tarjeta de imagen seleccionable (seccion 10.3): overlay + check animado al elegir.
export function ImageOptionCard({ label, imageUrl, selected, onClick, color, disabled }: {
  label: string
  imageUrl?: string
  selected: boolean
  onClick(): void
  color: string
  disabled?: boolean
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`survey-image-option ${selected ? 'is-selected' : ''}`} style={selected ? { borderColor: color } : undefined} aria-pressed={selected}>
      {imageUrl ? <img src={imageUrl} alt={label} /> : <span className="survey-image-option-placeholder">{label.slice(0, 1)}</span>}
      <span className="survey-image-option-label">{label}</span>
      {selected && (
        <motion.span className="survey-image-option-check" style={{ background: color }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.16 }}>
          <Check size={13} strokeWidth={3} color="#fff" />
        </motion.span>
      )}
    </button>
  )
}
