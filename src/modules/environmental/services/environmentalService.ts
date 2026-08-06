import type { AuditLogEntry, Baseline, ConsumptionRecord, DashboardData, EvidenceFile, Facility, IndicatorDetail, IndicatorType, ListResult, Periodicity, Target } from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/environmental${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)) })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

async function downloadFile(path: string, filename: string) {
  const response = await fetch(`/api/environmental${path}`, { credentials: 'same-origin' })
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible generar el archivo') }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export type DashboardFilters = { facilityId?: string; year?: number; periodicity?: Periodicity; month?: number; quarter?: number; semester?: number }
export type IndicatorFilters = DashboardFilters & { indicatorType?: IndicatorType }

export const environmentalService = {
  facilities: () => call<Facility[]>('/facilities'),
  addFacility: (data: Record<string, unknown>) => call<Facility>('/facilities', { method: 'POST', body: JSON.stringify(data) }),

  baselines: (indicatorType?: IndicatorType, facilityId?: string) => call<Baseline[]>(`/baselines${qs({ indicatorType, facilityId })}`),
  addBaseline: (data: Record<string, unknown>) => call<Baseline>('/baselines', { method: 'POST', body: JSON.stringify(data) }),

  targets: (indicatorType?: IndicatorType, facilityId?: string) => call<Target[]>(`/targets${qs({ indicatorType, facilityId })}`),
  addTarget: (data: Record<string, unknown>) => call<Target>('/targets', { method: 'POST', body: JSON.stringify(data) }),

  records: (filters: Record<string, string | number | boolean | undefined> = {}) => call<ListResult<ConsumptionRecord>>(`/records${qs(filters)}`),
  createRecord: (data: Record<string, unknown>) => call<ConsumptionRecord>('/records', { method: 'POST', body: JSON.stringify(data) }),
  recordDetail: (id: string) => call<ConsumptionRecord>(`/records/${id}`),
  updateRecord: (id: string, data: Record<string, unknown>) => call<ConsumptionRecord>(`/records/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  validateRecord: (id: string) => call(`/records/${id}/validate`, { method: 'POST' }),
  rejectRecord: (id: string, reason: string) => call(`/records/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteRecord: (id: string) => call(`/records/${id}`, { method: 'DELETE' }),

  uploadEvidence: async (id: string, files: FileList) => {
    const body = new FormData()
    Array.from(files).forEach(file => body.append('files', file))
    const response = await fetch(`/api/environmental/records/${id}/evidence`, { method: 'POST', credentials: 'same-origin', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No fue posible subir la evidencia')
    return data as EvidenceFile[]
  },
  downloadEvidence: (id: string, evidenceId: string, name: string) => downloadFile(`/records/${id}/evidence/${evidenceId}/download`, name),

  dashboard: (filters: DashboardFilters = {}) => call<DashboardData>(`/dashboard${qs(filters)}`),
  indicator: (filters: IndicatorFilters = {}) => call<IndicatorDetail>(`/indicator${qs(filters)}`),
  downloadReport: (filters: IndicatorFilters = {}) => downloadFile(`/report.pdf${qs(filters)}`, `indicador-${(filters.indicatorType || 'energy').toLowerCase()}-${filters.year || ''}.pdf`),

  auditLog: () => call<AuditLogEntry[]>('/audit-log'),
}
