import type { ReactNode } from 'react'
import { DEFAULT_MODULE_IDENTITY, type ModuleIdentity } from '../tokens'

// Cabecera comun a todo modulo: titulo + descripcion + franja de acento del color de identidad.
// La franja es lo que diferencia visualmente un modulo de otro a simple vista.
export function PageHeader({ eyebrow, title, description, actions, identity = DEFAULT_MODULE_IDENTITY }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  identity?: ModuleIdentity
}) {
  return (
    <header className="ds-page-header" style={{ ['--ds-accent-from' as string]: identity.gradientFrom, ['--ds-accent-to' as string]: identity.gradientTo }}>
      <div>
        {eyebrow && <p className="ds-eyebrow" style={{ color: identity.color }}>{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="ds-page-header-description">{description}</p>}
      </div>
      {actions && <div className="ds-page-header-actions">{actions}</div>}
    </header>
  )
}
