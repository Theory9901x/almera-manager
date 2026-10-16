import type { Materialization, RiskAction, RiskCatalogs, RiskDashboard, RiskDetail, RiskFilters, RiskRow } from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/risks${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No fue posible completar la operación')
  return data as T
}

function qs(filters: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value && value !== 'ALL') query.set(key, value) })
  const value = query.toString()
  return value ? `?${value}` : ''
}

const send = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

async function download(path: string, filename: string) {
  const response = await fetch(`/api/risks${path}`, { credentials: 'same-origin' })
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible descargar') }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const risksService = {
  catalogs: () => call<RiskCatalogs>('/catalogs'),
  dashboard: (mapId?: string) => call<RiskDashboard>(`/dashboard${qs({ mapId })}`),
  list: (filters: RiskFilters = {}) => call<{ mapId: string | null; rows: RiskRow[] }>(`/risks${qs(filters as Record<string, string | undefined>)}`),
  detail: (id: string) => call<RiskDetail>(`/risks/${id}`),
  create: (data: Record<string, unknown>) => call<{ id: string; code: string }>('/risks', send('POST', data)),
  update: (id: string, data: Record<string, unknown>) => call<{ ok: boolean }>(`/risks/${id}`, send('PATCH', data)),
  remove: (id: string) => call<{ ok: boolean }>(`/risks/${id}`, send('DELETE')),

  addCause: (riskId: string, data: Record<string, unknown>) => call(`/risks/${riskId}/causes`, send('POST', data)),
  updateCause: (id: string, data: Record<string, unknown>) => call(`/causes/${id}`, send('PATCH', data)),
  removeCause: (id: string) => call(`/causes/${id}`, send('DELETE')),

  addControl: (riskId: string, data: Record<string, unknown>) => call(`/risks/${riskId}/controls`, send('POST', data)),
  updateControl: (id: string, data: Record<string, unknown>) => call(`/controls/${id}`, send('PATCH', data)),
  removeControl: (id: string) => call(`/controls/${id}`, send('DELETE')),
  testControl: (id: string, data: Record<string, unknown>) => call(`/controls/${id}/tests`, send('POST', data)),

  actions: (filters: { mapId?: string; status?: string; kind?: string; processId?: string } = {}) => call<{ rows: RiskAction[] }>(`/actions${qs(filters)}`),
  addAction: (riskId: string, data: Record<string, unknown>) => call<RiskAction>(`/risks/${riskId}/actions`, send('POST', data)),
  updateAction: (id: string, data: Record<string, unknown>) => call<RiskAction>(`/actions/${id}`, send('PATCH', data)),
  removeAction: (id: string) => call(`/actions/${id}`, send('DELETE')),

  materializations: (filters: { mapId?: string; status?: string } = {}) => call<{ rows: Materialization[] }>(`/materializations${qs(filters)}`),
  reportMaterialization: (riskId: string, data: Record<string, unknown>) => call<Materialization>(`/risks/${riskId}/materializations`, send('POST', data)),
  updateMaterialization: (id: string, data: Record<string, unknown>) => call(`/materializations/${id}`, send('PATCH', data)),

  addReview: (riskId: string, data: Record<string, unknown>) => call(`/risks/${riskId}/reviews`, send('POST', data)),

  createMap: (data: Record<string, unknown>) => call('/maps', send('POST', data)),
  updateMap: (id: string, data: Record<string, unknown>) => call(`/maps/${id}`, send('PATCH', data)),
  duplicateMap: (id: string, data: Record<string, unknown>) => call<{ id: string; copied: number }>(`/maps/${id}/duplicate`, send('POST', data)),
  createClass: (data: Record<string, unknown>) => call('/classes', send('POST', data)),
  updateClass: (id: string, data: Record<string, unknown>) => call(`/classes/${id}`, send('PATCH', data)),

  exportPdf: (mapId: string, processId?: string) => download(`/report.pdf${qs({ mapId, processId })}`, `mapa-riesgos-${mapId}${processId ? `-proceso-${processId}` : ''}.pdf`),
  exportCsv: (mapId: string) => download(`/export.csv${qs({ mapId })}`, `matriz-riesgos-${mapId}.csv`),
}
