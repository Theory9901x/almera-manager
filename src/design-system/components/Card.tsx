import type { HTMLAttributes, ReactNode } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Franja superior de acento (color de identidad del modulo). Un solo nivel de contenedor: nunca anidar Card dentro de Card. */
  accent?: string
}

export function Card({ children, accent, className = '', ...props }: Props) {
  return (
    <div className={`ds-card ${accent ? 'ds-card-accent' : ''} ${className}`} style={accent ? { ['--ds-accent' as string]: accent } : undefined} {...props}>
      {children}
    </div>
  )
}
