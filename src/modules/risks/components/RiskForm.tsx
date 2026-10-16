import { useMemo, useState } from 'react'
import { Info, Sparkles } from 'lucide-react'
import { Button, Field, Input, Select, Textarea } from '@/design-system'
import {
  CORRUPTION_QUESTIONS, IMPACT_LEVELS, PROBABILITY_LEVELS, RISK_TYPES, RISK_TYPOLOGIES, TREATMENTS,
  corruptionImpact, probabilityFromFrequency, probabilityLevel, zoneOf, type RiskTypeKey, type TreatmentKey,
} from '../../../../shared/riskScoring.mjs'
import type { RiskCatalogs, RiskRow } from '../types'
import { ChoiceCards, HeatMap, RiskModal, TYPE_COLORS, ZoneBadge, identity } from './riskUi'

const IMPACT_PHRASES = [
  'pérdida económica',
  'afectación reputacional',
  'afectación a la salud del paciente',
  'afectación en la prestación del servicio',
  'sanciones de los entes de control',
  'pérdida de la confidencialidad de la información',
  'pérdida de la disponibilidad de la información',
]

interface FormState {
  mapId: string
  processId: string
  riskType: RiskTypeKey
  classId: string
  typology: string
  ownerMembershipId: string
  ownerName: string
  impactStatement: string
  causeImmediate: string
  causeRoot: string
  description: string
  consequences: string
  processObjective: string
  asset: string
  threat: string
  vulnerability: string
  cia: string[]
  probabilityMode: 'EXPOSICION' | 'NIVEL'
  exposurePerYear: string
  inherentProbability: number | null
  inherentImpact: number | null
  impactCriterion: '' | 'ECONOMICO' | 'REPUTACIONAL' | 'SALUD'
  corruptionAnswers: boolean[]
  treatment: TreatmentKey | ''
  treatmentJustification: string
}

function initialState(catalogs: RiskCatalogs, mapId: string, risk?: RiskRow | null): FormState {
  if (risk) {
    return {
      mapId: risk.map_id, processId: risk.process_id, riskType: risk.risk_type, classId: risk.class_id || '',
      typology: risk.typology, ownerMembershipId: risk.owner_membership_id || '', ownerName: risk.owner_name,
      impactStatement: risk.impact_statement, causeImmediate: risk.cause_immediate, causeRoot: risk.cause_root,
      description: risk.description, consequences: risk.consequences, processObjective: risk.process_objective,
      asset: risk.asset, threat: risk.threat, vulnerability: risk.vulnerability, cia: risk.cia || [],
      probabilityMode: risk.exposure_per_year !== null && risk.exposure_per_year !== undefined ? 'EXPOSICION' : 'NIVEL',
      exposurePerYear: risk.exposure_per_year ?? '', inherentProbability: risk.inherent_probability, inherentImpact: risk.inherent_impact,
      impactCriterion: risk.impact_criterion, corruptionAnswers: Array.from({ length: 19 }, (_, i) => Boolean(risk.corruption_answers?.[i])),
      treatment: risk.treatment || '', treatmentJustification: risk.treatment_justification,
    }
  }
  return {
    mapId, processId: '', riskType: 'GESTION', classId: '', typology: RISK_TYPOLOGIES[0], ownerMembershipId: '', ownerName: '',
    impactStatement: IMPACT_PHRASES[1], causeImmediate: '', causeRoot: '', description: '', consequences: '', processObjective: '',
    asset: '', threat: '', vulnerability: '', cia: [], probabilityMode: 'EXPOSICION', exposurePerYear: '', inherentProbability: null,
    inherentImpact: null, impactCriterion: '', corruptionAnswers: Array(19).fill(false), treatment: '', treatmentJustification: '',
  }
}

