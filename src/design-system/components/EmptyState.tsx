import type { ComponentType } from 'react'

export function EmptyState({ icon: Icon, title, description }: { icon?: ComponentType<{ size?: number | string }>; title: string; description?: string }) {
  return (
    <div className="ds-empty-state">
      {Icon && <Icon size={30} />}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
    </div>
  )
}
