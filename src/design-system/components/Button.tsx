import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { DEFAULT_MODULE_IDENTITY, type ModuleIdentity } from '../tokens'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: Variant
  /** Identidad de modulo para el gradiente del boton primary. Nunca color solido generico de marca. */
  identity?: ModuleIdentity
}

export function Button({ children, variant = 'primary', identity = DEFAULT_MODULE_IDENTITY, className = '', style, ...props }: Props) {
  if (variant === 'primary') {
    return (
      <button
        className={`ds-button ds-button-primary ${className}`}
        style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})`, ...style }}
        {...props}
      >
        {children}
      </button>
    )
  }
  return <button className={`ds-button ds-button-${variant} ${className}`} style={style} {...props}>{children}</button>
}
