// Escala fija de todo el modulo. No es configurable por lista: ver docs/MODULO-LISTAS-DE-CHEQUEO.md.
export type ChecklistValue = 'C' | 'NC' | 'NA'

export const CHECKLIST_VALUE_LABELS: Record<ChecklistValue, string> = {
  C: 'Cumple',
  NC: 'No cumple',
  NA: 'No aplica',
}

export type ChecklistFieldType = 'TEXT' | 'LONG_TEXT' | 'DATE' | 'NUMBER' | 'SELECT'
export type ChecklistStatus = 'BORRADOR' | 'PUBLICADA' | 'ARCHIVADA'

export interface ChecklistArea {
  id: string
  name: string
  active: boolean
}

export interface ChecklistField {
  id: string
  label: string
  field_type: ChecklistFieldType
  options: string[]
  required: boolean
  order_index: number
}

export interface ChecklistCriterion {
  id: string
  domain_id: string
  item_number: string
  text: string
  guidance: string
  order_index: number
  active: boolean
}

export interface ChecklistDomain {
  id: string
  template_id: string
  name: string
  order_index: number
  criteria: ChecklistCriterion[]
}

export interface ChecklistTemplate {
  id: string
  area_id: string | null
  area_name?: string | null
  code: string
  version: string
  name: string
  description: string
  subject_label: string
  numbered_items: boolean
  status: ChecklistStatus
  created_by_name?: string
  domain_count?: number
  criteria_count?: number
  created_at: string
  updated_at: string
}

export interface ChecklistTemplateDetail extends ChecklistTemplate {
  headerFields: ChecklistField[]
  subjectFields: ChecklistField[]
  domains: ChecklistDomain[]
}

// Resultado del motor de adherencia. `percent` en null = "sin dato" (todo NA), nunca 0%.
export interface AdherenceTally {
  c: number
  nc: number
  na: number
  applicable: number
  percent: number | null
}

export interface AdherenceResult {
  overall: AdherenceTally
  byDomain: (AdherenceTally & { domainId: string })[]
  byCriterion: (AdherenceTally & { criterionId: string; domainId: string })[]
  bySubject: (AdherenceTally & { subjectId: string })[]
  expected: number
  answered: number
  pending: number
  complete: boolean
  concept: string | null
}
