import type { Area, AreaMatrix, Auditor, Dashboard, Evaluation, EvaluationDetail, EvaluationRecord, EvaluationSummary, Position, Professional, ScoreComputation, Threshold } from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/adherence${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data
}

function toQueryString(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export type DashboardFilters = { areaId?: string; professionalId?: string; positionId?: string; monthReported?: string }

export const adherenceService = {
  areas: () => call<Area[]>('/areas'),
  createArea: (name: string) => call<Area>('/areas', { method: 'POST', body: JSON.stringify({ name }) }),
  updateArea: (id: string, data: Record<string, unknown>) => call<Area>(`/areas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  matrix: (areaId: string) => call<AreaMatrix>(`/areas/${areaId}/matrix`),
  saveMatrix: (areaId: string, data: Record<string, unknown>) => call<AreaMatrix & { weightTotal: number }>(`/areas/${areaId}/matrix`, { method: 'PUT', body: JSON.stringify(data) }),
  positions: () => call<Position[]>('/positions'),
  createPosition: (name: string) => call<Position>('/positions', { method: 'POST', body: JSON.stringify({ name }) }),
  updatePosition: (id: string, data: Record<string, unknown>) => call<Position>(`/positions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  professionals: (filters: { areaId?: string; positionId?: string; q?: string } = {}) => call<Professional[]>(`/professionals${toQueryString(filters)}`),
  createProfessional: (data: Record<string, unknown>) => call<Professional>('/professionals', { method: 'POST', body: JSON.stringify(data) }),
  updateProfessional: (id: string, data: Record<string, unknown>) => call<Professional>(`/professionals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  evaluations: (filters: { professionalId?: string; areaId?: string; monthReported?: string } = {}) => call<EvaluationSummary[]>(`/evaluations${toQueryString(filters)}`),
  createEvaluation: (data: Record<string, unknown>) => call<Evaluation>('/evaluations', { method: 'POST', body: JSON.stringify(data) }),
  evaluationDetail: (id: string) => call<EvaluationDetail>(`/evaluations/${id}`),
  addRecord: (evaluationId: string, data: Record<string, unknown>) => call<EvaluationRecord>(`/evaluations/${evaluationId}/records`, { method: 'POST', body: JSON.stringify(data) }),
  updateRecord: (evaluationId: string, recordId: string, data: Record<string, unknown>) => call<EvaluationRecord>(`/evaluations/${evaluationId}/records/${recordId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeRecord: (evaluationId: string, recordId: string) => call(`/evaluations/${evaluationId}/records/${recordId}`, { method: 'DELETE' }),
  saveScores: (evaluationId: string, scores: { recordId: string; criterionId: string; score: 0 | 1 | 2 | null }[]) =>
    call<ScoreComputation>(`/evaluations/${evaluationId}/scores`, { method: 'PUT', body: JSON.stringify({ scores }) }),
  updateEvaluation: (id: string, data: Record<string, unknown>) => call<Evaluation>(`/evaluations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  closeEvaluation: (id: string, evaluatorSignedName?: string) => call<Evaluation>(`/evaluations/${id}/close`, { method: 'POST', body: JSON.stringify({ evaluatorSignedName }) }),
  reopenEvaluation: (id: string, justification: string) => call<Evaluation>(`/evaluations/${id}/reopen`, { method: 'POST', body: JSON.stringify({ justification }) }),
  signEvaluation: (id: string, professionalSignedName: string) => call<Evaluation>(`/evaluations/${id}/sign`, { method: 'POST', body: JSON.stringify({ professionalSignedName }) }),
  downloadReport: async (id: string) => {
    const response = await fetch(`/api/adherence/evaluations/${id}/report.pdf`, { credentials: 'same-origin' })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible generar el informe') }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `informe-adherencia-${id}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
  },
  auditors: () => call<Auditor[]>('/auditors'),
  updateAuditorAreas: (membershipId: string, areaIds: string[]) => call<{ ok: true }>(`/auditors/${membershipId}/areas`, { method: 'PUT', body: JSON.stringify({ areaIds }) }),
  thresholds: () => call<Threshold[]>('/thresholds'),
  updateThreshold: (concept: string, minPercent: number) => call<Threshold>(`/thresholds/${concept}`, { method: 'PATCH', body: JSON.stringify({ minPercent }) }),
  dashboard: (filters: DashboardFilters = {}) => call<Dashboard>(`/dashboard${toQueryString(filters)}`),
  downloadDashboardReport: async (filters: DashboardFilters = {}) => {
    const response = await fetch(`/api/adherence/dashboard/report.pdf${toQueryString(filters)}`, { credentials: 'same-origin' })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible generar el informe') }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'dashboard-adherencia.pdf'
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
