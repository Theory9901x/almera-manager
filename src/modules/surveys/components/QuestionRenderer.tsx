import { Select } from '@/design-system'
import type { PublicSurveyQuestion, QuestionConfig, SurveyOption } from '../types'
import { OptionCard } from './OptionCard'
import { ScaleControl } from './ScaleControl'

export interface RenderableQuestion {
  id: string
  type: PublicSurveyQuestion['type']
  prompt: string
  description?: string
  required: boolean
  config: QuestionConfig
}

// Renderiza la pregunta interactiva real (no una maqueta): usado tanto en la pagina publica como en
// la vista previa en vivo del constructor, para que ambas siempre coincidan pixel a pixel.
export function QuestionRenderer({ question, value, onChange, color, error, disabled }: {
  question: RenderableQuestion
  value: unknown
  onChange(value: unknown): void
  color: string
  error?: string
  disabled?: boolean
}) {
  const config = question.config || {}

  return (
    <div className="survey-question-body">
      {renderControl()}
      {error && <p className="survey-field-error">{error}</p>}
    </div>
  )

  function renderControl() {
    switch (question.type) {
      case 'SHORT_TEXT': {
        const text = (value as { text?: string } | undefined)?.text || ''
        return <input className="survey-input" value={text} disabled={disabled} placeholder="Tu respuesta" onChange={event => onChange({ text: event.target.value })} />
      }
      case 'LONG_TEXT': {
        const text = (value as { text?: string } | undefined)?.text || ''
        return <textarea className="survey-input survey-textarea" value={text} disabled={disabled} placeholder="Tu respuesta" onChange={event => onChange({ text: event.target.value })} />
      }
      case 'NUMBER': {
        const number = (value as { number?: number | null } | undefined)?.number
        return (
          <input
            type="number"
            className="survey-input"
            value={number ?? ''}
            disabled={disabled}
            min={config.min ?? undefined}
            max={config.max ?? undefined}
            placeholder="0"
            onChange={event => onChange({ number: event.target.value === '' ? null : Number(event.target.value) })}
          />
        )
      }
      case 'DATE': {
        const date = (value as { date?: string | null } | undefined)?.date || ''
        return <input type="date" className="survey-input" value={date} disabled={disabled} onChange={event => onChange({ date: event.target.value || null })} />
      }
      case 'YES_NO': {
        const optionId = (value as { optionId?: string | null } | undefined)?.optionId || null
        return (
          <div className="survey-inline-options">
            {[{ id: 'SI', label: 'Sí' }, { id: 'NO', label: 'No' }].map(option => (
              <OptionCard key={option.id} label={option.label} selected={optionId === option.id} color={color} disabled={disabled} onClick={() => onChange({ optionId: option.id })} />
            ))}
          </div>
        )
      }
      case 'SINGLE_CHOICE': {
        const optionId = (value as { optionId?: string | null } | undefined)?.optionId || null
        const options = (config.options as SurveyOption[]) || []
        return (
          <div className="survey-options-stack">
            {options.map(option => (
              <OptionCard key={option.id} label={option.label} emoji={option.emoji} selected={optionId === option.id} color={color} disabled={disabled} onClick={() => onChange({ optionId: option.id })} />
            ))}
          </div>
        )
      }
      case 'MULTIPLE_CHOICE': {
        const optionIds = new Set((value as { optionIds?: string[] } | undefined)?.optionIds || [])
        const options = (config.options as SurveyOption[]) || []
        return (
          <div className="survey-options-stack">
            {options.map(option => {
              const selected = optionIds.has(option.id)
              return (
                <OptionCard
                  key={option.id} label={option.label} emoji={option.emoji} selected={selected} multiple color={color} disabled={disabled}
                  onClick={() => {
                    const next = new Set(optionIds)
                    if (selected) next.delete(option.id); else next.add(option.id)
                    onChange({ optionIds: [...next] })
                  }}
                />
              )
            })}
          </div>
        )
      }
      case 'DROPDOWN': {
        const optionId = (value as { optionId?: string | null } | undefined)?.optionId || ''
        const options = (config.options as SurveyOption[]) || []
        return (
          <Select
            value={optionId}
            onChange={next => onChange({ optionId: next })}
            options={options.map(option => ({ value: option.id, label: option.label }))}
            placeholder="Selecciona una opción"
            disabled={disabled}
          />
        )
      }
      case 'SCALE': {
        const scaleValue = (value as { value?: number | null } | undefined)?.value ?? null
        return (
          <ScaleControl
            min={Number(config.min) || 1} max={Number(config.max) || 5} value={scaleValue}
            minLabel={config.minLabel as string} maxLabel={config.maxLabel as string}
            color={color} disabled={disabled} onChange={next => onChange({ value: next })}
          />
        )
      }
      case 'LIKERT_MATRIX': {
        const rows = (config.rows as { id: string; label: string }[]) || []
        const rowValues = (value as { rows?: Record<string, number> } | undefined)?.rows || {}
        const scaleMin = Number(config.scaleMin) || 1
        const scaleMax = Number(config.scaleMax) || 5
        return (
          <div className="survey-likert">
            {rows.map(row => (
              <div key={row.id} className="survey-likert-row">
                <p className="survey-likert-row-label">{row.label}</p>
                <ScaleControl
                  min={scaleMin} max={scaleMax} value={rowValues[row.id] ?? null} compact color={color} disabled={disabled}
                  minLabel={(config.scaleLabels as string[] | undefined)?.[0]}
                  maxLabel={(config.scaleLabels as string[] | undefined)?.[(config.scaleLabels as string[] | undefined)?.length ? (config.scaleLabels as string[]).length - 1 : 0]}
                  onChange={next => onChange({ rows: { ...rowValues, [row.id]: next } })}
                />
              </div>
            ))}
          </div>
        )
      }
      default:
        return <p className="survey-unsupported">Este tipo de pregunta se habilita en una fase siguiente.</p>
    }
  }
}
