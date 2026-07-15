import type { ReactNode } from 'react'

// Tabla plana — un solo nivel, sin tarjeta por fila. El contenedor scrollea horizontal si hace falta.
export function Table({ children }: { children: ReactNode }) {
  return <div className="ds-table-wrap"><table className="ds-table">{children}</table></div>
}
