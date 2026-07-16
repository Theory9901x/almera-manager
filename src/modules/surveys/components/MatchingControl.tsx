import { useState } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { MatchingTarget, SurveyOption } from '../types'

// Emparejar / agrupar: arrastrar (raton, seccion 10.3) o, en su defecto, tocar el elemento y luego
// el grupo destino — el mismo modo por toque sirve como alternativa accesible para quien no puede
// arrastrar, sin necesidad de detectar el dispositivo.
export function MatchingControl({ items, targets, pairs, onChange, color, disabled }: {
  items: SurveyOption[]
  targets: MatchingTarget[]
  pairs: Record<string, string>
  onChange(pairs: Record<string, string>): void
  color: string
  disabled?: boolean
}) {
  const [armedId, setArmedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overTarget, setOverTarget] = useState<string | null>(null)

  const unplaced = items.filter(item => !pairs[item.id])

  function assign(itemId: string, targetId: string) {
    onChange({ ...pairs, [itemId]: targetId })
    setArmedId(null)
  }

  function unassign(itemId: string) {
    const next = { ...pairs }
    delete next[itemId]
    onChange(next)
  }

  function itemChip(item: SurveyOption, placed: boolean) {
    const armed = armedId === item.id
    return (
      <motion.button
        key={item.id}
        type="button"
        layout
        disabled={disabled}
        draggable={!disabled}
        onDragStart={() => setDraggingId(item.id)}
        onDragEnd={() => setDraggingId(null)}
        onClick={() => setArmedId(current => current === item.id ? null : item.id)}
        className={`survey-matching-chip ${armed ? 'is-armed' : ''} ${draggingId === item.id ? 'is-dragging' : ''}`}
        style={armed ? { borderColor: color, boxShadow: `0 0 0 3px ${color}33` } : undefined}
        animate={draggingId === item.id ? { scale: 1.06, rotate: -2 } : { scale: 1, rotate: 0 }}
      >
        {item.imageUrl && <img src={item.imageUrl} alt="" className="survey-matching-chip-image" />}
        {item.emoji && <span className="survey-matching-chip-emoji">{item.emoji}</span>}
        <span>{item.label}</span>
        {placed && (
          <span className="survey-matching-chip-remove" onClick={event => { event.stopPropagation(); unassign(item.id) }} role="button" aria-label="Quitar">
            <X size={11} />
          </span>
        )}
      </motion.button>
    )
  }

  return (
    <div className="survey-matching">
      <p className="survey-matching-hint">Arrastra cada elemento a su grupo, o tócalo y luego toca el grupo.</p>
      <div className={`survey-matching-pool ${!unplaced.length ? 'is-empty' : ''}`}>
        {unplaced.length ? unplaced.map(item => itemChip(item, false)) : <span className="survey-matching-pool-done">Todos los elementos fueron ubicados ✓</span>}
      </div>
      <div className="survey-matching-targets">
        {targets.map(target => {
          const placedItems = items.filter(item => pairs[item.id] === target.id)
          return (
            <div
              key={target.id}
              className={`survey-matching-target ${overTarget === target.id ? 'is-over' : ''}`}
              style={overTarget === target.id ? { borderColor: color, boxShadow: `0 0 0 4px ${color}22` } : undefined}
              onDragOver={event => { event.preventDefault(); setOverTarget(target.id) }}
              onDragLeave={() => setOverTarget(current => current === target.id ? null : current)}
              onDrop={event => { event.preventDefault(); setOverTarget(null); if (draggingId) assign(draggingId, target.id) }}
              onClick={() => { if (armedId) assign(armedId, target.id) }}
            >
              <h4 style={{ background: color }}>{target.label}</h4>
              <div className="survey-matching-target-body">
                {placedItems.map(item => itemChip(item, true))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
