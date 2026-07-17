import type {
  CarbonBlock, CarbonMeasurement, CarbonMeasurementDetail, CarbonMeasurementListResult, CarbonReductionTarget, CarbonStats, EmissionFactor,
} from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/carbon${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data as T
}

function toQueryString(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export interface CreateMeasurementInput {
  blockKey: string
  period: string
  recordDate: string
  subtype?: string
  quantity: number
  quantityUnit: string
  inSitu?: boolean
  notes?: string
}

export const carbonService = {
  blocks: () => call<CarbonBlock[]>('/blocks'),
  updateBlock: (blockId: string, data: { enabled: boolean; responsibleMembershipId?: string | null }) =>
    call<{ ok: true }>(`/blocks/${blockId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  factors: (blockKey?: string) => call<EmissionFactor[]>(`/factors${toQueryString({ blockKey })}`),
  createFactor: (data: { blockKey: string; subtype: string; subtypeLabel?: string; value: number; unit: string; validFrom: string; methodologySource: string }) =>
    call<EmissionFactor>('/factors', { method: 'POST', body: JSON.stringify(data) }),

  measurements: (filters: { blockKey?: string; dateFrom?: string; dateTo?: string; limit?: string; offset?: string } = {}) =>
    call<CarbonMeasurementListResult>(`/measurements${toQueryString(filters)}`),
  createMeasurement: (data: CreateMeasurementInput) => call<CarbonMeasurement>('/measurements', { method: 'POST', body: JSON.stringify(data) }),
  measurementDetail: (id: string) => call<CarbonMeasurementDetail>(`/measurements/${id}`),
  deleteMeasurement: (id: string) => call<{ ok: true }>(`/measurements/${id}`, { method: 'DELETE' }),
  uploadEvidence: async (measurementId: string, files: File[]) => {
    const body = new FormData()
    files.forEach(file => body.append('files', file))
    const response = await fetch(`/api/carbon/measurements/${measurementId}/evidence`, { method: 'POST', credentials: 'same-origin', body })
    const data = await response.json().catch(() => ([]))
    if (!response.ok) throw new Error(data.error || 'No fue posible subir la evidencia')
    return data
  },

  targets: () => call<CarbonReductionTarget[]>('/targets'),
  createTarget: (data: { baseYear: number; baseValueKgco2e: number; targetYear: number; targetReductionPercent: number }) =>
    call<CarbonReductionTarget>('/targets', { method: 'POST', body: JSON.stringify(data) }),

  stats: (filters: { dateFrom?: string; dateTo?: string } = {}) => call<CarbonStats>(`/stats${toQueryString(filters)}`),
}
