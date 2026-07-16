import type { PublicSurvey, SurveyScoring } from '../types'

export class PublicSurveyError extends Error {
  constructor(message: string, public status: number, public alreadyResponded = false) { super(message) }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/public/surveys${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new PublicSurveyError(data.error || 'No fue posible completar la operación', response.status, Boolean(data.alreadyResponded))
  return data as T
}

export interface SubmitResponseInput {
  completed: boolean
  items: { questionId: string; value: unknown }[]
  deviceId?: string
  responseId?: string
}

export const publicSurveyService = {
  bySlug: (slug: string, deviceId: string) => call<PublicSurvey>(`/${slug}?deviceId=${encodeURIComponent(deviceId)}`),
  // score: solo viene poblado si la encuesta tiene preguntas con clave de calificacion Y
  // show_score_to_respondent esta activo — de lo contrario el backend simplemente no lo incluye.
  submit: (slug: string, data: SubmitResponseInput) =>
    call<{ ok: true; responseId: string; thankYouMessage: string; score?: SurveyScoring }>(`/${slug}/responses`, { method: 'POST', body: JSON.stringify(data) }),
}
