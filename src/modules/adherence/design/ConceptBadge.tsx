import { CONCEPT_COLORS, CONCEPT_LABELS, type Concept } from './scopeColors'

export function ConceptBadge({ concept, size = 'md' }: { concept: Concept | null; size?: 'sm' | 'md' }) {
  if (!concept) {
    return (
      <span className={`concept-badge concept-badge-empty concept-badge-${size}`}>
        <span className="concept-badge-dot concept-badge-dot-empty" />
        Sin calificar
      </span>
    )
  }
  const color = CONCEPT_COLORS[concept]
  return (
    <span className={`concept-badge concept-badge-${size}`} style={{ background: `${color}18`, color, borderColor: `${color}40` }}>
      <span className="concept-badge-dot" style={{ background: color }} />
      {CONCEPT_LABELS[concept]}
    </span>
  )
}
