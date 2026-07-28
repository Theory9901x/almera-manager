// Escala fija de todo el modulo. No es configurable por lista: ver docs/MODULO-LISTAS-DE-CHEQUEO.md.
export type ChecklistValue = 'C' | 'NC' | 'NA'

export const CHECKLIST_VALUE_LABELS: Record<ChecklistValue, string> = {
  C: 'Cumple',
  NC: 'No cumple',
  NA: 'No aplica',
}

export type ChecklistFieldType = 'TEXT' | 'LONG_TEXT' | 'DATE' | 'NUMBER' | 'SELECT'
export type ChecklistStatus = 'BORRADOR' | 'PUBLICADA' | 'ARCHIVADA'

export interface ChecklistArea {
  id: string
  /** Centro de atención. El mismo servicio existe en varias sedes. */
  center: string
  name: string
  active: boolean
}

export interface ChecklistField {
  id: string
  label: string
  field_type: ChecklistFieldType
  options: string[]
  required: boolean
  order_index: number
}

export interface ChecklistCriterion {
  id: string
  domain_id: string
  item_number: string
  text: string
  guidance: string
  order_index: number
  active: boolean
}

export interface ChecklistDomain {
  id: string
  template_id: string
  name: string
  order_index: number
  criteria: ChecklistCriterion[]
}

/** Programa institucional al que pertenece una lista (Seguridad del Paciente, …).
 *  Distinto de `ChecklistArea`, que es el servicio DONDE se hace la ronda. */
export interface ChecklistProgram {
  id: string
  name: string
  description: string
  order_index: number
  active: boolean
  template_count: number
}

export interface ChecklistTemplate {
  id: string
  area_id: string | null
  area_name?: string | null
  program_id?: string | null
  program_name?: string | null
  code: string
  version: string
  name: string
  description: string
  subject_label: string
  numbered_items: boolean
  status: ChecklistStatus
  created_by_name?: string
  domain_count?: number
  criteria_count?: number
  created_at: string
  updated_at: string
}

export interface ChecklistTemplateDetail extends ChecklistTemplate {
  headerFields: ChecklistField[]
  subjectFields: ChecklistField[]
  domains: ChecklistDomain[]
}

// Resultado del motor de adherencia. `percent` en null = "sin dato" (todo NA), nunca 0%.
export interface AdherenceTally {
  c: number
  nc: number
  na: number
  applicable: number
  percent: number | null
}

export interface AdherenceResult {
  overall: AdherenceTally
  byDomain: (AdherenceTally & { domainId: string })[]
  byCriterion: (AdherenceTally & { criterionId: string; domainId: string })[]
  bySubject: (AdherenceTally & { subjectId: string })[]
  expected: number
  answered: number
  pending: number
  complete: boolean
  concept: string | null
}

// ---- Fase 2: diligenciamiento ----

export type AuditStatus = 'BORRADOR' | 'CERRADA'

export interface ChecklistMembership {
  id: string
  full_name: string
  email: string
  role_name: string
}

/** Lista publicada que el usuario actual puede diligenciar. */
export interface AssignedTemplate {
  id: string
  code: string
  version: string
  name: string
  subject_label: string
  numbered_items: boolean
  area_name: string | null
  /** Solo lo ve quien administra: a un auditor nunca le llega una lista sin publicar. */
  status?: ChecklistStatus
}

/** Sujeto del directorio reutilizable (se registra una vez y se trae en rondas siguientes). */
export interface DirectorySubject {
  id: string
  display_name: string
  attributes: Record<string, string>
  template_id: string | null
}

/** Sujeto ya incorporado a una auditoría, con el snapshot de sus atributos ese día. */
export interface AuditSubject {
  id: string
  subject_id: string | null
  display_name: string
  attributes_snapshot: Record<string, string>
  order_index: number
  /** Usuario del sistema enlazado al sujeto del directorio; preselecciona al responsable del
   *  plan de mejora. Nulo = sujeto sin cuenta (un paciente, o un colaborador aún no enlazado). */
  linked_membership_id?: string | null
}

export interface ChecklistAnswer {
  id: string
  audit_subject_id: string
  criterion_id: string
  value: ChecklistValue
  observation: string
}

export interface AuditSummary {
  id: string
  audit_date: string
  shift?: string | null
  status: AuditStatus
  adherence_percent: number | null
  concept: string | null
  template_name: string
  code: string
  area_name: string | null
  auditor_name: string
  subject_count: number
}

/** Una entrada de la bitácora. Sobrevive al borrado de la auditoría, por eso guarda el texto. */
export interface AuditLogEntry {
  id: string
  audit_id: string | null
  audit_label: string
  action: 'CREADA' | 'EDITADA' | 'CERRADA' | 'REABIERTA' | 'ELIMINADA'
  detail: string
  actor_name: string
  created_at: string
}

// ---- Fase 4: analítica ----

