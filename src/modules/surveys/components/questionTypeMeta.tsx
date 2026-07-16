import type { ComponentType } from 'react'
import {
  AlignLeft, Calendar, CheckSquare, ChevronDownSquare, CircleDot, Grid3x3, Hash,
  ImagePlus, ListOrdered, Puzzle, Smile, Star, Sliders, ThumbsUp, Type, Gauge, FileUp,
} from 'lucide-react'
import type { QuestionType } from '../types'

export interface QuestionTypeInfo {
  type: QuestionType
  label: string
  description: string
  icon: ComponentType<{ size?: number | string }>
  phase: 1 | 2
}

export const QUESTION_TYPE_INFO: Record<QuestionType, QuestionTypeInfo> = {
  SHORT_TEXT: { type: 'SHORT_TEXT', label: 'Texto corto', description: 'Respuesta en una línea', icon: Type, phase: 1 },
  LONG_TEXT: { type: 'LONG_TEXT', label: 'Texto largo', description: 'Respuesta en párrafo', icon: AlignLeft, phase: 1 },
  SINGLE_CHOICE: { type: 'SINGLE_CHOICE', label: 'Opción única', description: 'Elegir una sola opción', icon: CircleDot, phase: 1 },
  MULTIPLE_CHOICE: { type: 'MULTIPLE_CHOICE', label: 'Opción múltiple', description: 'Elegir una o varias opciones', icon: CheckSquare, phase: 1 },
  DROPDOWN: { type: 'DROPDOWN', label: 'Lista desplegable', description: 'Elegir de una lista', icon: ChevronDownSquare, phase: 1 },
  YES_NO: { type: 'YES_NO', label: 'Sí / No', description: 'Respuesta binaria', icon: ThumbsUp, phase: 1 },
  NUMBER: { type: 'NUMBER', label: 'Número', description: 'Valor numérico con rango', icon: Hash, phase: 1 },
  DATE: { type: 'DATE', label: 'Fecha', description: 'Selector de fecha', icon: Calendar, phase: 1 },
  SCALE: { type: 'SCALE', label: 'Escala 1–N', description: 'Satisfacción o acuerdo por niveles', icon: Sliders, phase: 1 },
  LIKERT_MATRIX: { type: 'LIKERT_MATRIX', label: 'Matriz Likert', description: 'Varias filas con la misma escala', icon: Grid3x3, phase: 1 },
  MATCHING: { type: 'MATCHING', label: 'Emparejar', description: 'Asociar elementos, imágenes o emojis', icon: Puzzle, phase: 2 },
  RANKING: { type: 'RANKING', label: 'Ordenar', description: 'Arrastrar para ordenar por preferencia', icon: ListOrdered, phase: 2 },
  IMAGE_CHOICE: { type: 'IMAGE_CHOICE', label: 'Selección con imágenes', description: 'Elegir entre opciones visuales', icon: ImagePlus, phase: 2 },
  EMOJI_SCALE: { type: 'EMOJI_SCALE', label: 'Escala con emojis', description: 'Caritas de satisfacción', icon: Smile, phase: 2 },
  NPS: { type: 'NPS', label: 'NPS (0–10)', description: 'Promotores, pasivos y detractores', icon: Gauge, phase: 2 },
  RATING: { type: 'RATING', label: 'Estrellas', description: 'Puntuación con estrellas', icon: Star, phase: 2 },
  FILE_UPLOAD: { type: 'FILE_UPLOAD', label: 'Carga de archivo', description: 'Adjuntar evidencia', icon: FileUp, phase: 2 },
}

export const BUILDER_QUESTION_TYPES: QuestionType[] = [
  'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'YES_NO', 'NUMBER', 'DATE',
  'SCALE', 'LIKERT_MATRIX',
]
