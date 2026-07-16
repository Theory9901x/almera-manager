import { Star } from 'lucide-react'
import { Select } from '@/design-system'
import type { EmojiStep, MatchingTarget, PublicSurveyQuestion, QuestionConfig, SurveyOption } from '../types'
import { OptionCard } from './OptionCard'
import { ImageOptionCard } from './ImageOptionCard'
import { ScaleControl } from './ScaleControl'
import { RankingControl } from './RankingControl'
import { MatchingControl } from './MatchingControl'

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
export function QuestionRenderer({ question, value, onChange, color, error, disabled, optionShape }: {
  question: RenderableQuestion
  value: unknown
  onChange(value: unknown): void
  color: string
  error?: string
  disabled?: boolean
  // Ver OptionCard: fuerza check circular de color en preguntas envueltas en una tarjeta de linea.
  optionShape?: 'round' | 'square'
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
        return (
          <input
            className="survey-input" value={text} disabled={disabled} placeholder="Tu respuesta" autoCapitalize="words"
            onChange={event => onChange({ text: event.target.value })}
          />
        )
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
            inputMode="numeric"
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
        // min/max evitan el año roto (ej. "0123") que el picker nativo permite si se escribe a
        // mano sin limites — un rango amplio (120 años atras, 20 adelante) cubre cualquier fecha
        // real de cualquier encuesta (nacimiento, hoy, cita futura) sin bloquear casos legitimos.
        const currentYear = new Date().getFullYear()
        const minIso = `${currentYear - 120}-01-01`
        const maxIso = `${currentYear + 20}-12-31`
        return (
          <input
            type="date" className="survey-input" value={date} disabled={disabled} min={minIso} max={maxIso}
            onChange={event => onChange({ date: event.target.value || null })}
          />
        )
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
              <OptionCard key={option.id} label={option.label} emoji={option.emoji} selected={optionId === option.id} color={color} disabled={disabled} shape={optionShape} onClick={() => onChange({ optionId: option.id })} />
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
                  key={option.id} label={option.label} emoji={option.emoji} selected={selected} multiple color={color} disabled={disabled} shape={optionShape}
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
      case 'IMAGE_CHOICE': {
        const options = (config.options as SurveyOption[]) || []
        const multiple = Boolean(config.multiple)
        const optionId = (value as { optionId?: string | null } | undefined)?.optionId || null
        const optionIds = new Set((value as { optionIds?: string[] } | undefined)?.optionIds || [])
        return (
          <div className="survey-image-grid">
            {options.map(option => {
              const selected = multiple ? optionIds.has(option.id) : optionId === option.id
              return (
                <ImageOptionCard
                  key={option.id} label={option.label} imageUrl={option.imageUrl} selected={selected} color={color} disabled={disabled}
                  onClick={() => {
                    if (multiple) {
                      const next = new Set(optionIds)
                      if (selected) next.delete(option.id); else next.add(option.id)
                      onChange({ optionIds: [...next] })
                    } else {
                      onChange({ optionId: option.id })
                    }
                  }}
                />
              )
            })}
          </div>
        )
      }
      case 'EMOJI_SCALE': {
        const steps = (config.steps as EmojiStep[]) || []
        const scaleValue = (value as { value?: number | null } | undefined)?.value ?? null
        return (
          <div className="survey-emoji-scale">
            {steps.map((step, index) => {
              const stepValue = index + 1
              const selected = scaleValue === stepValue
              return (
                <button
                  key={index} type="button" disabled={disabled} onClick={() => onChange({ value: stepValue })}
                  className={`survey-emoji-step ${selected ? 'is-selected' : ''}`}
                  style={selected ? { borderColor: color, background: `${color}14` } : undefined}
                >
                  <span className="survey-emoji-step-face" style={{ transform: selected ? 'scale(1.15)' : 'scale(1)' }}>{step.emoji}</span>
                  {step.label && <span className="survey-emoji-step-label">{step.label}</span>}
                </button>
              )
            })}
          </div>
        )
      }
      case 'NPS': {
        const scaleValue = (value as { value?: number | null } | undefined)?.value ?? null
        const steps = Array.from({ length: 11 }, (_, index) => index)
        return (
          <div className="survey-nps">
            <div className="survey-nps-row">
              {steps.map(step => {
                const zone = step <= 6 ? 'detractor' : step <= 8 ? 'passive' : 'promoter'
                const selected = scaleValue === step
                return (
                  <button key={step} type="button" disabled={disabled} onClick={() => onChange({ value: step })} className={`survey-nps-step is-${zone} ${selected ? 'is-selected' : ''}`}>
                    {step}
                  </button>
                )
              })}
            </div>
            <div className="survey-scale-labels"><span>Nada probable</span><span>Extremadamente probable</span></div>
          </div>
        )
      }
      case 'RATING': {
        const max = Number(config.max) || 5
        const scaleValue = (value as { value?: number | null } | undefined)?.value ?? 0
        return (
          <div className="survey-rating">
            {Array.from({ length: max }, (_, index) => index + 1).map(step => (
              <button key={step} type="button" disabled={disabled} className="survey-rating-star" onClick={() => onChange({ value: step })} aria-label={`${step} estrellas`}>
                <Star size={28} fill={step <= scaleValue ? color : 'none'} color={step <= scaleValue ? color : '#CBD5E1'} strokeWidth={1.6} />
              </button>
            ))}
          </div>
        )
      }
      case 'RANKING': {
        const options = (config.options as SurveyOption[]) || []
        const order = (value as { order?: string[] } | undefined)?.order || []
        return <RankingControl options={options} order={order} color={color} disabled={disabled} onChange={next => onChange({ order: next })} />
      }
      case 'MATCHING': {
        const items = (config.items as SurveyOption[]) || []
        const targets = (config.targets as MatchingTarget[]) || []
        const pairs = (value as { pairs?: Record<string, string[]> } | undefined)?.pairs || {}
        return (
          <MatchingControl
            items={items} targets={targets} pairs={pairs} color={color} disabled={disabled}
            sceneImage={config.sceneImage as string | undefined} sceneCaption={config.sceneCaption as string | undefined}
            onChange={next => onChange({ pairs: next })}
          />
        )
      }
      default:
        return <p className="survey-unsupported">Este tipo de pregunta se habilita en una fase siguiente.</p>
    }
  }
}
