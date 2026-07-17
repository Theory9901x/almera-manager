export type CarbonScope = 'SCOPE_1' | 'SCOPE_2' | 'SCOPE_3' | 'VARIABLE'

export interface CarbonBlock {
  id: string
  key: string
  name: string
  scope: CarbonScope
  is_core: boolean
  description: string
  position: number
  enabled: boolean
  responsible_membership_id: string | null
  responsible_name: string | null
}

export interface EmissionFactor {
  id: string
  block_key: string
  subtype: string
  subtype_label: string
  value: number
  unit: string
  valid_from: string
  valid_to: string | null
  methodology_source: string
  created_at: string
}

export interface CarbonMeasurement {
  id: string
  organization_id: string
  block_key: string
  block_name?: string
  block_scope?: CarbonScope
  period: string
  record_date: string
  subtype: string | null
  quantity: number
  quantity_unit: string
  scope_override: 'SCOPE_1' | 'SCOPE_3' | null
  in_situ: boolean
  computed_kgco2e: number | null
  factor_id: string | null
  notes: string
  recorded_by_id: string
  recorded_by_name?: string
  created_at: string
  evidence_count?: number
}

export interface CarbonMeasurementDetail extends CarbonMeasurement {
  evidence: { id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string }[]
}

export interface CarbonMeasurementListResult { rows: CarbonMeasurement[]; total: number; limit: number; offset: number }

export interface CarbonReductionTarget {
  id: string
  base_year: number
  base_value_kgco2e: number
  target_year: number
  target_reduction_percent: number
}

export interface CarbonTargetProgress {
  baseYear: number
  baseValue: number
  targetYear: number
  targetReductionPercent: number
  expectedValue: number
  currentValue: number
  onTrack: boolean
}

export interface CarbonBlockTotal { blockKey: string; name: string; kgco2e: number }
export interface CarbonTimelinePoint { period: string; kgco2e: number }

export interface CarbonBenchmark {
  id: string
  source: string
  metric_key: string
  label: string
  value: number | null
  unit: string
  note: string
  methodology_source: string
}

export interface CarbonRecommendation { text: string; source: string }
export interface CarbonBenchmarkComparison { benchmarks: CarbonBenchmark[]; caveat: string }

export interface CarbonQuarterlyAnalysis {
  id: string
  year: number
  quarter: number
  total_kgco2e: number
  trend_percent: number | null
  top_block_key: string | null
  benchmark_comparison: CarbonBenchmarkComparison
  recommendations: CarbonRecommendation[]
  created_at: string
}

export interface CarbonStats {
  total: number
  byScope: { SCOPE_1: number; SCOPE_2: number; SCOPE_3: number }
  byBlock: CarbonBlockTotal[]
  timeline: CarbonTimelinePoint[]
  trendPercent: number | null
  lastUpdated: string | null
  normalized: { perPatient: number | null; perBed: number | null; note: string }
  target: CarbonTargetProgress | null
}