/** Fila agregada. `percent` en null = nada aplicable (todo NA), nunca 0 %. */
export interface AnalyticsRow {
  id?: string
  name?: string
  period?: string
  text?: string
  template_name?: string
  audits?: number
  c: number
  nc: number
  na: number
  applicable: number
  percent: number | null
}

export interface AnalyticsSummary {
  auditCount: number
  overall: { c: number; nc: number; na: number; percent: number | null }
  byTemplate: AnalyticsRow[]
  byArea: AnalyticsRow[]
  byDomain: AnalyticsRow[]
  byMonth: AnalyticsRow[]
  worstCriteria: AnalyticsRow[]
}

export interface AnalyticsFilters {
  templateId?: string
  areaId?: string
  dateFrom?: string
  dateTo?: string
}

/** Lista institucional disponible para importar (fase 5). */
export interface SeedTemplate {
  code: string
  version: string
  name: string
  subjectLabel: string
  domains: number
  criteria: number
  imported: boolean
}

export interface ChecklistSignature {
  id: string
  signer_name: string
  signer_role: string
  signature_image: string
  signed_at: string
}

/** Firmante ya usado antes en la entidad; el directorio se deriva del historial de firmas. */
export interface SignerSuggestion {
  signer_name: string
  signer_role: string
}

export interface AuditDetail {
  id: string
  shift: string | null
  template_id: string
  /** Código y versión CONGELADOS el día de la ronda: identifican el formato aunque la lista
   *  cambie de versión después. */
  template_code?: string
  template_version?: string
  template_name: string
  code: string
  version: string
  subject_label: string
  numbered_items: boolean
  area_name: string | null
  auditor_name: string
  audit_date: string
  status: AuditStatus
  header_values: Record<string, string>
  adherence_percent: number | null
  concept: string | null
  headerFields: ChecklistField[]
  subjectFields: ChecklistField[]
  domains: ChecklistDomain[]
  subjects: AuditSubject[]
  answers: ChecklistAnswer[]
  signatures: ChecklistSignature[]
  evidences: ChecklistEvidence[]
  /** Personal de turno de la ronda. Lista, no campo de texto: pueden ser varios. */
  staff: { id: string; full_name: string; role: string; order_index: number }[]
  notes: string
  /** Planes de mejora ya creados sobre hallazgos de esta ronda. */
  plans: ActionPlan[]
  adherence: AdherenceResult
  /** Solo al reabrir: cuántas firmas se invalidaron por volver a editar la auditoría. */
  invalidatedSignatures?: number
}

// ---- Centro de datos ----

export interface DataCenterFilters {
  templateId?: string
  areaId?: string
  /** Centro de atención (sede): recorta a todos los servicios de esa sede. */
  center?: string
  auditorId?: string
  domainId?: string
  shift?: string
  dateFrom?: string
  dateTo?: string
  /** Recorte por nivel: "solo por debajo de N %". */
  maxPercent?: string
  minPercent?: string
  /** Agrupación de la serie temporal. */
  period?: string
}

export interface DataCenterRow {
  id?: string
  name?: string
  /** A quién se auditó en esa lista (Paciente / Colaborador / …). Separa las vistas dedicadas. */
  subject_label?: string
  /** Sujetos evaluados de la ronda, ya concatenados por el servidor. */
  subjects?: string | null
  area_center?: string | null
  period?: string
  text?: string
  item_number?: string
  domain_name?: string
  template_name?: string
  template_code?: string
  area_name?: string | null
  auditor_name?: string
  audit_date?: string
  shift?: string | null
  concept?: string | null
  audits?: number
  c: number
  nc: number
  na: number
  applicable: number
  /** null = nada aplicable (todo NA). Nunca 0 %. */
  percent: number | null
}

export interface DataCenter {
  overall: { c: number; nc: number; na: number; percent: number | null; concept: string | null }
  /** Reparto por estado. Cuenta TODAS, también las que siguen en borrador. */
  statusMix: { status: string; n: number }[]
  /** Ventana anterior de igual longitud. `null` si no se filtró por fechas: sin rango, «el
   *  período anterior» no existe y cualquier número sería inventado. */
  previous: { from: string; to: string; percent: number | null; audits: number } | null
  kpis: {
    audits: number; areas: number; subjects: number; auditors: number; criticalCriteria: number
    /** Dias con al menos una ronda en el recorte: alimenta «listas por dia». */
    activeDays: number
    /** Duracion promedio creada -> cerrada, en segundos. Nulo si nada cerrado. */
    avgSeconds: number | null
    plansOpen: number
    plansClosed: number
  }
  byAudit: DataCenterRow[]
  byAuditor: DataCenterRow[]
  bySubject: DataCenterRow[]
  byDate: DataCenterRow[]
  byArea: DataCenterRow[]
  byDomain: DataCenterRow[]
  byCriterion: DataCenterRow[]
}

export interface DataCenterOptions {
  templates: { id: string; name: string; code: string }[]
  /** Catálogo COMPLETO de servicios activos, con su centro; no solo los que ya tienen rondas. */
  areas: { id: string; name: string; center: string }[]
  /** Centros únicos, en orden institucional (HOCY primero). */
  centers: string[]
  auditors: { id: string; name: string }[]
  shifts: string[]
  domains: { id: string; name: string }[]
}

