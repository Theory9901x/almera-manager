import type { ReactNode } from 'react'

// Header de identidad por modulo — mismo componente en todo el sistema (Inicio, Asistencias
// Tecnicas, Adherencia...). El unico parametro que cambia entre modulos es `accent`; estructura,
// tipografia y tratamiento son siempre los mismos, para que se reconozcan como el mismo sistema.
export function ModuleHero({ badge, title, subtitle, accent, actions, className, children }: {
  badge: string
  title: string
  subtitle?: string
  accent: string
  actions?: ReactNode
  /** Clase extra opcional (ej. "matrices-hero") para variantes mas ricas — textura, etc. — que
    * heredan esta misma estructura base en vez de duplicarla. */
  className?: string
  /** Contenido opcional debajo del subtitulo — ej. metricas en vivo del modulo. */
  children?: ReactNode
}) {
  return (
    <div className={`module-hero ${className || ''}`} style={{ ['--module-accent' as string]: accent }}>
      <div className="module-hero-top">
        <div className="min-w-0">
          <span className="module-hero-badge">{badge}</span>
          <h1 className="module-hero-title">{title}</h1>
          {subtitle && <p className="module-hero-sub">{subtitle}</p>}
          {children}
        </div>
        {actions && <div className="module-hero-actions">{actions}</div>}
      </div>
    </div>
  )
}
