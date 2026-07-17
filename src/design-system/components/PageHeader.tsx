import type { ReactNode } from 'react'
import { DEFAULT_MODULE_IDENTITY, type ModuleIdentity } from '../tokens'

// Cabecera comun a todo modulo: titulo grande con jerarquia tipografica propia + badge de
// modulo integrado (ya no una franja/rayita decorativa separada — ver ds-eyebrow en index.css).
export function PageHeader({ eyebrow, title, description, actions, identity = DEFAULT_MODULE_IDENTITY }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  identity?: ModuleIdentity
}) {
  return (
    <header className="ds-page-header">
      <div>
        {eyebrow && <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: identity.color }}>{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="ds-page-header-description">{description}</p>}
      </div>
      {actions && <div className="ds-page-header-actions">{actions}</div>}
    </header>
  )
}
