import type {
  AdherenceResult, AnalyticsFilters, AnalyticsSummary, AssignedTemplate, AuditDetail, AuditLogEntry, AuditSummary,
  ChecklistArea, ChecklistMembership, ChecklistSignature, ChecklistTemplate, ChecklistTemplateDetail,
  ChecklistValue, DirectorySubject, SeedTemplate, SignerSuggestion,
} from '../types'

function toQueryString(filters: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value) })
  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

// Descarga binaria: fetch + blob en vez de navegar a la URL, para que un error del servidor se
// pueda mostrar como mensaje en vez de dejar al usuario en una pestaña con un JSON crudo.
async function download(path: string, filename: string) {
  const response = await fetch(`/api/checklists${path}`, { credentials: 'same-origin' })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || 'No fue posible generar el informe')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/checklists${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data as T
}

export interface StructurePayload {
  headerFields: { id: string; label: string; field_type: string; options: string[]; required: boolean }[]
  subjectFields: { id: string; label: string; field_type: string; options: string[]; required: boolean }[]
  domains: { id: string; name: string; criteria: { id: string; item_number: string; text: string; guidance: string }[] }[]
}

export const checklistsService = {
  areas: () => call<ChecklistArea[]>('/areas'),
  createArea: (name: string) => call<ChecklistArea>('/areas', { method: 'POST', body: JSON.stringify({ name }) }),

  list: () => call<ChecklistTemplate[]>('/'),
  detail: (id: string) => call<ChecklistTemplateDetail>(`/${id}`),
  create: (data: { name: string; code?: string; version?: string; areaId?: string | null; subjectLabel?: string; numberedItems?: boolean }) =>
    call<ChecklistTemplateDetail>('/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Record<string, unknown>) =>
    call<ChecklistTemplate>(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => call<{ ok: true }>(`/${id}`, { method: 'DELETE' }),

  // Guardado atomico de toda la estructura (un solo viaje, en transaccion) — encaja con el
  // boton "Guardar" explicito del constructor.
  saveStructure: (id: string, payload: StructurePayload) =>
    call<ChecklistTemplateDetail>(`/${id}/structure`, { method: 'PUT', body: JSON.stringify(payload) }),

  /** El formato en blanco, listo para imprimir. Se abre en pestaña nueva en vez de descargarse:
   *  casi siempre se quiere mirar, no guardar. */
  formatUrl: (id: string) => `/api/checklists/${id}/formato.pdf`,

  simulate: (id: string, subjects: { id: string }[], answers: { subject_id: string; criterion_id: string; value: ChecklistValue }[]) =>
    call<AdherenceResult>(`/${id}/simulate`, { method: 'POST', body: JSON.stringify({ subjects, answers }) }),

  // ---- Fase 2: diligenciamiento ----

  memberships: () => call<ChecklistMembership[]>('/memberships'),
  assignments: (id: string) => call<string[]>(`/${id}/assignments`),
  saveAssignments: (id: string, membershipIds: string[]) =>
    call<{ ok: true; count: number }>(`/${id}/assignments`, { method: 'PUT', body: JSON.stringify({ membershipIds }) }),

  assignedToMe: () => call<AssignedTemplate[]>('/assigned/mine'),
  directory: (templateId?: string) => call<DirectorySubject[]>(`/subjects/directory${templateId ? `?templateId=${templateId}` : ''}`),

  audits: () => call<AuditSummary[]>('/audits/list'),
  audit: (auditId: string) => call<AuditDetail>(`/audits/${auditId}`),
  createAudit: (data: { templateId: string; auditDate?: string; areaId?: string; shift?: string; headerValues?: Record<string, string> }) =>
    call<{ id: string }>('/audits', { method: 'POST', body: JSON.stringify(data) }),
  updateAudit: (auditId: string, data: { auditDate?: string; areaId?: string; shift?: string; headerValues?: Record<string, string> }) =>
    call<AuditDetail>(`/audits/${auditId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeAudit: (auditId: string) => call<{ ok: true }>(`/audits/${auditId}`, { method: 'DELETE' }),
  removeAudits: (ids: string[]) =>
    call<{ ok: true; deleted: number }>('/audits/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  auditLog: () => call<AuditLogEntry[]>('/audits/log'),

  addSubject: (auditId: string, data: { displayName: string; attributes?: Record<string, string>; subjectId?: string | null }) =>
    call<{ id: string }>(`/audits/${auditId}/subjects`, { method: 'POST', body: JSON.stringify(data) }),
  removeSubject: (auditId: string, subjectRowId: string) =>
    call<{ ok: true }>(`/audits/${auditId}/subjects/${subjectRowId}`, { method: 'DELETE' }),

  saveAnswers: (auditId: string, answers: { auditSubjectId: string; criterionId: string; value: ChecklistValue | null }[]) =>
    call<AuditDetail>(`/audits/${auditId}/answers`, { method: 'PUT', body: JSON.stringify({ answers }) }),

  closeAudit: (auditId: string) => call<AuditDetail>(`/audits/${auditId}/close`, { method: 'POST' }),
  reopenAudit: (auditId: string) => call<AuditDetail>(`/audits/${auditId}/reopen`, { method: 'POST' }),

  // ---- Fase 3: firmas ----

  signers: () => call<SignerSuggestion[]>('/signers/directory'),
  addSignature: (auditId: string, data: { signerName: string; signerRole: string; signatureImage: string }) =>
    call<ChecklistSignature>(`/audits/${auditId}/signatures`, { method: 'POST', body: JSON.stringify(data) }),
  removeSignature: (auditId: string, signatureId: string) =>
    call<{ ok: true }>(`/audits/${auditId}/signatures/${signatureId}`, { method: 'DELETE' }),

  // ---- Fase 4: analítica e informes ----

  analytics: (filters: AnalyticsFilters = {}) =>
    call<AnalyticsSummary>(`/analytics/summary${toQueryString(filters as Record<string, string | undefined>)}`),

  downloadAuditReport: (auditId: string) =>
    download(`/audits/${auditId}/report.pdf`, `lista-chequeo-${auditId}.pdf`),

  // ---- Fase 5: carga de listas institucionales ----

  seedAvailable: () => call<SeedTemplate[]>('/seed/available'),
  importSeeds: (codes?: string[]) =>
    call<{ results: { code: string; status: string; domains?: number; criteria?: number }[] }>(
      '/seed/import', { method: 'POST', body: JSON.stringify({ codes: codes || [] }) }),

  downloadConsolidated: (filters: AnalyticsFilters = {}) =>
    download(`/analytics/consolidated.pdf${toQueryString(filters as Record<string, string | undefined>)}`, 'consolidado-listas-chequeo.pdf'),
}
