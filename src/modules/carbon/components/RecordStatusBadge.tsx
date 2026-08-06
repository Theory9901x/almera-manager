import { Badge } from '@/design-system'
import type { RecordStatus } from '../types'

const TONE: Record<RecordStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  BORRADOR: 'neutral', PENDIENTE: 'warning', VALIDADO: 'success', RECHAZADO: 'danger', PERIODO_CERRADO: 'info',
}
const LABEL: Record<RecordStatus, string> = {
  BORRADOR: 'Borrador', PENDIENTE: 'Pendiente de revisión', VALIDADO: 'Validado', RECHAZADO: 'Rechazado', PERIODO_CERRADO: 'Periodo cerrado',
}

export function RecordStatusBadge({ status }: { status: RecordStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
}
