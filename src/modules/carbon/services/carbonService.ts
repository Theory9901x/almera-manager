import type {
  AuditLogEntry, BiofuelBlend, CarbonProfile, DashboardData, ElectricityFactor, ElectricityRecord,
  EvidenceFile, FuelType, GwpEntry, IndicatorData, InventoryRow, ListResult, MobileRecord,
  Periodicity, ReductionTarget, StationaryRecord,
} from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/carbon${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data
}

function qs(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)) })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

async function downloadFile(path: string, filename: string) {
  const response = await fetch(`/api/carbon${path}`, { credentials: 'same-origin' })
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible generar el archivo') }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export type DashboardFilters = { year?: number }
export type IndicatorFilters = { periodicity?: Periodicity; year?: number; month?: number; quarter?: number; semester?: number }
export type ReportFilters = IndicatorFilters

export const carbonService = {
  // Perfil institucional
  profile: (year?: number) => call<CarbonProfile | null>(`/profile${qs({ year })}`),
  profileYears: () => call<number[]>('/profile/years'),
  saveProfile: (data: Record<string, unknown>) => call<CarbonProfile>('/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Catalogos de referencia
  fuels: () => call<FuelType[]>('/fuels'),
  updateFuel: (fuelKey: string, data: Record<string, unknown>) => call<FuelType>(`/fuels/${fuelKey}`, { method: 'PATCH', body: JSON.stringify(data) }),
  gwp: () => call<GwpEntry[]>('/gwp'),
  electricityFactors: () => call<ElectricityFactor[]>('/electricity-factors'),
  addElectricityFactor: (data: Record<string, unknown>) => call<ElectricityFactor>('/electricity-factors', { method: 'POST', body: JSON.stringify(data) }),
  biofuelBlends: () => call<BiofuelBlend[]>('/biofuel-blends'),
  addBiofuelBlend: (data: Record<string, unknown>) => call<BiofuelBlend>('/biofuel-blends', { method: 'POST', body: JSON.stringify(data) }),

  // Catalogos ligeros
  equipment: () => call<{ id: string; area: string; name: string; internal_code: string; active: boolean }[]>('/equipment'),
  addEquipment: (data: Record<string, unknown>) => call('/equipment', { method: 'POST', body: JSON.stringify(data) }),
  vehicles: () => call<{ id: string; plate: string; vehicle_type: string; ownership: string; active: boolean }[]>('/vehicles'),
  addVehicle: (data: Record<string, unknown>) => call('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  meters: () => call<{ id: string; code: string; label: string; provider: string; active: boolean }[]>('/meters'),
  addMeter: (data: Record<string, unknown>) => call('/meters', { method: 'POST', body: JSON.stringify(data) }),

  // Registros por fuente
  stationaryList: (filters: Record<string, string | number | undefined> = {}) => call<ListResult<StationaryRecord>>(`/records/stationary${qs(filters)}`),
  createStationary: (data: Record<string, unknown>) => call<StationaryRecord>('/records/stationary', { method: 'POST', body: JSON.stringify(data) }),
  stationaryDetail: (id: string) => call<StationaryRecord>(`/records/stationary/${id}`),
  updateStationary: (id: string, data: Record<string, unknown>) => call<StationaryRecord>(`/records/stationary/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  duplicateStationary: (id: string) => call<StationaryRecord>(`/records/stationary/${id}/duplicate`, { method: 'POST' }),

  mobileList: (filters: Record<string, string | number | undefined> = {}) => call<ListResult<MobileRecord>>(`/records/mobile${qs(filters)}`),
  createMobile: (data: Record<string, unknown>) => call<MobileRecord>('/records/mobile', { method: 'POST', body: JSON.stringify(data) }),
  mobileDetail: (id: string) => call<MobileRecord>(`/records/mobile/${id}`),
  updateMobile: (id: string, data: Record<string, unknown>) => call<MobileRecord>(`/records/mobile/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  duplicateMobile: (id: string) => call<MobileRecord>(`/records/mobile/${id}/duplicate`, { method: 'POST' }),

  electricityList: (filters: Record<string, string | number | undefined> = {}) => call<ListResult<ElectricityRecord>>(`/records/electricity${qs(filters)}`),
  createElectricity: (data: Record<string, unknown>) => call<ElectricityRecord>('/records/electricity', { method: 'POST', body: JSON.stringify(data) }),
  electricityDetail: (id: string) => call<ElectricityRecord>(`/records/electricity/${id}`),
  updateElectricity: (id: string, data: Record<string, unknown>) => call<ElectricityRecord>(`/records/electricity/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  validateRecord: (kind: 'stationary' | 'mobile' | 'electricity', id: string) => call(`/records/${kind}/${id}/validate`, { method: 'POST' }),
  rejectRecord: (kind: 'stationary' | 'mobile' | 'electricity', id: string, reason: string) => call(`/records/${kind}/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteRecord: (kind: 'stationary' | 'mobile' | 'electricity', id: string) => call(`/records/${kind}/${id}`, { method: 'DELETE' }),

  uploadEvidence: async (kind: 'stationary' | 'mobile' | 'electricity', id: string, files: FileList) => {
    const body = new FormData()
    Array.from(files).forEach(file => body.append('files', file))
    const response = await fetch(`/api/carbon/records/${kind}/${id}/evidence`, { method: 'POST', credentials: 'same-origin', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No fue posible subir la evidencia')
    return data as EvidenceFile[]
  },
  downloadEvidence: (kind: 'stationary' | 'mobile' | 'electricity', id: string, evidenceId: string, name: string) =>
    downloadFile(`/records/${kind}/${id}/evidence/${evidenceId}/download`, name),

  // Inventario unificado
  inventory: (filters: Record<string, string | number | undefined> = {}) => call<ListResult<InventoryRow>>(`/inventory${qs(filters)}`),

  // Dashboard / indicador / metas
  dashboard: (filters: DashboardFilters = {}) => call<DashboardData>(`/dashboard${qs(filters)}`),
  indicator: (filters: IndicatorFilters = {}) => call<IndicatorData>(`/indicator${qs(filters)}`),
  targets: () => call<ReductionTarget[]>('/targets'),
  saveTarget: (data: Record<string, unknown>) => call<ReductionTarget>('/targets', { method: 'POST', body: JSON.stringify(data) }),

  // Informe PDF
  downloadReport: (filters: ReportFilters = {}) => downloadFile(`/report-v2.pdf${qs(filters)}`, `informe-huella-carbono-${filters.year || ''}.pdf`),

  // Auditoria
  auditLog: (entityType?: string) => call<AuditLogEntry[]>(`/audit-log${qs({ entityType })}`),
}
