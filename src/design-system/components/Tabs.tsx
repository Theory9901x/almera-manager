import { DEFAULT_MODULE_IDENTITY, type ModuleIdentity } from '../tokens'

export interface TabItem { key: string; label: string }

// Tabs con subrayado del color de identidad del modulo — nunca fondo solido tipo pill.
export function Tabs({ items, active, onChange, identity = DEFAULT_MODULE_IDENTITY }: {
  items: TabItem[]
  active: string
  onChange(key: string): void
  identity?: ModuleIdentity
}) {
  return (
    <nav className="ds-tabs" aria-label="Secciones">
      {items.map(item => (
        <button
          key={item.key}
          className={`ds-tabs-item ${active === item.key ? 'is-active' : ''}`}
          style={active === item.key ? { color: identity.color, borderBottomColor: identity.color } : undefined}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
