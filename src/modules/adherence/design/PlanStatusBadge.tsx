import type { PlanStatus } from '../types'

const STYLES: Record<PlanStatus, { color: string; label: string }> = {
  NO_INICIADO: { color: '#94A3B8', label: 'No iniciado' },
  EN_EJECUCION: { color: '#65A30D', label: 'En ejecución' },
  TERMINADO: { color: '#059669', label: 'Terminado' },
}

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const style = STYLES[status]
  return (
    <span className="concept-badge" style={{ background: `${style.color}18`, color: style.color, borderColor: `${style.color}40` }}>
      <span className="concept-badge-dot" style={{ background: style.color }} />
      {style.label}
    </span>
  )
}
