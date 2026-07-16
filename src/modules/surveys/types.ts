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

export interface SurveyOption { id: string; label: string; imageUrl?: string; emoji?: string; color?: string }
export interface LikertRow { id: string; label: string }
// icon: nombre de icono decorativo (ver lineIcons.ts) para la tarjeta de la linea/grupo.
// badge: texto corto de la pastilla de categoria mostrada en la tarjeta (ej. "SOLIDARIDAD").
export interface MatchingTarget { id: string; label: string; color?: string; icon?: string; badge?: string }
export interface EmojiStep { emoji: string; label?: string }

// cardAccent: activa el estilo de "tarjeta de linea" (borde superior de color, icono en cuadro
// redondeado, pastilla de categoria y checks circulares de color) sobre una pregunta de opciones
// existente, sin alterar su logica de seleccion/validacion.
export interface CardAccent { color: string; icon?: string; badge?: string }
export interface ChoiceConfig { options: SurveyOption[]; randomize?: boolean; minSelected?: number | null; maxSelected?: number | null; multiple?: boolean; cardAccent?: CardAccent }
export interface ScaleConfig { min: number; max: number; minLabel?: string; maxLabel?: string }
export interface LikertConfig { rows: LikertRow[]; scaleMin: number; scaleMax: number; scaleLabels?: string[] }
export interface NumberConfig { min?: number | null; max?: number | null }
// correctPairs: targetId -> lista de itemIds correctos para ese grupo (un mismo item puede ser
// correcto en varios grupos a la vez, ej. un ODS valido en dos lineas del programa).
// sceneImage/sceneCaption: escena decorativa opcional (ej. imagen + leyenda) junto al banco de
// elementos — pensada para ilustraciones tipo "mundo con manos", no obligatoria para todo matching.
export interface MatchingConfig { items: SurveyOption[]; targets: MatchingTarget[]; correctPairs?: Record<string, string[]>; sceneImage?: string; sceneCaption?: string }
export interface RankingConfig { options: SurveyOption[] }
export interface EmojiScaleConfig { steps: EmojiStep[] }
export interface RatingConfig { max: number }
export type QuestionConfig =
  Partial<ChoiceConfig & ScaleConfig & LikertConfig & NumberConfig & MatchingConfig & RankingConfig & EmojiScaleConfig & RatingConfig>
  & Record<string, unknown>

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
  is_template: boolean
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
export interface RankingStatItem { optionId: string; label: string; averagePosition: number | null; totalAnswered: number }
export interface MatchingStatItem { itemId: string; label: string; topTargetLabel: string | null; topTargetCount: number; breakdown: { targetId: string; label: string; count: number }[] }
export interface MatchingTargetAccuracy { targetId: string; label: string; color: string | null; accuracyPercent: number | null }

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
  ranking?: RankingStatItem[]
  matching?: MatchingStatItem[]
  perTarget?: MatchingTargetAccuracy[]
  accuracyPercent?: number | null
  npsScore?: number | null
}

export interface StatsComparison { previousMonth: string; previousCompletedResponses: number; deltaPercent: number | null }
export interface Respondent { membership_id: string; full_name: string }
export interface ComplianceIndicator { percent: number; basis: 'accuracy' | 'completion' }
export interface TimelinePoint { date: string; count: number }
export interface DemographicCrossRow { label: string; average: number | null; count: number }
export interface DemographicCross { label: string; rows: DemographicCrossRow[] }

export interface SurveyStats {
  survey: { id: string; title: string; status: SurveyStatus }
  totals: { totalResponses: number; completedResponses: number; partialResponses: number; completionRate: number }
  compliance: ComplianceIndicator
  timeline: TimelinePoint[]
  avgCompletionSeconds: number | null
  demographics: DemographicCross[]
  months: string[]
  comparison: StatsComparison | null
  questions: QuestionStat[]
}

export interface SurveyResponseListResult { rows: SurveyResponseSummary[]; total: number; limit: number; offset: number }
export interface TextAnswerRow { text_value: string; submitted_at: string | null; started_at: string }
export interface TextAnswersResult { rows: TextAnswerRow[]; total: number; limit: number; offset: number }

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
  alreadyResponded: boolean
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
  | { pairs: Record<string, string[]> }
  | { order: string[] }
