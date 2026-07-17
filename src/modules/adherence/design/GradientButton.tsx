import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Gradiente propio del modulo de Matrices de Adherencia para acciones primarias — el mismo violeta
// de la paleta armonica de 11 modulos (--m-matrices), no un indigo suelto sin relacion.
export const MODULE_GRADIENT = 'linear-gradient(135deg, #8156c0, #a682e1)'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'primary' | 'ghost' }

export function GradientButton({ children, variant = 'primary', className = '', style, ...props }: Props) {
  if (variant === 'ghost') {
    return <button className={`gradient-button gradient-button-ghost ${className}`} {...props}>{children}</button>
  }
  return (
    <button
      className={`gradient-button gradient-button-primary ${className}`}
      style={{ backgroundImage: MODULE_GRADIENT, ...style }}
      {...props}
    >
      {children}
    </button>
  )
}
