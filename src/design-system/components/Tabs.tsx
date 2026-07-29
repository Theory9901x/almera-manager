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
          // El acento va como VARIABLE, no como color en linea: un color en linea gana al CSS y
          // no se puede aclarar en tema oscuro, donde la identidad a luminosidad 0.55 se queda
          // en 3.2 de contraste sobre el fondo.
          style={active === item.key ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
