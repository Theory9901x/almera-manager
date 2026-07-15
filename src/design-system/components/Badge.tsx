import type { ReactNode } from 'react'
import { SEMAPHORE_COLORS, SEMAPHORE_LABELS, type SemaphoreLevel } from '../tokens'

type NeutralTone = 'neutral' | 'info'

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: NeutralTone }) {
  return <span className={`ds-badge ds-badge-${tone}`}>{children}</span>
}

/** Badge de semaforo — el unico vocabulario de color para "que tan bien va algo" en toda la plataforma. */
export function SemaphoreBadge({ level, size = 'md' }: { level: SemaphoreLevel | null; size?: 'sm' | 'md' }) {
  if (!level) {
    return (
      <span className={`ds-badge-semaphore ds-badge-semaphore-empty ds-badge-semaphore-${size}`}>
        <span className="ds-badge-semaphore-dot" style={{ border: '1.5px dashed #CBD5E1', background: 'transparent' }} />
        Sin dato
      </span>
    )
  }
  const color = SEMAPHORE_COLORS[level]
  return (
    <span className={`ds-badge-semaphore ds-badge-semaphore-${size}`} style={{ background: `${color}18`, color, borderColor: `${color}40` }}>
      <span className="ds-badge-semaphore-dot" style={{ background: color }} />
      {SEMAPHORE_LABELS[level]}
    </span>
  )
}
