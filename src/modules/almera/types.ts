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

export type AssistanceStatus = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA' | 'VENCIDA' | 'CANCELADA'
export interface CatalogProcess { id:string;code:string;name:string;classification:string }
export interface CatalogModule { id:string;code:string;name:string }
export interface AlmeraCatalogs { processes:CatalogProcess[]; modules:CatalogModule[]; responsibles:{id:string;full_name:string}[] }

export interface Assistance {
  id:string
  code:string
  subject:string
  process_id:string
  process_name:string
  process_code?:string
  almera_module_id:string
  module_name:string
  requester_name:string
  requester_position?:string
  requester_contact?:string
  requester_channel?:string
  description:string
  general_observations?:string
  final_solution?:string
  closed_at?:string
  priority:'BAJA'|'MEDIA'|'ALTA'|'CRITICA'
  status:string
  effective_status:AssistanceStatus
  completion_percent:number
  received_at:string
  commitment_at?:string
  responsible_membership_id?:string
  responsible_name?:string
  overdue:boolean
  due_soon:boolean
  days_remaining?:number
}

export interface AssistanceDashboard {
  summary:{total:number;pending:number;in_progress:number;completed:number;overdue:number;due_soon:number;average_completion:string}
  byModule:{id:string;name:string;total:number;average_completion:string}[]
  byProcess:{id:string;name:string;total:number;average_completion:string}[]
}

export interface AssistanceFilters { q?:string;status?:string;processId?:string;moduleId?:string;dateFrom?:string;dateTo?:string }
export interface AssistanceMetrics { total:number;open:number;completed:number;overdue:number;compliance:string }
export interface AssistanceDetail {
  assistance:Assistance
  actions:{id:string;performed_at:string;performed_by:string;description:string;result:string;observations:string;new_status?:string;completion_percent?:number}[]
  evidences:{id:string;original_name:string;mime_type:string;size_bytes:number;description:string;uploaded_by:string;created_at:string}[]
  history:{id:string;action:string;changes:Record<string,unknown>;actor_name:string;created_at:string}[]
}