/** Alta y edicion de un riesgo: contexto, redaccion guiada, valoracion inherente y tratamiento. */
export function RiskForm({ catalogs, mapId, risk, onClose, onSave }: {
  catalogs: RiskCatalogs
  mapId: string
  risk?: RiskRow | null
  onClose(): void
  onSave(payload: Record<string, unknown>): Promise<void>
}) {
  const [form, setForm] = useState<FormState>(() => initialState(catalogs, mapId, risk))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }))

  const isCorruption = form.riskType === 'CORRUPCION'
  const isDigital = form.riskType === 'SEGURIDAD_DIGITAL'
  const probability = form.probabilityMode === 'EXPOSICION' ? probabilityFromFrequency(form.exposurePerYear) : form.inherentProbability
  const impact = isCorruption ? corruptionImpact(form.corruptionAnswers) : form.inherentImpact
  const zone = zoneOf(probability, impact)
  const yesCount = form.corruptionAnswers.filter(Boolean).length

  const suggestion = useMemo(() => {
    if (!form.causeImmediate.trim() || !form.causeRoot.trim()) return ''
    return `Posibilidad de ${form.impactStatement.trim() || 'afectación'} por ${form.causeImmediate.trim()} debido a ${form.causeRoot.trim()}`
  }, [form.impactStatement, form.causeImmediate, form.causeRoot])

  async function submit() {
    setError('')
    if (!form.processId) { setError('Elige el proceso al que pertenece el riesgo'); return }
    if (!form.description.trim()) { setError('Escribe la descripción del riesgo (puedes usar la redacción sugerida)'); return }
    if (isCorruption && form.treatment === 'ACEPTAR') { setError('Un riesgo de corrupción no puede aceptarse'); return }
    setBusy(true)
    try {
      await onSave({
        mapId: form.mapId, processId: form.processId, riskType: form.riskType, classId: form.classId || null, typology: form.typology,
        ownerMembershipId: form.ownerMembershipId || null, ownerName: form.ownerName,
        impactStatement: form.impactStatement, causeImmediate: form.causeImmediate, causeRoot: form.causeRoot,
        description: form.description, consequences: form.consequences, processObjective: form.processObjective,
        asset: form.asset, threat: form.threat, vulnerability: form.vulnerability, cia: form.cia,
        exposurePerYear: form.probabilityMode === 'EXPOSICION' ? (form.exposurePerYear === '' ? null : Number(form.exposurePerYear)) : null,
        inherentProbability: form.probabilityMode === 'NIVEL' ? form.inherentProbability : null,
        inherentImpact: isCorruption ? undefined : form.inherentImpact,
        impactCriterion: form.impactCriterion,
        corruptionAnswers: form.corruptionAnswers,
        treatment: form.treatment || null,
        treatmentJustification: form.treatmentJustification,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible guardar')
      setBusy(false)
    }
  }

  return (
    <RiskModal
      size="xl"
      eyebrow={risk ? `Editar ${risk.code}` : 'Identificación y valoración'}
      title={risk ? 'Editar riesgo' : 'Nuevo riesgo'}
      onClose={onClose}
      footer={
        <>
          <div className="rsk-form-zone">
            <span>Zona inherente</span>
            <ZoneBadge zone={zone} size="lg" />
          </div>
          {error && <p className="rsk-form-error" role="alert">{error}</p>}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button identity={identity} onClick={submit} disabled={busy}>{busy ? 'Guardando…' : risk ? 'Guardar cambios' : 'Registrar riesgo'}</Button>
        </>
      }
    >
      <section className="rsk-form-section">
        <h3><span>1</span> Contexto</h3>
        <div className="rsk-form-grid">
          <Field label="Proceso *">
            <Select value={form.processId || 'NONE'} onChange={value => set('processId', value === 'NONE' ? '' : value)}
              options={[{ value: 'NONE', label: 'Selecciona el proceso' }, ...catalogs.processes.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))]} />
          </Field>
          <Field label="Clase de riesgo">
            <Select value={form.classId || 'NONE'} onChange={value => set('classId', value === 'NONE' ? '' : value)}
              options={[{ value: 'NONE', label: 'Sin clase' }, ...catalogs.classes.filter(item => item.active || item.id === form.classId).map(item => ({ value: item.id, label: item.name }))]} />
          </Field>
          <Field label="Tipología del evento" hint="Clasificación de la guía DAFP">
            <Select value={form.typology || 'NONE'} onChange={value => set('typology', value === 'NONE' ? '' : value)}
              options={[{ value: 'NONE', label: 'Sin tipología' }, ...RISK_TYPOLOGIES.map(item => ({ value: item, label: item }))]} />
          </Field>
          <Field label="Responsable del riesgo">
            <Select value={form.ownerMembershipId || 'NONE'} onChange={value => set('ownerMembershipId', value === 'NONE' ? '' : value)}
              options={[{ value: 'NONE', label: 'Sin asignar' }, ...catalogs.responsibles.map(item => ({ value: item.id, label: item.full_name }))]} />
          </Field>
        </div>
        <p className="rsk-label">Tipo de riesgo</p>
        <ChoiceCards
          value={form.riskType}
          onChange={value => setForm(current => ({ ...current, riskType: value, treatment: value === 'CORRUPCION' && current.treatment === 'ACEPTAR' ? '' : current.treatment }))}
          options={Object.values(RISK_TYPES).map(item => ({ value: item.key, label: item.name, hint: item.description, color: TYPE_COLORS[item.key] }))}
        />
      </section>

      <section className="rsk-form-section">
        <h3><span>2</span> Redacción del riesgo</h3>
        <p className="rsk-help"><Info size={14} /> La guía pide redactar: <em>«Posibilidad de [impacto] por [causa inmediata] debido a [causa raíz]»</em>. Llena las tres piezas y usa la redacción sugerida, o escribe la tuya.</p>
        <div className="rsk-form-grid is-3">
          <Field label="Impacto (qué se afecta)">
            <Select value={IMPACT_PHRASES.includes(form.impactStatement) ? form.impactStatement : 'OTRO'} onChange={value => set('impactStatement', value === 'OTRO' ? '' : value)}
              options={[...IMPACT_PHRASES.map(item => ({ value: item, label: item })), { value: 'OTRO', label: 'Otro (escribir)' }]} />
            {!IMPACT_PHRASES.includes(form.impactStatement) && <Input value={form.impactStatement} onChange={event => set('impactStatement', event.target.value)} placeholder="Ej. incumplimiento de metas" />}
          </Field>
          <Field label="Causa inmediata (lo que se ve)">
            <Textarea rows={2} value={form.causeImmediate} onChange={event => set('causeImmediate', event.target.value)} placeholder="Ej. el no reporte de sucesos inseguros" />
          </Field>
          <Field label="Causa raíz (por qué pasa)">
            <Textarea rows={2} value={form.causeRoot} onChange={event => set('causeRoot', event.target.value)} placeholder="Ej. el temor a acciones sancionatorias" />
          </Field>
        </div>
        {suggestion && (
          <div className="rsk-suggestion">
            <Sparkles size={15} />
            <span>{suggestion}</span>
            <button type="button" onClick={() => set('description', suggestion)}>Usar esta redacción</button>
          </div>
        )}
        <Field label="Descripción del riesgo *">
          <Textarea rows={3} value={form.description} onChange={event => set('description', event.target.value)} placeholder="Posibilidad de…" />
        </Field>
        <div className="rsk-form-grid">
          <Field label="Consecuencias">
            <Textarea rows={2} value={form.consequences} onChange={event => set('consequences', event.target.value)} placeholder="Qué pasaría si se materializa" />
          </Field>
          <Field label="Objetivo del proceso">
            <Textarea rows={2} value={form.processObjective} onChange={event => set('processObjective', event.target.value)} placeholder="Objetivo que este riesgo amenaza" />
          </Field>
        </div>
        {isDigital && (
          <div className="rsk-form-grid is-4">
            <Field label="Activo de información"><Input value={form.asset} onChange={event => set('asset', event.target.value)} placeholder="Ej. Historia clínica electrónica" /></Field>
            <Field label="Amenaza"><Input value={form.threat} onChange={event => set('threat', event.target.value)} placeholder="Ej. Ransomware" /></Field>
            <Field label="Vulnerabilidad"><Input value={form.vulnerability} onChange={event => set('vulnerability', event.target.value)} placeholder="Ej. Sin copias aisladas" /></Field>
            <div className="ds-field">
              <span className="ds-field-label">Se pierde</span>
              <div className="rsk-cia">
                {[['C', 'Confidencialidad'], ['I', 'Integridad'], ['D', 'Disponibilidad']].map(([key, label]) => (
                  <button type="button" key={key} className={form.cia.includes(key) ? 'is-on' : ''} title={label}
                    onClick={() => set('cia', form.cia.includes(key) ? form.cia.filter(item => item !== key) : [...form.cia, key])}>{key}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rsk-form-section">
        <h3><span>3</span> Valoración del riesgo inherente</h3>
        <div className="rsk-valuation">
          <div className="rsk-valuation-main">
            <div className="rsk-label-row">
              <p className="rsk-label">Probabilidad</p>
              <div className="rsk-mini-toggle">
                <button type="button" className={form.probabilityMode === 'EXPOSICION' ? 'is-on' : ''} onClick={() => set('probabilityMode', 'EXPOSICION')}>Por exposición</button>
                <button type="button" className={form.probabilityMode === 'NIVEL' ? 'is-on' : ''} onClick={() => set('probabilityMode', 'NIVEL')}>Elegir nivel</button>
              </div>
            </div>
            {form.probabilityMode === 'EXPOSICION' ? (
              <div className="rsk-exposure">
                <Field label="¿Cuántas veces al año se ejecuta la actividad que conlleva el riesgo?">
                  <Input type="number" min={0} value={form.exposurePerYear} onChange={event => set('exposurePerYear', event.target.value)} placeholder="Ej. 300" />
                </Field>
                <div className="rsk-exposure-result">
                  {probability ? <><strong>{probabilityLevel(probability)?.name}</strong><span>{probabilityLevel(probability)?.percent}% · {probabilityLevel(probability)?.description}</span></> : <span>Escribe la frecuencia para calcular el nivel.</span>}
                </div>
              </div>
            ) : (
              <ChoiceCards
                columns={5}
                value={form.inherentProbability ? String(form.inherentProbability) : null}
                onChange={value => set('inherentProbability', Number(value))}
                options={PROBABILITY_LEVELS.map(item => ({ value: String(item.level), label: `${item.name} · ${item.percent}%`, hint: item.description }))}
              />
            )}

            <div className="rsk-label-row">
              <p className="rsk-label">Impacto</p>
              {!isCorruption && (
                <div className="rsk-mini-toggle">
                  {([['ECONOMICO', 'Económico'], ['REPUTACIONAL', 'Reputacional'], ['SALUD', 'Salud']] as const).map(([key, label]) => (
                    <button type="button" key={key} className={form.impactCriterion === key ? 'is-on' : ''} onClick={() => set('impactCriterion', form.impactCriterion === key ? '' : key)}>{label}</button>
                  ))}
                </div>
              )}
            </div>
            {isCorruption ? (
              <div className="rsk-corruption">
                <p className="rsk-help"><Info size={14} /> Si el riesgo de corrupción se materializa, podría… Marca todas las que apliquen. 1–5 = Moderado, 6–11 = Mayor, 12–19 = Catastrófico (nunca Leve ni Menor).</p>
                <div className="rsk-corruption-grid">
                  {CORRUPTION_QUESTIONS.map((question, index) => (
                    <label key={question} className={form.corruptionAnswers[index] ? 'is-on' : ''}>
                      <input type="checkbox" checked={form.corruptionAnswers[index]} onChange={event => set('corruptionAnswers', form.corruptionAnswers.map((value, i) => i === index ? event.target.checked : value))} />
                      <span>{index + 1}. {question}</span>
                    </label>
                  ))}
                </div>
                <p className="rsk-corruption-count"><strong>{yesCount}</strong> respuesta(s) afirmativa(s) → impacto <strong>{impact ? IMPACT_LEVELS[impact - 1].name : 'sin definir'}</strong></p>
              </div>
            ) : (
              <div className="rsk-impact-levels">
                {IMPACT_LEVELS.map(item => (
                  <button type="button" key={item.level} className={`rsk-impact ${form.inherentImpact === item.level ? 'is-on' : ''}`} onClick={() => set('inherentImpact', item.level)}>
                    <strong>{item.name} <small>{item.percent}%</small></strong>
                    <span className={form.impactCriterion === 'ECONOMICO' ? 'is-focus' : ''}><b>Económico:</b> {item.economic}</span>
                    <span className={form.impactCriterion === 'REPUTACIONAL' ? 'is-focus' : ''}><b>Reputacional:</b> {item.reputational}</span>
                    <span className={form.impactCriterion === 'SALUD' ? 'is-focus' : ''}><b>Salud:</b> {item.health}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <aside className="rsk-valuation-side">
            <HeatMap compact markers={probability && impact ? [{ probability, impact, label: 'I', tone: 'inherent' }] : []} />
            <p className="rsk-help">Cuando se registran varios criterios de impacto, la guía toma el <strong>mayor</strong>.</p>
          </aside>
        </div>
      </section>

      <section className="rsk-form-section">
        <h3><span>4</span> Tratamiento</h3>
        <ChoiceCards
          value={form.treatment || null}
          onChange={value => set('treatment', value)}
          options={Object.values(TREATMENTS).map(item => ({ value: item.key, label: item.name, hint: item.key === 'ACEPTAR' && isCorruption ? 'No permitido para corrupción.' : item.description, disabled: item.key === 'ACEPTAR' && isCorruption }))}
        />
        <Field label="Justificación del tratamiento" hint="Obligatoria en la práctica si se acepta un riesgo en zona alta o extrema">
          <Textarea rows={2} value={form.treatmentJustification} onChange={event => set('treatmentJustification', event.target.value)} />
        </Field>
      </section>
    </RiskModal>
  )
}
