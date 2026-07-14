export type ProfessionalStatus = 'ACTIVE_INDEFINITE' | 'ACTIVE_ADAPTATION' | 'WITHDRAWN'

export interface Area {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
  matrix_version_id: string | null
  version_number: number | null
  scope_count: number
  criteria_count: number
  weight_total: number
}

export interface Scope {
  id: string
  matrix_version_id: string
  name: string
  order_index: number
  active: boolean
}

export interface Criterion {
  id: string
  matrix_version_id: string
  scope_id: string
  text: string
  weight: number
  order_index: number
  active: boolean
}

export interface AreaMatrix {
  area: { id: string; name: string }
  matrixVersionId: string
  versionNumber: number
  scopes: Scope[]
  criteria: Criterion[]
}

export interface Position {
  id: string
  name: string
  active: boolean
}

export interface Professional {
  id: string
  area_id: string
  area_name: string
  position_id: string
  position_name: string
  full_name: string
  document_id: string
  specialty: string
  status: ProfessionalStatus
  active: boolean
  created_at: string
  updated_at: string
}

export type EvaluationStatus = 'DRAFT' | 'CLOSED'
export type Score = 0 | 1 | 2 | null

export interface EvaluationSummary {
  id: string
  professional_id: string
  professional_name: string
  area_id: string
  area_name: string
  month_reported: string
  evaluation_date: string
  total_records: number
  overall_compliance: number | null
  concept: string | null
  status: EvaluationStatus
}

export interface Evaluation {
  id: string
  organization_id: string
  matrix_version_id: string
  professional_id: string
  professional_name: string
  document_id: string
  area_id: string
  area_name: string
  evaluator_membership_id: string
  service: string
  city_site: string
  professional_status_snapshot: string
  month_reported: string
  evaluation_date: string
  total_records: number
  overall_compliance: number | null
  concept: string | null
  general_observations: string
  commitments: string
  improvement_plan_percent: number | null
  evaluator_signed_name: string | null
  evaluator_signed_at: string | null
  professional_signed_name: string | null
  professional_signed_at: string | null
  status: EvaluationStatus
}

export interface EvaluationRecord {
  id: string
  evaluation_id: string
  record_number: string
  observations: string
}

export interface ScoreEntry {
  evaluation_record_id: string
  criterion_id: string
  score: Score
}

export interface CriterionResult {
  criterionId: string
  scopeId: string
  ab: number
  s: number
  compliancePercent: number | null
}

export interface ScopeResult {
  scopeId: string
  compliancePercent: number | null
}

export interface EvaluationDetail {
  evaluation: Evaluation
  scopes: Scope[]
  criteria: Criterion[]
  records: EvaluationRecord[]
  scores: ScoreEntry[]
  criterionResults: CriterionResult[]
  scopeResults: ScopeResult[]
  overallCompliance: number
}

export interface ScoreComputation {
  criterionResults: CriterionResult[]
  scopeResults: ScopeResult[]
  overallCompliance: number
  concept: string | null
}

export type ConceptKey = 'OPTIMO' | 'ACEPTABLE' | 'DEFICIENTE' | 'MUY_DEFICIENTE'

export interface Threshold {
  concept: ConceptKey
  min_percent: number
  order_index: number
}

export interface Auditor {
  membership_id: string
  full_name: string
  email: string
  role_name: string
  area_ids: string[]
}

export interface DashboardScopeItem {
  areaName: string
  scopeName: string
  averageCompliance: number
}

export interface DashboardProfessionalItem {
  professionalName: string
  areaName: string
  averageCompliance: number | null
  evaluationCount: number
}

export interface DashboardMonthItem {
  month: string
  averageCompliance: number | null
  evaluationCount: number
  firstDate: string
}

export interface Dashboard {
  totalEvaluations: number
  averageCompliance: number | null
  byConcept: Record<ConceptKey, number>
  byScope: DashboardScopeItem[]
  byProfessional: DashboardProfessionalItem[]
  byMonth: DashboardMonthItem[]
}
