import { Plus, Trash2, GripVertical } from 'lucide-react'
import { Field, Input } from '@/design-system'
import { ImageUploadButton } from './ImageUploadButton'
import type { EmojiStep, LikertRow, MatchingTarget, QuestionConfig, QuestionType, SurveyOption } from '../types'

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

// Panel de propiedades por tipo de pregunta — construye/edita la config JSON que consume tanto
// QuestionRenderer (vista previa/pública) como el backend. surveyId habilita subir imágenes de
// opción (selección con imágenes / emparejamiento) directamente desde este panel.
export function QuestionConfigEditor({ type, config, surveyId, onChange }: {
  type: QuestionType
  config: QuestionConfig
  surveyId: string
  onChange(config: QuestionConfig): void
}) {
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'IMAGE_CHOICE'].includes(type)) {
    const options = (config.options as SurveyOption[]) || []
    return (
      <div className="survey-config-block">
        <p className="survey-config-label">Opciones</p>
        <div className="survey-config-options">
          {options.map((option, index) => (
            <div key={option.id} className="survey-config-option-row">
              <GripVertical size={14} className="survey-config-drag" />
              {type === 'IMAGE_CHOICE' && (
                <ImageUploadButton surveyId={surveyId} value={option.imageUrl} onChange={url => {
                  const next = options.slice()
                  next[index] = { ...option, imageUrl: url }
                  onChange({ ...config, options: next })
                }} />
              )}
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
        {type === 'IMAGE_CHOICE' && (
          <label className="survey-toggle-row">
            <input type="checkbox" checked={Boolean(config.multiple)} onChange={event => onChange({ ...config, multiple: event.target.checked })} />
            <span>Permitir elegir varias imágenes</span>
          </label>
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

  if (type === 'RANKING') {
    const options = (config.options as SurveyOption[]) || []
    return (
      <div className="survey-config-block">
        <p className="survey-config-label">Opciones a ordenar</p>
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
      </div>
    )
  }

  if (type === 'MATCHING') {
    const items = (config.items as SurveyOption[]) || []
    const targets = (config.targets as MatchingTarget[]) || []
    return (
      <div className="survey-config-block">
        <p className="survey-config-label">Elementos a emparejar</p>
        <div className="survey-config-options">
          {items.map((item, index) => (
            <div key={item.id} className="survey-config-option-row">
              <GripVertical size={14} className="survey-config-drag" />
              <ImageUploadButton surveyId={surveyId} value={item.imageUrl} onChange={url => {
                const next = items.slice()
                next[index] = { ...item, imageUrl: url }
                onChange({ ...config, items: next })
              }} />
              <Input
                value={item.emoji ? `${item.emoji} ${item.label}` : item.label}
                placeholder={`Elemento ${index + 1} (puedes iniciar con un emoji)`}
                onChange={event => {
                  const raw = event.target.value
                  const emojiMatch = raw.match(/^(\p{Extended_Pictographic}️?)\s*/u)
                  const next = items.slice()
                  next[index] = emojiMatch ? { ...item, emoji: emojiMatch[1], label: raw.slice(emojiMatch[0].length) } : { ...item, emoji: undefined, label: raw }
                  onChange({ ...config, items: next })
                }}
              />
              <button type="button" className="survey-config-remove" onClick={() => onChange({ ...config, items: items.filter(other => other.id !== item.id) })} aria-label="Quitar elemento">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="survey-config-add" onClick={() => onChange({ ...config, items: [...items, { id: newId('item'), label: '' }] })}>
          <Plus size={14} /> Agregar elemento
        </button>

        <p className="survey-config-label" style={{ marginTop: 8 }}>Grupos destino</p>
        <div className="survey-config-options">
          {targets.map((target, index) => (
            <div key={target.id} className="survey-config-option-row">
              <GripVertical size={14} className="survey-config-drag" />
              <Input
                value={target.label}
                placeholder={`Grupo ${index + 1}`}
                onChange={event => {
                  const next = targets.slice()
                  next[index] = { ...target, label: event.target.value }
                  onChange({ ...config, targets: next })
                }}
              />
              <button type="button" className="survey-config-remove" onClick={() => onChange({ ...config, targets: targets.filter(other => other.id !== target.id) })} aria-label="Quitar grupo">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="survey-config-add" onClick={() => onChange({ ...config, targets: [...targets, { id: newId('tgt'), label: '' }] })}>
          <Plus size={14} /> Agregar grupo
        </button>
        <p className="survey-config-empty">La calificación automática (respuesta correcta) llega en una fase siguiente; por ahora se tabulan las combinaciones más frecuentes.</p>
      </div>
    )
  }

  if (type === 'EMOJI_SCALE') {
    const steps = (config.steps as EmojiStep[]) || []
    return (
      <div className="survey-config-block">
        <p className="survey-config-label">Caritas de la escala</p>
        <div className="survey-config-options">
          {steps.map((step, index) => (
            <div key={index} className="survey-config-option-row">
              <Input value={step.emoji} maxLength={4} style={{ maxWidth: 64, textAlign: 'center', fontSize: 18 }} onChange={event => {
                const next = steps.slice()
                next[index] = { ...step, emoji: event.target.value }
                onChange({ ...config, steps: next })
              }} />
              <Input
                value={step.label || ''}
                placeholder={`Etiqueta ${index + 1}`}
                onChange={event => {
                  const next = steps.slice()
                  next[index] = { ...step, label: event.target.value }
                  onChange({ ...config, steps: next })
                }}
              />
              <button type="button" className="survey-config-remove" onClick={() => onChange({ ...config, steps: steps.filter((_, other) => other !== index) })} aria-label="Quitar carita">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="survey-config-add" onClick={() => onChange({ ...config, steps: [...steps, { emoji: '🙂', label: '' }] })}>
          <Plus size={14} /> Agregar carita
        </button>
      </div>
    )
  }

  if (type === 'RATING') {
    return (
      <Field label="Cantidad de estrellas" hint="Entre 3 y 10">
        <Input type="number" min={3} max={10} value={Number(config.max) || 5} onChange={event => onChange({ ...config, max: Number(event.target.value) })} />
      </Field>
    )
  }

  return <p className="survey-config-empty">Este tipo no requiere configuración adicional.</p>
}
