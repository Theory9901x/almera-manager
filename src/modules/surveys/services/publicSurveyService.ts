import type { PublicSurvey } from '../types'

export class PublicSurveyError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/public/surveys${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new PublicSurveyError(data.error || 'No fue posible completar la operación', response.status)
  return data as T
}

export interface SubmitResponseInput {
  completed: boolean
  items: { questionId: string; value: unknown }[]
  deviceId?: string
  responseId?: string
}

export const publicSurveyService = {
  bySlug: (slug: string) => call<PublicSurvey>(`/${slug}`),
  submit: (slug: string, data: SubmitResponseInput) => call<{ ok: true; responseId: string; thankYouMessage: string }>(`/${slug}/responses`, { method: 'POST', body: JSON.stringify(data) }),
}
