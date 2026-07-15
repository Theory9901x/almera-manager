import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Gradiente propio del modulo de Matrices de Adherencia para acciones primarias — deliberadamente
// distinto del rojo institucional del resto de SGIMR (seccion 6.3 del prompt de diseno).
export const MODULE_GRADIENT = 'linear-gradient(135deg, #4F46E5, #7C3AED)'

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
