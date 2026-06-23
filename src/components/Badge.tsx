type Variant = 'verde' | 'amarillo' | 'rojo' | 'gris' | 'azul'

interface Props {
  children: React.ReactNode
  variant?: Variant
}

export default function Badge({ children, variant = 'gris' }: Props) {
  return <span className={`badge-${variant}`}>{children}</span>
}

// Helpers semánticos para estados comunes
export function badgeEstadoIndicador(estado: string) {
  const map: Record<string, Variant> = {
    al_dia: 'verde', en_riesgo: 'amarillo', critico: 'rojo'
  }
  return map[estado] ?? 'gris'
}

export function badgeEstadoTarea(estado: string) {
  const map: Record<string, Variant> = {
    pendiente: 'amarillo', en_curso: 'azul', completada: 'verde'
  }
  return map[estado] ?? 'gris'
}

export function badgePrioridad(prioridad: string) {
  const map: Record<string, Variant> = {
    alta: 'rojo', media: 'amarillo', baja: 'verde'
  }
  return map[prioridad] ?? 'gris'
}
