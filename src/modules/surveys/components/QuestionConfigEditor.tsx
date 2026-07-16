import { Plus, Trash2, GripVertical } from 'lucide-react'
import { Field, Input } from '@/design-system'
import type { LikertRow, QuestionConfig, QuestionType, SurveyOption } from '../types'

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

// Panel de propiedades por tipo de pregunta — construye/edita la config JSON que consume tanto
// QuestionRenderer (vista previa/pública) como el backend.
export function QuestionConfigEditor({ type, config, onChange }: {
  type: QuestionType
  config: QuestionConfig
  onChange(config: QuestionConfig): void
}) {
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN'].includes(type)) {
    const options = (config.options as SurveyOption[]) || []
    return (
      <div className="survey-config-block">
        <p className="survey-config-label">Opciones</p>
        <div className="survey-config-options">
          {options.map((option, index) => (
            <div key={option.id} className="survey-config-option-row">
              <GripVertical size={14} className="survey-config-drag" />
              <Input
                value={option.label}
                placeholder={`Opción ${index + 1}`}
                onChange={event => {
                  const next = options.slice()
                  next[index] = { ...option, label: event.target.value }
                  onChange({ ...config, options: next })
                }}
              />
              <button type="button" className="survey-config-remove" onClick={() => onChange({ ...config, options: options.filter(item => item.id !== option.id) })} aria-label="Quitar opción">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="survey-config-add" onClick={() => onChange({ ...config, options: [...options, { id: newId('opt'), label: '' }] })}>
          <Plus size={14} /> Agregar opción
        </button>
        {type === 'MULTIPLE_CHOICE' && (
          <div className="survey-config-grid">
            <Field label="Mínimo de selecciones">
              <Input type="number" min={0} value={config.minSelected ?? ''} onChange={event => onChange({ ...config, minSelected: event.target.value === '' ? null : Number(event.target.value) })} />
            </Field>
            <Field label="Máximo de selecciones">
              <Input type="number" min={0} value={config.maxSelected ?? ''} onChange={event => onChange({ ...config, maxSelected: event.target.value === '' ? null : Number(event.target.value) })} />
            </Field>
          </div>
        )}
      </div>
    )
  }

  if (type === 'NUMBER') {
    return (
      <div className="survey-config-grid">
        <Field label="Valor mínimo"><Input type="number" value={config.min ?? ''} onChange={event => onChange({ ...config, min: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
        <Field label="Valor máximo"><Input type="number" value={config.max ?? ''} onChange={event => onChange({ ...config, max: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
      </div>
    )
  }

  if (type === 'SCALE') {
    return (
      <div className="survey-config-block">
        <div className="survey-config-grid">
          <Field label="Desde"><Input type="number" value={Number(config.min) || 1} onChange={event => onChange({ ...config, min: Number(event.target.value) })} /></Field>
          <Field label="Hasta"><Input type="number" value={Number(config.max) || 5} onChange={event => onChange({ ...config, max: Number(event.target.value) })} /></Field>
        </div>
        <div className="survey-config-grid">
          <Field label="Etiqueta del mínimo"><Input value={(config.minLabel as string) || ''} placeholder="Muy insatisfecho" onChange={event => onChange({ ...config, minLabel: event.target.value })} /></Field>
          <Field label="Etiqueta del máximo"><Input value={(config.maxLabel as string) || ''} placeholder="Muy satisfecho" onChange={event => onChange({ ...config, maxLabel: event.target.value })} /></Field>
        </div>
      </div>
    )
  }

  if (type === 'LIKERT_MATRIX') {
    const rows = (config.rows as LikertRow[]) || []
    return (
      <div className="survey-config-block">
        <p className="survey-config-label">Filas a evaluar</p>
        <div className="survey-config-options">
          {rows.map((row, index) => (
            <div key={row.id} className="survey-config-option-row">
              <GripVertical size={14} className="survey-config-drag" />
              <Input
                value={row.label}
                placeholder={`Fila ${index + 1}`}
                onChange={event => {
                  const next = rows.slice()
                  next[index] = { ...row, label: event.target.value }
                  onChange({ ...config, rows: next })
                }}
              />
              <button type="button" className="survey-config-remove" onClick={() => onChange({ ...config, rows: rows.filter(item => item.id !== row.id) })} aria-label="Quitar fila">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="survey-config-add" onClick={() => onChange({ ...config, rows: [...rows, { id: newId('row'), label: '' }] })}>
          <Plus size={14} /> Agregar fila
        </button>
        <div className="survey-config-grid">
          <Field label="Desde"><Input type="number" value={Number(config.scaleMin) || 1} onChange={event => onChange({ ...config, scaleMin: Number(event.target.value) })} /></Field>
          <Field label="Hasta"><Input type="number" value={Number(config.scaleMax) || 5} onChange={event => onChange({ ...config, scaleMax: Number(event.target.value) })} /></Field>
        </div>
      </div>
    )
  }

  return <p className="survey-config-empty">Este tipo no requiere configuración adicional.</p>
}
