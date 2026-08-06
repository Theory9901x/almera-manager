export type IndicatorType = 'ENERGY' | 'WATER'
export type Periodicity = 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
export type RecordStatus = 'BORRADOR' | 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO' | 'PERIODO_CERRADO'
export type Semaphore = 'verde' | 'amarillo' | 'rojo' | 'sin-dato'

export interface Facility { id: string; code: string; name: string; active: boolean }

export interface Baseline {
  id: string
  facility_id: string
  indicator_type: IndicatorType
  source_type: 'LINEA_BASE_ANUAL' | 'PROMEDIO_MOVIL_12M'
  base_year: number
  intensity_base: number
  unit: string
  valid_from: string
  valid_to: string | null
  observations: string
  responsible_name: string
  status: 'BORRADOR' | 'VALIDADA'
}

export interface Target {
  id: string
  facility_id: string
  indicator_type: IndicatorType
  target_year: number
  target_proportional_percent: number
  tolerance_percent: number
  valid_from: string
  valid_to: string | null
  observations: string
  responsible_name: string
}

export interface EvidenceFile { id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string }

export interface ConsumptionRecord {
  id: string
  facility_id: string
  facility_name?: string
  indicator_type: IndicatorType
  year: number
  month: number
  quarter: number
  semester: number
  reading_start: string | null
  reading_end: string
  provider: string
  invoice_number: string
  meter_code: string
  meter_reading_start: number | null
  meter_reading_end: number | null
  consumption_value: number
  consumption_unit: string
  invoice_value: number | null
  attention_count: number
  responsible_name: string
  information_source: string
  notes: string
  status: RecordStatus
  rejection_reason: string
  is_outlier: boolean
  outlier_reason: string
  intensity_value: number | null
  baseline_intensity: number | null
  baseline_source: string | null
  expected_consumption: number | null
  proportional_index: number | null
  normalized_saving: number | null
  created_by_name?: string
  created_at: string
  evidence_count?: number
  evidence?: EvidenceFile[]
}

export interface ListResult<T> { rows: T[]; total: number; limit: number; offset: number }

export interface IndicatorSummary {
  consumptionTotal: number
  attentionTotal: number
  intensityValue: number | null
  expectedConsumption: number | null
  proportionalIndex: number | null
  normalizedSaving: number | null
  hasOutlier: boolean
  recordCount: number
  baselineLabel: string | null
  semaphore: Semaphore
  target: { proportionalPercent: number; tolerancePercent: number } | null
}

export interface MonthlyPoint {
  month: number
  energyConsumption: number | null
  energyAttentions: number | null
  energyIntensity: number | null
  waterConsumption: number | null
  waterAttentions: number | null
  waterIntensity: number | null
  waterIsOutlier: boolean
  energyIsOutlier: boolean
}

export interface DashboardData {
  facility: Facility | null
  year: number
  periodicity: Periodicity
  dateFrom: string
  dateTo: string
  energy: IndicatorSummary
  water: IndicatorSummary
  monthly: MonthlyPoint[]
  alertCount: number
  narrative: string
}

export interface IndicatorDetail {
  indicatorType: IndicatorType
  label: string
  unit: string
  facility: Facility
  periodicity: Periodicity
  periodKey: string
  dateFrom: string
  dateTo: string
  consumptionTotal: number
  attentionTotal: number
  intensityValue: number | null
  expectedConsumption: number | null
  proportionalIndex: number | null
  normalizedSaving: number | null
  baseline: { intensity: number; source: string; label: string } | null
  target: { proportionalPercent: number; tolerancePercent: number; year: number } | null
  semaphore: Semaphore
  isProvisional: boolean
  hasOutlier: boolean
  recordCount: number
  history: { year: number; month: number; consumption_value: number; attention_count: number; intensity_value: number | null; proportional_index: number | null; is_outlier: boolean }[]
}

export interface AuditLogEntry { id: string; entity_type: string; entity_id: string; action: string; changes: Record<string, unknown>; actor_name: string; created_at: string }
