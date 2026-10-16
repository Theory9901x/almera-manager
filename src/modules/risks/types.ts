import type { Assessment, RiskTypeKey, TreatmentKey, ZoneKey } from '../../../shared/riskScoring.mjs'

export type { Assessment, RiskTypeKey, TreatmentKey, ZoneKey }

export interface RiskMap { id: string; name: string; year: number; description: string; active: boolean; risks_count: number }
export interface RiskProcess { id: string; code: string; name: string; classification: string }
export interface RiskClass { id: string; name: string; color: string; active: boolean; order_index: number }
export interface Responsible { id: string; full_name: string }
export interface RiskCatalogs { maps: RiskMap[]; processes: RiskProcess[]; classes: RiskClass[]; responsibles: Responsible[] }

export interface RiskRow {
  id: string
  map_id: string
  process_id: string
  process_code: string
  process_name: string
  code: string
  sequence: number
  risk_type: RiskTypeKey
  class_id: string | null
  class_name: string | null
  class_color: string | null
  typology: string
  impact_statement: string
  cause_immediate: string
  cause_root: string
  description: string
  consequences: string
  process_objective: string
  asset: string
  threat: string
  vulnerability: string
  cia: string[]
  exposure_per_year: string | null
  inherent_probability: number | null
  inherent_impact: number | null
  impact_criterion: '' | 'ECONOMICO' | 'REPUTACIONAL' | 'SALUD'
  corruption_answers: boolean[]
  treatment: TreatmentKey | null
  treatment_justification: string
  owner_membership_id: string | null
  owner_name: string
  owner_label: string
  status: 'ACTIVO' | 'RETIRADO'
  map_name: string
  map_year: number
  created_at: string
  updated_at: string
  controls_count: number
  controls_ineffective: number
  assessment: Assessment
  actions: { total: number; open: number; overdue: number; progress: number }
  materializations: { total: number; open: number; last_at: string | null }
  last_review: { created_at: string; defense_line: DefenseLine; conclusion: ReviewConclusion; period_label: string } | null
}

export type DefenseLine = 'PRIMERA' | 'SEGUNDA' | 'TERCERA'
export type ReviewConclusion = 'ADECUADO' | 'REQUIERE_AJUSTES' | 'CRITICO'
export type TestResult = 'EFECTIVO' | 'PARCIAL' | 'NO_EFECTIVO'
export type ActionStatus = 'PENDIENTE' | 'EN_CURSO' | 'TERMINADA' | 'CANCELADA'
export type MaterializationStatus = 'REPORTADA' | 'EN_ANALISIS' | 'EN_TRATAMIENTO' | 'CERRADA'

export interface RiskCause { id: string; risk_id: string; kind: 'RAIZ' | 'INMEDIATA'; description: string; order_index: number }
export interface ControlTest { id: string; control_id: string; tested_at: string; result: TestResult; defense_line: DefenseLine; observations: string; tester_name: string | null; created_at: string }
export interface RiskControl {
  id: string
  risk_id: string
  cause_id: string | null
  description: string
  responsible: string
  control_type: 'PREVENTIVO' | 'DETECTIVO' | 'CORRECTIVO'
  implementation: 'AUTOMATICO' | 'MANUAL'
  documentation: 'DOCUMENTADO' | 'SIN_DOCUMENTAR'
  frequency: 'CONTINUA' | 'ALEATORIA'
  evidence: 'CON_REGISTRO' | 'SIN_REGISTRO'
  active: boolean
  order_index: number
  last_test_result: TestResult | null
  last_tested_at: string | null
  weight: number
  strength: { key: 'FUERTE' | 'MODERADO' | 'DEBIL'; name: string }
  tests: ControlTest[]
}
export interface RiskAction {
  id: string
  code: string
  risk_id: string
  materialization_id: string | null
  kind: 'TRATAMIENTO' | 'CORRECTIVA'
  description: string
  responsible_membership_id: string | null
  responsible_name: string
  responsible_label: string
  start_date: string | null
  due_date: string | null
  status: ActionStatus
  progress: number
  evidence: string
  completed_at: string | null
  overdue: boolean
  // Solo en el listado global
  risk_code?: string
  risk_description?: string
  risk_type?: RiskTypeKey
  process_name?: string
  materialization_code?: string | null
}
export interface Materialization {
  id: string
  code: string
  risk_id: string
  occurred_at: string
  detected_at: string | null
  description: string
  consequences: string
  economic_loss: string | null
  affected_people: number | null
  actual_impact: number | null
  root_cause: string
  failed_control_ids: string[]
  immediate_correction: string
  notified_parties: string[]
  status: MaterializationStatus
  prev_probability: number | null
  prev_impact: number | null
  new_probability: number | null
  new_impact: number | null
  revalued_at: string | null
  revaluation_note: string
  closure_notes: string
  closed_at: string | null
  reported_by_name: string | null
  closed_by_name?: string | null
  created_at: string
  // Solo en el listado global
  risk_code?: string
  risk_description?: string
  risk_type?: RiskTypeKey
  process_name?: string
  actions_total?: number
  actions_done?: number
}
export interface RiskReview { id: string; defense_line: DefenseLine; period_label: string; conclusion: ReviewConclusion; observations: string; author_name: string | null; created_at: string }
export interface RiskActivity { id: string; action: string; detail: string; actor_name: string | null; created_at: string }

export interface RiskDetail {
  risk: RiskRow
  causes: RiskCause[]
  controls: RiskControl[]
  actions: RiskAction[]
  materializations: Materialization[]
  reviews: RiskReview[]
  activity: RiskActivity[]
}

export interface HeatChip { id: string; code: string; type: RiskTypeKey }
export type HeatGrid = Record<string, Record<string, HeatChip[]>>

export interface RiskDashboard {
  mapId: string | null
  empty?: boolean
  kpis: {
    total: number
    valued: number
    byType: { type: RiskTypeKey; value: number }[]
    highInherent: number
    highResidual: number
    extremeResidual: number
    avgReduction: number
    controls: number
    controlsByStrength: { FUERTE: number; MODERADO: number; DEBIL: number }
    controlsTested: number
    controlsIneffective: number
    withoutControls: number
    withoutPlan: number
    withoutTreatment: number
    reviewedThisPeriod: number
    currentPeriod: string
    movement: { lowered: number; same: number }
    materializations: { total: number; risks: number; loss: number; open: number }
    actions: { total: number; done: number; open: number; overdue: number; progress: number }
  }
  zones: { inherent: { zone: ZoneKey; value: number }[]; residual: { zone: ZoneKey; value: number }[] }
  heat: { inherent: HeatGrid; residual: HeatGrid }
  byProcess: { processId: string; code: string; name: string; total: number; high: number; worst: ZoneKey | null; materialized: number; zones: Record<ZoneKey, number> }[]
  materializationTimeline: { month: string; total: number }[]
  materializationStatus: { status: MaterializationStatus; total: number }[]
  topRisks: { id: string; code: string; description: string; process_name: string; risk_type: RiskTypeKey; assessment: Assessment; materializations: { total: number; open: number } }[]
}

export interface RiskFilters { mapId?: string; processId?: string; riskType?: string; classId?: string; zone?: string; inherentZone?: string; treatment?: string; q?: string; status?: string }
