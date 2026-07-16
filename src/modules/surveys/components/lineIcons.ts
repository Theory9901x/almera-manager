import { HeartHandshake, Leaf, HeartPulse, Store, Tag, type LucideIcon } from 'lucide-react'

// Catalogo reducido de iconos para tarjetas de linea/grupo (Recurso 2 del estilo "RedSalud").
// Se referencia por nombre desde la configuracion (target.icon / question.config.cardAccent.icon)
// para no acoplar el tipo de dato a un componente de React.
const LINE_ICONS: Record<string, LucideIcon> = {
  'heart-handshake': HeartHandshake,
  leaf: Leaf,
  'heart-pulse': HeartPulse,
  store: Store,
}

export function resolveLineIcon(name: string | undefined): LucideIcon {
  return (name && LINE_ICONS[name]) || Tag
}
