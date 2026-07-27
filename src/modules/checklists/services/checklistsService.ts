import type {
  AdherenceResult, ChecklistArea, ChecklistTemplate, ChecklistTemplateDetail, ChecklistValue,
} from '../types'

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

  simulate: (id: string, subjects: { id: string }[], answers: { subject_id: string; criterion_id: string; value: ChecklistValue }[]) =>
    call<AdherenceResult>(`/${id}/simulate`, { method: 'POST', body: JSON.stringify({ subjects, answers }) }),
}
