// Huella de Carbono v2 — tipos del cliente. Los tipos del modulo viejo (bloques/mediciones) se
// retiraron de aqui junto con sus paginas; el modulo viejo sigue vivo en el servidor (no se
// migraron sus datos, ver server/schema.sql) pero ya no tiene interfaz.

export type RecordStatus = 'BORRADOR' | 'PENDIENTE' | 'VALIDADO' | 'RECHAZADO' | 'PERIODO_CERRADO'
export type Periodicity = 'MENSUAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL'
export type RecordSource = 'STATIONARY' | 'MOBILE' | 'ELECTRICITY'

export interface CarbonProfile {
  id: string
  organization_id: string
  vigencia_year: number
  establishment_name: string
  department: string
  city: string
  address: string
  start_year: number | null
  establishment_type: string
  organizational_boundary: string
  temp_min_c: number | null
  temp_max_c: number | null
  humidity_winter_percent: number | null
  humidity_summer_percent: number | null
  fulltime_employees: number | null
  patients_per_year: number | null
  avg_occupied_beds: number | null
  built_area_m2: number | null
  hours_per_day: number | null
  currency: string
  usd_exchange_rate: number | null
  updated_at: string
}

export interface FuelType {
  id: string
  fuel_key: string
  label: string
  native_unit: 'm3' | 'kg' | 'litro'
  applicable_stationary: boolean
  applicable_mobile: boolean
  is_biofuel: boolean
  density_kg_per_unit: number | null
  heating_value_mj_per_kg: number
  fe_stationary_co2_g_mj: number | null
  fe_stationary_ch4_g_mj: number | null
  fe_stationary_n2o_g_mj: number | null
  fe_mobile_co2_g_mj: number | null
  fe_mobile_ch4_g_mj: number | null
  fe_mobile_n2o_g_mj: number | null
  factor_source: string
  active: boolean
  position: number
}

export interface GwpEntry { gas_key: string; label: string; gwp_value: number; ar_version: string; source: string }

export interface ElectricityFactor { id: string; region: string; label: string; value_kgco2e_per_kwh: number; valid_from: string; valid_to: string | null; source: string }
export interface BiofuelBlend { id: string; region: string; biodiesel_percent: number; bioethanol_percent: number; valid_from: string; valid_to: string | null; source: string }

export interface CarbonCatalogItem { id: string; active: boolean; [key: string]: unknown }

export interface EvidenceFile { id: string; original_name: string; mime_type: string; size_bytes: number; created_at: string }

interface RecordCommon {
  id: string
  record_date: string
  status: RecordStatus
  rejection_reason: string
  invoice_number: string
  provider: string
  responsible_name: string
  notes: string
  co2e_kg: number
  created_by_name?: string
  created_at: string
  evidence_count?: number
  evidence?: EvidenceFile[]
}

export interface StationaryRecord extends RecordCommon {
  area: string
  equipment_id: string | null
  equipment_label: string
  internal_code: string
  fuel_key: string
  fuel_label?: string
  quantity: number
  quantity_unit: string
  invoice_value: number | null
  information_source: string
  energy_mj: number
  co2_kg: number
  ch4_kg: number
  n2o_kg: number
}

export interface MobileRecord extends RecordCommon {
  vehicle_id: string | null
  plate: string
  vehicle_type: string
  ownership: 'PROPIO' | 'CONTROL_OPERACIONAL'
  fuel_key: string
  fuel_label?: string
  input_method: 'CANTIDAD' | 'RENDIMIENTO'
  quantity: number
  quantity_unit: string
  km_traveled: number | null
  specific_consumption: number | null
  biodiesel_blend_percent: number | null
  bioethanol_blend_percent: number | null
  information_source: string
  fossil_quantity_l: number
  biogenic_quantity_l: number
  energy_mj: number
}

export interface ElectricityRecord extends RecordCommon {
  meter_id: string | null
  meter_code: string
  billing_start: string
  billing_end: string
  account_number: string
  kwh: number
  invoice_value: number | null
}

export interface ListResult<T> { rows: T[]; total: number; limit: number; offset: number }

export interface InventoryRow {
  id: string
  source: RecordSource
  scope_label: string
  record_date: string
  fuel_label: string
  quantity: number
  quantity_unit: string
  co2e_kg: number
  status: RecordStatus
  invoice_number: string
  created_by_name: string
  evidence_count: number
}

export interface DashboardData {
  year: number
  total: { kg: number; ton: number }
  byScope: { scope1Ton: number; scope2Ton: number; scope1SharePercent: number; scope2SharePercent: number }
  bySource: { source: RecordSource; label: string; kg: number; ton: number; sharePercent: number }[]
  trendPercent: number | null
  timeline: { month: number; stationaryTon: number; mobileTon: number; electricityTon: number; totalTon: number }[]
  missingMonths: number[]
  counts: { stationary: number; mobile: number; electricity: number }
  target: {
    baseYear: number; baseValueTon: number; targetYear: number; targetReductionPercent: number
    expectedValueTon: number; currentValueTon: number; progressPercent: number | null; onTrack: boolean
  } | null
  normalized: { perPatientKg: number | null; perEmployeeTon: number | null; perBedTon: number | null; perM2Kg: number | null } | null
  narrative: string
}

export interface IndicatorData {
  name: string
  periodicity: Periodicity
  periodKey: string
  dateFrom: string
  dateTo: string
  numeratorKg: number
  resultTon: number
  unit: string
  targetTon: number | null
  baselineTon: number | null
  variationPercent: number | null
  complianceStatus: 'CUMPLE' | 'NO_CUMPLE' | null
  semaphore: 'verde' | 'amarillo' | 'rojo' | 'sin-dato'
  isProvisional: boolean
  intensity: { kgco2ePerPatient: number | null; tco2ePerEmployee: number | null; tco2ePerBed: number | null; kgco2ePerM2: number | null; kgco2ePerKwh: number | null } | null
  recordCount: number
}

export interface ReductionTarget { id: string; base_year: number; base_value_kgco2e: number; target_year: number; target_reduction_percent: number }

export interface AuditLogEntry { id: string; entity_type: string; entity_id: string; action: string; changes: Record<string, unknown>; actor_name: string; created_at: string }
