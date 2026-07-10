export type AlmeraStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'RETURNED' | 'CLOSED'
export type AlmeraManagementType = 'CREACION' | 'MODIFICACION' | 'ACTUALIZACION' | 'ELIMINACION' | 'REVISION' | 'CAPACITACION' | 'SOPORTE' | 'INFORME'

export interface AlmeraRecord {
  id: string
  request: string
  process: string
  document: string
  activity: string
  evidence: string
  report: string
  status: AlmeraStatus
  managementType: AlmeraManagementType
  responsible: string
  registeredAt: string
  closedAt?: string
  observations: string
}
