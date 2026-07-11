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

export interface AlmeraCatalogs { processes: {id:string;code:string;name:string;classification:string}[]; modules:{id:string;code:string;name:string}[]; responsibles:{id:string;full_name:string}[] }
export interface Assistance { id:string;code:string;subject:string;process_name:string;module_name:string;requester_name:string;priority:'BAJA'|'MEDIA'|'ALTA'|'CRITICA';status:string;received_at:string;commitment_at?:string;responsible_name?:string;overdue:boolean }
export interface AssistanceMetrics { total:number;open:number;completed:number;overdue:number;compliance:string }
