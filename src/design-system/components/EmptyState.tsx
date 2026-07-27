import type { ComponentType, ReactNode } from 'react'

export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: ComponentType<{ size?: number | string }>
  title: string
  description?: string
  /** Salida del callejon. Cuando el vacio tiene arreglo, el boton va dentro del estado vacio y
   *  no suelto al lado: ahi es donde el usuario esta mirando. */
  action?: ReactNode
}) {
  return (
    <div className="ds-empty-state">
      {Icon && <Icon size={30} />}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div className="ds-empty-state-action">{action}</div>}
    </div>
  )
}