// ---- Repositorio de auditorías ----

export interface RepositoryFilters {
  dateFrom?: string
  dateTo?: string
  areaId?: string
  /** Centro de atención (sede). */
  center?: string
  templateId?: string
  auditorId?: string
  /** Nombre, documento o cualquier atributo del sujeto (cama, documento…). */
  subject?: string
  /** Busca en los valores de la cabecera (responsable, personal de turno…). */
  staff?: string
  shift?: string
  status?: string
  maxPercent?: string
  page?: string
  size?: string
}

export interface RepositoryRow {
  id: string
  audit_date: string
  shift: string | null
  status: AuditStatus
  adherence_percent: number | null
  concept: string | null
  template_code: string
  template_version: string
  template_name: string
  subject_label: string
  area_name: string
  auditor_name: string
  signature_count: number
  subject_count: number
  subjects: string | null
}

export interface RepositoryPage {
  rows: RepositoryRow[]
  total: number
  page: number
  size: number
  pages: number
}

// ---- Planes de mejora ----

/** Circuito: ABIERTO → EN_PROCESO (primera evidencia) → SUBSANADO (colaborador) → CERRADO
 *  (calidad, y nunca la misma persona que subsanó — lo valida el servidor). */
export type ActionPlanStatus = 'ABIERTO' | 'EN_PROCESO' | 'SUBSANADO' | 'CERRADO'

export const PLAN_STATUS_LABELS: Record<ActionPlanStatus, string> = {
  // "Pendiente", no "Abierto": es como lo nombra el flujo acordado — el plan queda pendiente
  // hasta que el responsable entra y carga lo suyo.
  ABIERTO: 'Pendiente',
  EN_PROCESO: 'En proceso',
  SUBSANADO: 'Subsanado',
  CERRADO: 'Cerrado',
}

/** Notificación interna del circuito de planes. */
export interface PlanNotification {
  id: string
  plan_id: string | null
  message: string
  read: boolean
  created_at: string
}

/** Plan resumido, como aparece en el listado y en la ronda. */
export interface ActionPlan {
  id: string
  /** Nombre del plan (además del código PM-<id>). */
  title: string
  /** Fecha comprometida para el plan; nula si no se fijó. */
  due_date: string | null
  audit_id: string
  criterion_id: string | null
  audit_subject_id: string | null
  criterion_text: string
  domain_name: string
  item_number: string
  subject_name: string
  finding: string
  assigned_membership_id: string | null
  assigned_name: string
  status: ActionPlanStatus
  audit_date?: string
  template_code?: string
  template_name?: string
  area_name?: string
  area_center?: string | null
  auditor_name?: string
  evidence_count?: number
  resolution_note: string
  closing_note: string
  resolved_at: string | null
  closed_at: string | null
  created_at: string
}

export interface ActionEvidence {
  id: string
  original_name: string
  mime_type: string
  size_bytes: number
  note: string
  uploaded_by_name: string | null
  created_at: string
}

export interface ActionLogEntry {
  id: string
  action: 'CREADO' | 'EDITADO' | 'REASIGNADO' | 'EVIDENCIA' | 'SUBSANADO' | 'DEVUELTO' | 'CERRADO' | 'ELIMINADO'
  detail: string
  actor_name: string
  created_at: string
}

export interface ActionPlanDetail extends ActionPlan {
  resolved_by_name: string | null
  closed_by_name: string | null
  created_by_name: string
  /** Auditor de la ronda: es quien verifica y cierra el plan (además de calidad). */
  auditor_id?: string
  /** Nombre actual del usuario de la membresía asignada (puede diferir del snapshot). */
  assigned_user_name?: string | null
  evidences: ActionEvidence[]
  log: ActionLogEntry[]
}

/** Posible responsable de un plan (membresía activa de la entidad). */
export interface PlanAssignee {
  id: string
  full_name: string
  email: string
}

/** Evidencia adjunta a una auditoría (foto o PDF). Solo se descarga por ruta autenticada. */
export interface ChecklistEvidence {
  id: string
  criterion_id: string | null
  audit_subject_id: string | null
  original_name: string
  mime_type: string
  size_bytes: number
  uploaded_by_name: string | null
  created_at: string
}

/** Dashboard (§15.2-15.4): el MISMO `DataCenter` mas lo que solo el dashboard mira. */
export interface ChecklistDashboard extends DataCenter {
  byProgram: (DataCenterRow & { series: { period: string; percent: number | null }[] })[]
  systemInfo: {
    openAudits: { id: string; audit_date: string; template_name: string; auditor_name: string; days_open: number }[]
    unusedTemplates: { id: string; code: string; name: string }[]
    idleAuditors: { name: string; assigned: number }[]
    /** NC de rondas cerradas que no tienen plan de mejora. El indicador que de verdad mueve. */
    findingsWithoutPlan: number
  }
  activity: AuditLogEntry[]
}
