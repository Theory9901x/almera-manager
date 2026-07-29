import type { Area, AreaMatrix, Auditor, Commitment, CommitmentStatus, Dashboard, Evaluation, EvaluationDetail, EvaluationRecord, EvaluationSummary, ImprovementPlan, PlanFollowup, Position, Professional, ScoreComputation, Threshold } from '../types'

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
  closeEvaluation: (id: string, data?: { evaluatorSignedName?: string; evaluatorDocument?: string; evaluatorPosition?: string; evaluatorSignature?: string }) =>
    call<Evaluation>(`/evaluations/${id}/close`, { method: 'POST', body: JSON.stringify(data || {}) }),
  reopenEvaluation: (id: string, justification: string) => call<Evaluation>(`/evaluations/${id}/reopen`, { method: 'POST', body: JSON.stringify({ justification }) }),
  signEvaluation: (id: string, data: { professionalSignedName: string; professionalDocument?: string; professionalPosition?: string; professionalSignature?: string }) =>
    call<Evaluation>(`/evaluations/${id}/sign`, { method: 'POST', body: JSON.stringify(data) }),
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
  linkProfessionalAccount: (id: string, membershipId: string | null) => call<Professional>(`/professionals/${id}`, { method: 'PATCH', body: JSON.stringify({ membershipId }) }),
  myEvaluations: () => call<EvaluationSummary[]>('/my-evaluations'),

  // Compromisos: una actividad por fila, con su propio ID y su propio estado.
  commitments: (evaluationId: string) => call<Commitment[]>(`/evaluations/${evaluationId}/commitments`),
  addCommitment: (evaluationId: string, data: { description: string; dueDate?: string | null }) =>
    call<Commitment>(`/evaluations/${evaluationId}/commitments`, { method: 'POST', body: JSON.stringify(data) }),
  updateCommitment: (evaluationId: string, commitmentId: string, data: { description?: string; dueDate?: string | null; orderIndex?: number }) =>
    call<Commitment>(`/evaluations/${evaluationId}/commitments/${commitmentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeCommitment: (evaluationId: string, commitmentId: string) =>
    call<{ ok: true; commitments: Commitment[] }>(`/evaluations/${evaluationId}/commitments/${commitmentId}`, { method: 'DELETE' }),
  setCommitmentStatus: (evaluationId: string, commitmentId: string, status: CommitmentStatus, note = '') =>
    call<Commitment>(`/evaluations/${evaluationId}/commitments/${commitmentId}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }),
  myCommitments: () => call<Commitment[]>('/my-commitments'),

  // Plan de mejora (auditor)
  evaluationPlan: (evaluationId: string) => call<ImprovementPlan | null>(`/evaluations/${evaluationId}/plan`),
  saveEvaluationPlan: (evaluationId: string, data: { description: string; plannedStartDate?: string; plannedEndDate?: string }) =>
    call<ImprovementPlan>(`/evaluations/${evaluationId}/plan`, { method: 'PUT', body: JSON.stringify(data) }),

  // Mi plan de trabajo (profesional)
  myPlans: () => call<ImprovementPlan[]>('/my-plans'),
  plan: (planId: string) => call<ImprovementPlan>(`/plans/${planId}`),
  startPlan: (planId: string) => call<ImprovementPlan>(`/plans/${planId}/start`, { method: 'POST' }),
  completePlan: (planId: string) => call<ImprovementPlan>(`/plans/${planId}/complete`, { method: 'POST' }),
  followups: (planId: string) => call<PlanFollowup[]>(`/plans/${planId}/followups`),
  addFollowup: async (planId: string, description: string, progressPercent: number, files: FileList | null) => {
    const body = new FormData()
    body.append('description', description)
    body.append('progressPercent', String(progressPercent))
    if (files) Array.from(files).forEach(file => body.append('files', file))
    const response = await fetch(`/api/adherence/plans/${planId}/followups`, { method: 'POST', credentials: 'same-origin', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No fue posible registrar el seguimiento')
    return data as PlanFollowup
  },
  downloadFollowupEvidence: async (planId: string, followupId: string, evidenceId: string, originalName: string) => {
    const response = await fetch(`/api/adherence/plans/${planId}/followups/${followupId}/evidence/${evidenceId}/download`, { credentials: 'same-origin' })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible descargar la evidencia') }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = originalName
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
