import type {
  QuestionType, Respondent, Survey, SurveyDetail, SurveyLink, SurveyResponseDetail, SurveyResponseListResult, SurveyStats, TextAnswersResult,
} from '../types'

export interface StatsFilters {
  month?: string
  dateFrom?: string
  dateTo?: string
  respondentMembershipId?: string
  segmentQuestionId?: string
  segmentValue?: string
  [key: string]: string | undefined
}

export interface ResponseFilters {
  dateFrom?: string
  dateTo?: string
  search?: string
  segmentQuestionId?: string
  segmentValue?: string
  limit?: string
  offset?: string
  [key: string]: string | undefined
}

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
  list: (filters: { status?: string; audience?: string; q?: string; template?: string } = {}) => call<Survey[]>(`${toQueryString(filters)}`),
  create: (data: { title: string; description?: string; audience?: string }) => call<Survey>('', { method: 'POST', body: JSON.stringify(data) }),
  detail: (id: string) => call<SurveyDetail>(`/${id}`),
  // El backend devuelve la fila completa de surveys (loadSurveyMeta), no solo los campos de Survey
  // — incluye cover_image/require_login/etc, que es justo lo que el modal de configuracion necesita
  // para reflejar el guardado real en vez de un patch optimista con claves camelCase distintas.
  update: (id: string, data: Record<string, unknown>) => call<Omit<SurveyDetail, 'pages'>>(`/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  duplicate: (id: string, data: { title?: string; asTemplate?: boolean } = {}) => call<Survey>(`/${id}/duplicate`, { method: 'POST', body: JSON.stringify(data) }),
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

  responses: (surveyId: string, filters: ResponseFilters = {}) => call<SurveyResponseListResult>(`/${surveyId}/responses${toQueryString(filters)}`),
  responseDetail: (surveyId: string, responseId: string) => call<SurveyResponseDetail>(`/${surveyId}/responses/${responseId}`),
  deleteResponse: (surveyId: string, responseId: string) => call<{ ok: true }>(`/${surveyId}/responses/${responseId}`, { method: 'DELETE' }),
  bulkDeleteResponses: (surveyId: string, ids: string[]) => call<{ ok: true; deleted: number }>(`/${surveyId}/responses/bulk-delete`, { method: 'POST', body: JSON.stringify({ ids }) }),
  textAnswers: (surveyId: string, questionId: string, filters: { limit?: string; offset?: string } = {}) =>
    call<TextAnswersResult>(`/${surveyId}/questions/${questionId}/text-answers${toQueryString(filters)}`),
  stats: (surveyId: string, filters: StatsFilters = {}) => call<SurveyStats>(`/${surveyId}/stats${toQueryString(filters)}`),
  respondents: (surveyId: string) => call<Respondent[]>(`/${surveyId}/respondents`),
  liveCount: (surveyId: string) => call<{ totalResponses: number; completedResponses: number }>(`/${surveyId}/live-count`),
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
  exportPdf: async (surveyId: string, code: string, filters: { dateFrom?: string; dateTo?: string } = {}) => {
    const response = await fetch(`/api/surveys/${surveyId}/report.pdf${toQueryString(filters)}`, { credentials: 'same-origin' })
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'No fue posible exportar') }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `informe-encuesta-${code}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
  },
}
