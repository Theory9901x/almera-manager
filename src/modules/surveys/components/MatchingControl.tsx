import { useState } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { MatchingTarget, SurveyOption } from '../types'
import { resolveLineIcon } from './lineIcons'

function leadingMark(label: string): string | null {
  const match = label.match(/^(\d{1,3})[.)]/)
  return match ? match[1] : null
}

// Emparejar / agrupar: arrastrar (raton, seccion 10.3) o, en su defecto, tocar el elemento y luego
// el grupo destino — el mismo modo por toque sirve como alternativa accesible para quien no puede
// arrastrar, sin necesidad de detectar el dispositivo. Cada elemento se puede ubicar en VARIOS
// grupos a la vez: se clona al soltarlo, nunca se consume ni desaparece del banco.
export function MatchingControl({ items, targets, pairs, onChange, color, disabled, sceneImage, sceneCaption }: {
  items: SurveyOption[]
  targets: MatchingTarget[]
  pairs: Record<string, string[]>
  onChange(pairs: Record<string, string[]>): void
  color: string
  disabled?: boolean
  sceneImage?: string
  sceneCaption?: string
}) {
  const [armedId, setArmedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overTarget, setOverTarget] = useState<string | null>(null)

  function placementsOf(itemId: string): string[] {
    return pairs[itemId] || []
  }

  function assign(itemId: string, targetId: string) {
    const current = placementsOf(itemId)
    if (current.includes(targetId)) return
    onChange({ ...pairs, [itemId]: [...current, targetId] })
    setArmedId(null)
  }

  function unassign(itemId: string, targetId: string) {
    const next = placementsOf(itemId).filter(id => id !== targetId)
    if (next.length) onChange({ ...pairs, [itemId]: next })
    else { const rest = { ...pairs }; delete rest[itemId]; onChange(rest) }
  }

  function poolChip(item: SurveyOption) {
    const armed = armedId === item.id
    const placedCount = placementsOf(item.id).length
    const mark = item.emoji || leadingMark(item.label)
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
        animate={draggingId === item.id ? { scale: 1.06, rotate: -3, y: -3 } : { scale: 1, rotate: 0, y: 0 }}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="survey-matching-chip-image" />
        ) : (
          <span className="survey-matching-chip-dot" style={item.color ? { background: item.color } : undefined}>{mark}</span>
        )}
        <span>{item.label}</span>
        {placedCount > 0 && <span className="survey-matching-chip-count">{placedCount}</span>}
      </motion.button>
    )
  }

  function placedChip(item: SurveyOption, targetId: string) {
    const mark = item.emoji || leadingMark(item.label)
    return (
      <span key={item.id} className="survey-matching-chip is-placed">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="survey-matching-chip-image" />
        ) : (
          <span className="survey-matching-chip-dot" style={item.color ? { background: item.color } : undefined}>{mark}</span>
        )}
        <span>{item.label}</span>
        <span className="survey-matching-chip-remove" onClick={() => unassign(item.id, targetId)} role="button" aria-label="Quitar">
          <X size={11} />
        </span>
      </span>
    )
  }

  return (
    <div className="survey-matching">
      <div className="survey-matching-scene-row">
        {sceneImage && (
          <div className="survey-matching-scene">
            <div className="survey-matching-scene-orbit" />
            <img src={sceneImage} alt="" className="survey-matching-scene-image" />
            {sceneCaption && <span className="survey-matching-scene-caption">{sceneCaption}</span>}
          </div>
        )}
        <div className="survey-matching-pool-wrap">
          <p className="survey-matching-hint">Arrastra cada elemento a su grupo, o tócalo y luego toca el grupo. Un mismo elemento puede ir en varios grupos.</p>
          <div className="survey-matching-pool">
            {items.map(poolChip)}
          </div>
        </div>
      </div>
      <div className="survey-matching-targets">
        {targets.map(target => {
          const placedItems = items.filter(item => placementsOf(item.id).includes(target.id))
          const targetColor = target.color || color
          const TargetIcon = resolveLineIcon(target.icon)
          return (
            <div
              key={target.id}
              className={`survey-matching-target ${overTarget === target.id ? 'is-over' : ''}`}
              style={{
                borderTopColor: targetColor,
                ...(overTarget === target.id ? { borderColor: targetColor, boxShadow: `0 0 0 4px ${targetColor}22` } : {}),
              }}
              onDragOver={event => { event.preventDefault(); setOverTarget(target.id) }}
              onDragLeave={() => setOverTarget(current => current === target.id ? null : current)}
              onDrop={event => { event.preventDefault(); setOverTarget(null); if (draggingId) assign(draggingId, target.id) }}
              onClick={() => { if (armedId) assign(armedId, target.id) }}
            >
              <h4 style={{ backgroundImage: `linear-gradient(135deg, ${targetColor}, ${targetColor}cc)` }}>
                <span className="survey-matching-target-icon"><TargetIcon size={18} /></span>
                <span className="survey-matching-target-heading">
                  <span className="survey-matching-target-eyebrow">Línea</span>
                  {target.label}
                </span>
              </h4>
              <div className="survey-matching-target-body">
                {target.badge && (
                  <span className="survey-matching-target-badge" style={{ background: `${targetColor}1a`, color: targetColor }}>{target.badge}</span>
                )}
                {placedItems.length
                  ? placedItems.map(item => placedChip(item, target.id))
                  : <span className="survey-matching-target-empty">Suelta aquí</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
