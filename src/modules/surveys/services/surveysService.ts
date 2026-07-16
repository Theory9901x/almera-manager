import type {
  QuestionType, Survey, SurveyDetail, SurveyLink, SurveyResponseDetail, SurveyResponseSummary, SurveyStats,
} from '../types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/surveys${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init })
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

export interface CreateQuestionInput {
  type: QuestionType
  prompt: string
  description?: string
  imageUrl?: string | null
  required?: boolean
  config?: Record<string, unknown>
}

export const surveysService = {
  list: (filters: { status?: string; audience?: string; q?: string } = {}) => call<Survey[]>(`${toQueryString(filters)}`),
  create: (data: { title: string; description?: string; audience?: string }) => call<Survey>('', { method: 'POST', body: JSON.stringify(data) }),
  detail: (id: string) => call<SurveyDetail>(`/${id}`),
  update: (id: string, data: Record<string, unknown>) => call<Survey>(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  duplicate: (id: string) => call<Survey>(`/${id}/duplicate`, { method: 'POST' }),
  remove: (id: string) => call<{ ok: true }>(`/${id}`, { method: 'DELETE' }),
  publish: (id: string) => call<Survey>(`/${id}/publish`, { method: 'POST' }),
  close: (id: string) => call<Survey>(`/${id}/close`, { method: 'POST' }),
  reopen: (id: string) => call<Survey>(`/${id}/reopen`, { method: 'POST' }),
  link: (id: string) => call<SurveyLink>(`/${id}/link`),

  createPage: (surveyId: string, data: { title?: string; description?: string }) => call(`/${surveyId}/pages`, { method: 'POST', body: JSON.stringify(data) }),
  updatePage: (surveyId: string, pageId: string, data: { title?: string; description?: string }) => call(`/${surveyId}/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removePage: (surveyId: string, pageId: string) => call(`/${surveyId}/pages/${pageId}`, { method: 'DELETE' }),
  reorderPages: (surveyId: string, order: string[]) => call<{ ok: true }>(`/${surveyId}/pages/reorder`, { method: 'PUT', body: JSON.stringify({ order }) }),

  createQuestion: (surveyId: string, pageId: string, data: CreateQuestionInput) => call(`/${surveyId}/pages/${pageId}/questions`, { method: 'POST', body: JSON.stringify(data) }),
  updateQuestion: (surveyId: string, questionId: string, data: Record<string, unknown>) => call(`/${surveyId}/questions/${questionId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeQuestion: (surveyId: string, questionId: string) => call(`/${surveyId}/questions/${questionId}`, { method: 'DELETE' }),
  duplicateQuestion: (surveyId: string, questionId: string) => call(`/${surveyId}/questions/${questionId}/duplicate`, { method: 'POST' }),
  reorderQuestions: (surveyId: string, pageId: string, order: string[]) => call<{ ok: true }>(`/${surveyId}/pages/${pageId}/questions/reorder`, { method: 'PUT', body: JSON.stringify({ order }) }),

  uploadMedia: async (surveyId: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    const response = await fetch(`/api/surveys/${surveyId}/media`, { method: 'POST', credentials: 'same-origin', body })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'No fue posible subir la imagen')
    return data as { url: string }
  },

  responses: (surveyId: string, filters: { month?: string; respondentMembershipId?: string } = {}) => call<SurveyResponseSummary[]>(`/${surveyId}/responses${toQueryString(filters)}`),
  responseDetail: (surveyId: string, responseId: string) => call<SurveyResponseDetail>(`/${surveyId}/responses/${responseId}`),
  stats: (surveyId: string, filters: { month?: string; respondentMembershipId?: string } = {}) => call<SurveyStats>(`/${surveyId}/stats${toQueryString(filters)}`),
  exportCsv: async (surveyId: string, code: string, filters: { month?: string } = {}) => {
    const response = await fetch(`/api/surveys/${surveyId}/export.csv${toQueryString(filters)}`, { credentials: 'same-origin' })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible exportar') }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `encuesta-${code}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
