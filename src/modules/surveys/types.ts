export type SurveyAudience = 'CLIENTE_INTERNO' | 'CLIENTE_EXTERNO'
export type SurveyStatus = 'BORRADOR' | 'PUBLICADA' | 'CERRADA'

// El enum ya contempla los tipos avanzados de fase 2 (matching, ranking, imagenes, emoji, NPS,
// estrellas, archivo) para no rehacer el modelo; el constructor de fase 1 solo ofrece los básicos.
export type QuestionType =
  | 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'DROPDOWN' | 'YES_NO' | 'NUMBER' | 'DATE'
  | 'SCALE' | 'LIKERT_MATRIX' | 'MATCHING' | 'RANKING' | 'IMAGE_CHOICE' | 'EMOJI_SCALE' | 'NPS' | 'RATING' | 'FILE_UPLOAD'

export const BASIC_QUESTION_TYPES: QuestionType[] = [
  'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'NUMBER', 'DATE',
  'SCALE', 'LIKERT_MATRIX',
]

export interface SurveyOption { id: string; label: string; imageUrl?: string; emoji?: string }
export interface LikertRow { id: string; label: string }

export interface ChoiceConfig { options: SurveyOption[]; randomize?: boolean; minSelected?: number | null; maxSelected?: number | null }
export interface ScaleConfig { min: number; max: number; minLabel?: string; maxLabel?: string }
export interface LikertConfig { rows: LikertRow[]; scaleMin: number; scaleMax: number; scaleLabels?: string[] }
export interface NumberConfig { min?: number | null; max?: number | null }
export type QuestionConfig = Partial<ChoiceConfig & ScaleConfig & LikertConfig & NumberConfig> & Record<string, unknown>

export interface SurveyQuestion {
  id: string
  page_id: string
  order_index: number
  type: QuestionType
  prompt: string
  description: string
  image_url: string | null
  required: boolean
  config: QuestionConfig
  logic: Record<string, unknown>
}

export interface SurveyPage {
  id: string
  survey_id: string
  order_index: number
  title: string
  description: string
  questions: SurveyQuestion[]
}

export interface Survey {
  id: string
  code: string
  slug: string
  title: string
  description: string
  audience: SurveyAudience
  status: SurveyStatus
  theme_color: string
  opens_at: string | null
  closes_at: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  closed_at: string | null
  created_by_name: string
  response_count: number
  completed_count: number
}

export interface SurveyDetail extends Survey {
  cover_image: string | null
  allow_multiple_responses: boolean
  require_login: boolean
  thank_you_message: string
  pages: SurveyPage[]
}

export interface SurveyLink { url: string; qrDataUrl: string }

export interface SurveyResponseSummary {
  id: string
  month_reported: string
  channel: string
  completed: boolean
  started_at: string
  submitted_at: string | null
  membership_id: string | null
  respondent_name: string | null
}

export interface SurveyResponseDetail extends SurveyResponseSummary {
  items: { question_id: string; value: unknown; text_value: string; prompt: string; type: QuestionType }[]
}

export interface QuestionStatBreakdownItem { optionId?: string; value?: number; label?: string; count: number; percent: number }
export interface QuestionStatRow { rowId: string; label: string; average: number | null; totalAnswered: number }

export interface QuestionStat {
  id: string
  type: QuestionType
  prompt: string
  pageId: string
  totalAnswered: number
  breakdown?: QuestionStatBreakdownItem[]
  average?: number | null
  min?: number | null
  max?: number | null
  rows?: QuestionStatRow[]
  sample?: string[]
}

export interface SurveyStats {
  survey: { id: string; title: string; status: SurveyStatus }
  totals: { totalResponses: number; completedResponses: number; partialResponses: number; completionRate: number }
  months: string[]
  questions: QuestionStat[]
}

// ---- Superficie pública (sin autenticación) ----

export interface PublicSurveyQuestion {
  id: string
  page_id: string
  order_index: number
  type: QuestionType
  prompt: string
  description: string
  image_url: string | null
  required: boolean
  config: QuestionConfig
}

export interface PublicSurveyPage {
  id: string
  order_index: number
  title: string
  description: string
  questions: PublicSurveyQuestion[]
}

export interface PublicSurvey {
  id: string
  code: string
  title: string
  description: string
  cover_image: string | null
  audience: SurveyAudience
  status: SurveyStatus
  theme_color: string
  thank_you_message: string
  allow_multiple_responses: boolean
  require_login: boolean
  requiresLogin: boolean
  pages: PublicSurveyPage[]
}

export type AnswerValue =
  | { text: string }
  | { optionId: string | null }
  | { optionIds: string[] }
  | { number: number | null }
  | { date: string | null }
  | { value: number | null }
  | { rows: Record<string, number> }
