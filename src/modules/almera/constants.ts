import type { AlmeraManagementType, AlmeraStatus } from './types'

export const ALMERA_STATUS_LABELS: Record<AlmeraStatus, string> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revision',
  APPROVED: 'Aprobado',
  RETURNED: 'Devuelto',
  CLOSED: 'Cerrado',
}

export const ALMERA_TYPE_LABELS: Record<AlmeraManagementType, string> = {
  CREACION: 'Creacion',
  MODIFICACION: 'Modificacion',
  ACTUALIZACION: 'Actualizacion',
  ELIMINACION: 'Eliminacion',
  REVISION: 'Revision',
  CAPACITACION: 'Capacitacion',
  SOPORTE: 'Soporte',
  INFORME: 'Informe',
}
