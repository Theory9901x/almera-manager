import type { ComponentType, ReactNode } from 'react'
import { DEFAULT_MODULE_IDENTITY, type ModuleIdentity } from '../tokens'

export function StatCard({ icon: Icon, label, value, detail, identity = DEFAULT_MODULE_IDENTITY }: {
  icon?: ComponentType<{ size?: number | string }>
  label: string
  value: ReactNode
  detail?: string
  identity?: ModuleIdentity
}) {
  return (
    <div className="ds-card ds-stat-card">
      {Icon && (
        <span className="ds-stat-card-icon" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}>
          <Icon size={20} />
        </span>
      )}
      <div>
        <p className="ds-eyebrow">{label}</p>
        <strong className="ds-stat-card-value">{value}</strong>
        {detail && <span className="ds-stat-card-detail">{detail}</span>}
      </div>
    </div>
  )
}
