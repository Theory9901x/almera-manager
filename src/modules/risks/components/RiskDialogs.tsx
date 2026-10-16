import { useState, type ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Button, DatePicker, Field, Input, Select, Textarea } from '@/design-system'
import {
  CONTROL_EVIDENCE, CONTROL_DOCUMENTATION, CONTROL_FREQUENCY, CONTROL_IMPLEMENTATIONS, CONTROL_TYPES, IMPACT_LEVELS, PROBABILITY_LEVELS,
  controlStrength, controlWeight, impactLevel, probabilityLevel, zoneOf,
} from '../../../../shared/riskScoring.mjs'
import type { DefenseLine, Materialization, Responsible, RiskAction, RiskCause, RiskControl, RiskRow } from '../types'
import {
  ACTION_STATUS_LABELS, CONCLUSION_LABELS, ChoiceCards, EXTERNAL_PARTIES, LINE_HINTS, LINE_LABELS, MAT_STATUS_LABELS, PARTY_LABELS,
  RiskModal, TEST_LABELS, ZoneBadge, identity, todayIso,
} from './riskUi'

function useSubmit(onSave: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run() {
    setError(''); setBusy(true)
    try { await onSave() } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar'); setBusy(false) }
  }
  return { busy, error, run }
}

function Footer({ busy, error, onCancel, onSubmit, label, extra }: { busy: boolean; error: string; onCancel(): void; onSubmit(): void; label: string; extra?: ReactNode }) {
  return (
    <>
      {extra}
      {error && <p className="rsk-form-error" role="alert">{error}</p>}
      <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
      <Button identity={identity} onClick={onSubmit} disabled={busy}>{busy ? 'Guardando…' : label}</Button>
    </>
  )
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

export function ControlDialog({ control, causes, onClose, onSave }: {
  control?: RiskControl | null
  causes: RiskCause[]
  onClose(): void
  onSave(payload: Record<string, unknown>): Promise<void>
}) {
  const [form, setForm] = useState({
    description: control?.description || '', responsible: control?.responsible || '', causeId: control?.cause_id || '',
    controlType: control?.control_type || 'PREVENTIVO', implementation: control?.implementation || 'MANUAL',
    documentation: control?.documentation || 'DOCUMENTADO', frequency: control?.frequency || 'CONTINUA', evidence: control?.evidence || 'CON_REGISTRO',
    active: control?.active ?? true,
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }))
  const weight = controlWeight({ control_type: form.controlType, implementation: form.implementation })
  const strength = controlStrength(weight)
  const { busy, error, run } = useSubmit(() => onSave({ ...form, causeId: form.causeId || null }))
  return (
    <RiskModal size="lg" eyebrow="Diseño del control" title={control ? 'Editar control' : 'Nuevo control'} onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label={control ? 'Guardar control' : 'Agregar control'}
        extra={<div className="rsk-form-zone"><span>Peso</span><strong className={`rsk-strength is-${strength.key.toLowerCase()}`}>{weight}% · {strength.name}</strong></div>} />}>
      <p className="rsk-help"><Info size={14} /> Redacta el control con: <strong>responsable</strong> + <strong>acción</strong> (verifica, valida, concilia…) + <strong>complemento</strong> (qué se hace con lo encontrado y dónde queda el registro).</p>
      <Field label="Descripción del control *">
        <Textarea rows={3} value={form.description} onChange={event => set('description', event.target.value)} placeholder="El profesional de laboratorio verifica… con el fin de… En caso de… se deja registro en…" />
      </Field>
      <div className="rsk-form-grid">
        <Field label="Responsable de ejecutarlo"><Input value={form.responsible} onChange={event => set('responsible', event.target.value)} placeholder="Cargo o rol" /></Field>
        <Field label="Causa que ataca" hint="Matriz control-causa">
          <Select value={form.causeId || 'NONE'} onChange={value => set('causeId', value === 'NONE' ? '' : value)}
            options={[{ value: 'NONE', label: 'Sin asociar' }, ...causes.map(cause => ({ value: cause.id, label: `${cause.kind === 'RAIZ' ? 'Raíz' : 'Inmediata'}: ${cause.description.slice(0, 80)}` }))]} />
        </Field>
      </div>
      <p className="rsk-label">Tipo (atributo de eficiencia)</p>
      <ChoiceCards columns={3} value={form.controlType} onChange={value => set('controlType', value)}
        options={Object.values(CONTROL_TYPES).map(item => ({ value: item.key, label: `${item.name} · ${item.weight}%`, hint: `${item.description} Reduce ${item.affects === 'IMPACTO' ? 'el impacto' : 'la probabilidad'}.` }))} />
      <p className="rsk-label">Implementación (atributo de eficiencia)</p>
      <ChoiceCards columns={2} value={form.implementation} onChange={value => set('implementation', value)}
        options={Object.values(CONTROL_IMPLEMENTATIONS).map(item => ({ value: item.key, label: `${item.name} · ${item.weight}%`, hint: item.description }))} />
      <p className="rsk-label">Atributos informativos <small>(no pesan en el cálculo, pero la guía exige registrarlos)</small></p>
      <div className="rsk-form-grid is-3">
        <Field label="Documentación"><Select value={form.documentation} onChange={value => set('documentation', value as typeof form.documentation)} options={Object.entries(CONTROL_DOCUMENTATION).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Frecuencia"><Select value={form.frequency} onChange={value => set('frequency', value as typeof form.frequency)} options={Object.entries(CONTROL_FREQUENCY).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Evidencia"><Select value={form.evidence} onChange={value => set('evidence', value as typeof form.evidence)} options={Object.entries(CONTROL_EVIDENCE).map(([value, label]) => ({ value, label }))} /></Field>
      </div>
      {control && (
        <label className="rsk-check"><input type="checkbox" checked={form.active} onChange={event => set('active', event.target.checked)} /> Control activo (un control inactivo no reduce el riesgo)</label>
      )}
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Prueba de efectividad
// ---------------------------------------------------------------------------

export function TestDialog({ control, onClose, onSave }: { control: RiskControl; onClose(): void; onSave(payload: Record<string, unknown>): Promise<void> }) {
  const [form, setForm] = useState({ result: 'EFECTIVO' as keyof typeof TEST_LABELS, defenseLine: 'TERCERA' as DefenseLine, testedAt: todayIso(), observations: '' })
  const { busy, error, run } = useSubmit(() => onSave(form))
  return (
    <RiskModal eyebrow="Prueba de efectividad" title="Probar el control" onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label="Registrar prueba" />}>
      <blockquote className="rsk-quote">{control.description}</blockquote>
      <p className="rsk-label">Resultado</p>
      <ChoiceCards columns={3} value={form.result} onChange={value => setForm(current => ({ ...current, result: value }))}
        options={[
          { value: 'EFECTIVO', label: 'Efectivo', hint: 'Opera como está diseñado.', color: '#16a34a' },
          { value: 'PARCIAL', label: 'Parcial', hint: 'Opera con fallas o sin registro completo.', color: '#eab308' },
          { value: 'NO_EFECTIVO', label: 'No efectivo', hint: 'No opera. Deja de reducir el riesgo.', color: '#dc2626' },
        ]} />
      {form.result === 'NO_EFECTIVO' && <p className="rsk-warning"><AlertTriangle size={15} /> Mientras esta sea la última prueba, el control no reduce el residual: el riesgo subirá de zona si dependía de él.</p>}
      <div className="rsk-form-grid">
        <Field label="Línea de defensa"><Select value={form.defenseLine} onChange={value => setForm(current => ({ ...current, defenseLine: value as DefenseLine }))} options={(['PRIMERA', 'SEGUNDA', 'TERCERA'] as DefenseLine[]).map(value => ({ value, label: LINE_LABELS[value] }))} /></Field>
        <Field label="Fecha de la prueba"><DatePicker value={form.testedAt} onChange={value => setForm(current => ({ ...current, testedAt: value }))} max={todayIso()} /></Field>
      </div>
      <Field label={form.result === 'EFECTIVO' ? 'Observaciones' : 'Qué falló *'}>
        <Textarea rows={3} value={form.observations} onChange={event => setForm(current => ({ ...current, observations: event.target.value }))} placeholder="Muestra revisada, hallazgos, evidencia consultada…" />
      </Field>
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Accion (tratamiento o correctiva)
// ---------------------------------------------------------------------------

export function ActionDialog({ action, responsibles, materialization, onClose, onSave }: {
  action?: RiskAction | null
  responsibles: Responsible[]
  materialization?: Materialization | null
  onClose(): void
  onSave(payload: Record<string, unknown>): Promise<void>
}) {
  const [form, setForm] = useState({
    description: action?.description || '', responsibleMembershipId: action?.responsible_membership_id || '', responsibleName: action?.responsible_name || '',
    startDate: action?.start_date?.slice(0, 10) || todayIso(), dueDate: action?.due_date?.slice(0, 10) || '', status: action?.status || 'PENDIENTE',
    progress: action?.progress ?? 0, evidence: action?.evidence || '',
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }))
  const { busy, error, run } = useSubmit(() => onSave({ ...form, responsibleMembershipId: form.responsibleMembershipId || null, dueDate: form.dueDate || null, materializationId: materialization?.id }))
  const isCorrective = Boolean(materialization || action?.kind === 'CORRECTIVA')
  return (
    <RiskModal size="lg" eyebrow={isCorrective ? `Acción correctiva${materialization ? ` · ${materialization.code}` : ''}` : 'Plan de tratamiento'} title={action ? `Editar ${action.code}` : 'Nueva acción'} onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label={action ? 'Guardar acción' : 'Agregar acción'} />}>
      <Field label="Acción *"><Textarea rows={3} value={form.description} onChange={event => set('description', event.target.value)} placeholder="Qué se va a hacer, concreto y verificable" /></Field>
      <div className="rsk-form-grid">
        <Field label="Responsable (usuario)">
          <Select value={form.responsibleMembershipId || 'NONE'} onChange={value => set('responsibleMembershipId', value === 'NONE' ? '' : value)}
            options={[{ value: 'NONE', label: 'Sin usuario' }, ...responsibles.map(item => ({ value: item.id, label: item.full_name }))]} />
        </Field>
        <Field label="Responsable (cargo / área)"><Input value={form.responsibleName} onChange={event => set('responsibleName', event.target.value)} placeholder="Si no tiene usuario en el sistema" /></Field>
        <Field label="Fecha de inicio"><DatePicker value={form.startDate} onChange={value => set('startDate', value)} /></Field>
        <Field label="Fecha límite"><DatePicker value={form.dueDate} onChange={value => set('dueDate', value)} min={form.startDate || undefined} /></Field>
        <Field label="Estado"><Select value={form.status} onChange={value => set('status', value as typeof form.status)} options={Object.entries(ACTION_STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label={`Avance: ${form.status === 'TERMINADA' ? 100 : form.progress}%`}>
          <input type="range" className="rsk-range" min={0} max={100} step={5} value={form.status === 'TERMINADA' ? 100 : form.progress} disabled={form.status === 'TERMINADA'} onChange={event => set('progress', Number(event.target.value))} />
        </Field>
      </div>
      <Field label={form.status === 'TERMINADA' ? 'Evidencia del cumplimiento *' : 'Evidencia / seguimiento'}>
        <Textarea rows={2} value={form.evidence} onChange={event => set('evidence', event.target.value)} placeholder="Acta, registro, informe, enlace…" />
      </Field>
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Materializacion: reporte inicial
// ---------------------------------------------------------------------------

export function MaterializationDialog({ risk, controls, onClose, onSave }: {
  risk: RiskRow
  controls: RiskControl[]
  onClose(): void
  onSave(payload: Record<string, unknown>): Promise<void>
}) {
  const [form, setForm] = useState({
    occurredAt: todayIso(), detectedAt: todayIso(), description: '', consequences: '', actualImpact: '', economicLoss: '', affectedPeople: '',
    immediateCorrection: '', failedControlIds: [] as string[], notifiedParties: ['LIDER_PROCESO'] as string[],
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }))
  const toggle = (key: 'failedControlIds' | 'notifiedParties', value: string) => set(key, form[key].includes(value) ? form[key].filter(item => item !== value) : [...form[key], value])
  const { busy, error, run } = useSubmit(() => onSave({ ...form, actualImpact: form.actualImpact || null, economicLoss: form.economicLoss || null, affectedPeople: form.affectedPeople || null }))
  const isCorruption = risk.risk_type === 'CORRUPCION'
  return (
    <RiskModal size="xl" eyebrow={`${risk.code} · Riesgo materializado`} title="Reportar materialización" onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label="Reportar evento" />}>
      <div className="rsk-mat-banner">
        <AlertTriangle size={18} />
        <div>
          <strong>El riesgo ocurrió.</strong> Registra los hechos tal como pasaron. El evento quedará abierto hasta analizar la causa raíz, ejecutar las acciones correctivas y <strong>revaluar el riesgo</strong> en el mapa.
          {isCorruption && <> Al ser un riesgo de <strong>corrupción</strong>, debe informarse a la autoridad competente (Fiscalía, Procuraduría o Contraloría) antes de cerrarse.</>}
        </div>
      </div>
      <blockquote className="rsk-quote">{risk.description}</blockquote>
      <div className="rsk-form-grid is-4">
        <Field label="Fecha de ocurrencia *"><DatePicker value={form.occurredAt} onChange={value => set('occurredAt', value)} max={todayIso()} /></Field>
        <Field label="Fecha de detección"><DatePicker value={form.detectedAt} onChange={value => set('detectedAt', value)} min={form.occurredAt} max={todayIso()} /></Field>
        <Field label="Pérdida económica (COP)"><Input type="number" min={0} value={form.economicLoss} onChange={event => set('economicLoss', event.target.value)} placeholder="0" /></Field>
        <Field label="Personas afectadas"><Input type="number" min={0} value={form.affectedPeople} onChange={event => set('affectedPeople', event.target.value)} placeholder="0" /></Field>
      </div>
      <Field label="¿Qué ocurrió? *"><Textarea rows={3} value={form.description} onChange={event => set('description', event.target.value)} placeholder="Hechos: qué, cuándo, dónde, cómo se detectó" /></Field>
      <div className="rsk-form-grid">
        <Field label="Consecuencias"><Textarea rows={2} value={form.consequences} onChange={event => set('consequences', event.target.value)} /></Field>
        <Field label="Corrección inmediata"><Textarea rows={2} value={form.immediateCorrection} onChange={event => set('immediateCorrection', event.target.value)} placeholder="Qué se hizo de inmediato para contener" /></Field>
      </div>
      <p className="rsk-label">Impacto real del evento</p>
      <ChoiceCards columns={5} value={form.actualImpact || null} onChange={value => set('actualImpact', value)}
        options={IMPACT_LEVELS.map(item => ({ value: String(item.level), label: item.name, hint: item.economic }))} />
      {controls.length > 0 && (
        <>
          <p className="rsk-label">Controles que fallaron</p>
          <div className="rsk-checklist">
            {controls.map(control => (
              <label key={control.id} className={form.failedControlIds.includes(control.id) ? 'is-on' : ''}>
                <input type="checkbox" checked={form.failedControlIds.includes(control.id)} onChange={() => toggle('failedControlIds', control.id)} />
                <span>{control.description}</span>
              </label>
            ))}
          </div>
        </>
      )}
      <p className="rsk-label">Informado a</p>
      <div className="rsk-pills">
        {Object.entries(PARTY_LABELS).map(([key, label]) => (
          <button type="button" key={key} className={`${form.notifiedParties.includes(key) ? 'is-on' : ''} ${EXTERNAL_PARTIES.includes(key) ? 'is-external' : ''}`} onClick={() => toggle('notifiedParties', key)}>{label}</button>
        ))}
      </div>
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Materializacion: analisis, revaluacion y cierre
// ---------------------------------------------------------------------------

export function MaterializationManageDialog({ materialization, risk, controls, onClose, onSave }: {
  materialization: Materialization
  risk: RiskRow
  controls: RiskControl[]
  onClose(): void
  onSave(payload: Record<string, unknown>): Promise<void>
}) {
  const isCorruption = risk.risk_type === 'CORRUPCION'
  const [form, setForm] = useState({
    status: materialization.status,
    rootCause: materialization.root_cause,
    immediateCorrection: materialization.immediate_correction,
    consequences: materialization.consequences,
    notifiedParties: materialization.notified_parties,
    failedControlIds: materialization.failed_control_ids.map(String),
    closureNotes: materialization.closure_notes,
    revalue: !materialization.revalued_at,
    newProbability: String(materialization.new_probability || risk.inherent_probability || ''),
    newImpact: String(materialization.new_impact || risk.inherent_impact || ''),
    revaluationNote: '',
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }))
  const toggle = (key: 'failedControlIds' | 'notifiedParties', value: string) => set(key, form[key].includes(value) ? form[key].filter(item => item !== value) : [...form[key], value])
  const newZone = zoneOf(Number(form.newProbability), Number(form.newImpact))
  const { busy, error, run } = useSubmit(() => onSave({
    status: form.status, rootCause: form.rootCause, immediateCorrection: form.immediateCorrection, consequences: form.consequences,
    notifiedParties: form.notifiedParties, failedControlIds: form.failedControlIds, closureNotes: form.closureNotes,
    revaluation: form.revalue && form.revaluationNote.trim() ? { probability: Number(form.newProbability), impact: Number(form.newImpact), note: form.revaluationNote } : undefined,
  }))
  const isClosed = materialization.status === 'CERRADA'
  return (
    <RiskModal size="xl" eyebrow={`${materialization.code} · ${risk.code}`} title={isClosed ? 'Reabrir materialización' : 'Análisis, revaluación y cierre'} onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label="Guardar" />}>
      <blockquote className="rsk-quote">{materialization.description}</blockquote>
      <p className="rsk-label">Estado del evento</p>
      <ChoiceCards columns={4} value={form.status} onChange={value => set('status', value)}
        options={(isClosed ? ['EN_TRATAMIENTO', 'CERRADA'] as const : ['REPORTADA', 'EN_ANALISIS', 'EN_TRATAMIENTO', 'CERRADA'] as const).map(key => ({
          value: key, label: MAT_STATUS_LABELS[key],
          hint: key === 'CERRADA' ? 'Exige causa raíz, revaluación y correctivas cerradas.' : key === 'EN_TRATAMIENTO' && isClosed ? 'Reabre el evento.' : undefined,
        }))} />
      <div className="rsk-form-grid">
        <Field label="Análisis de causa raíz *"><Textarea rows={3} value={form.rootCause} onChange={event => set('rootCause', event.target.value)} placeholder="¿Por qué ocurrió? (5 porqués, espina de pescado…)" /></Field>
        <Field label="Consecuencias"><Textarea rows={3} value={form.consequences} onChange={event => set('consequences', event.target.value)} /></Field>
      </div>
      <Field label="Corrección inmediata"><Textarea rows={2} value={form.immediateCorrection} onChange={event => set('immediateCorrection', event.target.value)} /></Field>
      {controls.length > 0 && (
        <>
          <p className="rsk-label">Controles que fallaron</p>
          <div className="rsk-checklist">
            {controls.map(control => (
              <label key={control.id} className={form.failedControlIds.includes(String(control.id)) ? 'is-on' : ''}>
                <input type="checkbox" checked={form.failedControlIds.includes(String(control.id))} onChange={() => toggle('failedControlIds', String(control.id))} />
                <span>{control.description}</span>
              </label>
            ))}
          </div>
        </>
      )}
      <p className="rsk-label">Informado a {isCorruption && <small className="rsk-required">· corrupción: incluye una autoridad externa</small>}</p>
      <div className="rsk-pills">
        {Object.entries(PARTY_LABELS).map(([key, label]) => (
          <button type="button" key={key} className={`${form.notifiedParties.includes(key) ? 'is-on' : ''} ${EXTERNAL_PARTIES.includes(key) ? 'is-external' : ''}`} onClick={() => toggle('notifiedParties', key)}>{label}</button>
        ))}
      </div>

      <div className="rsk-revalue">
        <div className="rsk-revalue-head">
          <div>
            <p className="rsk-label">Revaluación del riesgo</p>
            <p className="rsk-help">Si el riesgo se materializó, la valoración anterior subestimaba algo. La guía exige revisar el mapa: confirma o ajusta los niveles inherentes.</p>
          </div>
          {materialization.revalued_at
            ? <span className="rsk-tag is-ok">Revaluado el {new Date(materialization.revalued_at).toLocaleDateString('es-CO')}</span>
            : <span className="rsk-tag is-warn">Pendiente</span>}
        </div>
        {materialization.revalued_at && !form.revalue ? (
          <p className="rsk-help">
            Antes: {probabilityLevel(materialization.prev_probability)?.name || '—'} × {impactLevel(materialization.prev_impact)?.name || '—'} ·
            Después: {probabilityLevel(materialization.new_probability)?.name || '—'} × {impactLevel(materialization.new_impact)?.name || '—'}. {materialization.revaluation_note}
            {' '}<button type="button" className="rsk-link" onClick={() => set('revalue', true)}>Revaluar de nuevo</button>
          </p>
        ) : (
          <div className="rsk-form-grid is-3">
            <Field label="Nueva probabilidad">
              <Select value={form.newProbability || 'NONE'} onChange={value => set('newProbability', value)} options={PROBABILITY_LEVELS.map(item => ({ value: String(item.level), label: `${item.name} (${item.percent}%)` }))} />
            </Field>
            <Field label={isCorruption ? 'Impacto (lo fija el cuestionario)' : 'Nuevo impacto'}>
              <Select value={form.newImpact || 'NONE'} onChange={value => set('newImpact', value)} disabled={isCorruption} options={IMPACT_LEVELS.map(item => ({ value: String(item.level), label: `${item.name} (${item.percent}%)` }))} />
            </Field>
            <div className="ds-field"><span className="ds-field-label">Nueva zona inherente</span><ZoneBadge zone={newZone} size="lg" /></div>
            <Field label="Justificación de la revaluación *" className="rsk-span-3">
              <Textarea rows={2} value={form.revaluationNote} onChange={event => set('revaluationNote', event.target.value)} placeholder="Qué cambió en el análisis después del evento" />
            </Field>
          </div>
        )}
      </div>
      {form.status === 'CERRADA' && (
        <Field label="Notas de cierre"><Textarea rows={2} value={form.closureNotes} onChange={event => set('closureNotes', event.target.value)} placeholder="Verificación de la eficacia de las acciones" /></Field>
      )}
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Seguimiento por linea de defensa
// ---------------------------------------------------------------------------

export function ReviewDialog({ allowedLines, period, onClose, onSave }: {
  allowedLines: DefenseLine[]
  period: string
  onClose(): void
  onSave(payload: Record<string, unknown>): Promise<void>
}) {
  const [form, setForm] = useState({ defenseLine: allowedLines[allowedLines.length - 1] as DefenseLine, conclusion: 'ADECUADO' as keyof typeof CONCLUSION_LABELS, observations: '' })
  const { busy, error, run } = useSubmit(() => onSave(form))
  return (
    <RiskModal size="lg" eyebrow={period} title="Registrar seguimiento" onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label="Registrar seguimiento" />}>
      <p className="rsk-label">Línea de defensa</p>
      <ChoiceCards columns={3} value={form.defenseLine} onChange={value => setForm(current => ({ ...current, defenseLine: value }))}
        options={(['PRIMERA', 'SEGUNDA', 'TERCERA'] as DefenseLine[]).map(key => ({ value: key, label: LINE_LABELS[key], hint: LINE_HINTS[key], disabled: !allowedLines.includes(key) }))} />
      <p className="rsk-label">Conclusión</p>
      <ChoiceCards columns={3} value={form.conclusion} onChange={value => setForm(current => ({ ...current, conclusion: value }))}
        options={[
          { value: 'ADECUADO', label: 'Adecuado', hint: 'Controles y plan operan; el riesgo está bajo control.', color: '#16a34a' },
          { value: 'REQUIERE_AJUSTES', label: 'Requiere ajustes', hint: 'Hay debilidades de diseño, ejecución o del plan.', color: '#eab308' },
          { value: 'CRITICO', label: 'Crítico', hint: 'El riesgo no está siendo gestionado.', color: '#dc2626' },
        ]} />
      <Field label="Observaciones *">
        <Textarea rows={5} value={form.observations} onChange={event => setForm(current => ({ ...current, observations: event.target.value }))} placeholder="Ej. 1. Fortalecer el diseño del control: indicar si está formalizado y quién gestiona las desviaciones. 2. Gestionar la acción de tratamiento según la fecha propuesta." />
      </Field>
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Causa
// ---------------------------------------------------------------------------

export function CauseDialog({ cause, onClose, onSave }: { cause?: RiskCause | null; onClose(): void; onSave(payload: Record<string, unknown>): Promise<void> }) {
  const [form, setForm] = useState({ kind: cause?.kind || 'RAIZ' as 'RAIZ' | 'INMEDIATA', description: cause?.description || '' })
  const { busy, error, run } = useSubmit(() => onSave(form))
  return (
    <RiskModal eyebrow="Causas" title={cause ? 'Editar causa' : 'Nueva causa'} onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label="Guardar causa" />}>
      <ChoiceCards columns={2} value={form.kind} onChange={value => setForm(current => ({ ...current, kind: value }))}
        options={[{ value: 'RAIZ', label: 'Causa raíz', hint: 'Por qué pasa: el origen del problema.' }, { value: 'INMEDIATA', label: 'Causa inmediata', hint: 'Lo que se observa: el detonante.' }]} />
      <Field label="Descripción *"><Textarea rows={3} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>
    </RiskModal>
  )
}

// ---------------------------------------------------------------------------
// Mapa de riesgos (crear / duplicar)
// ---------------------------------------------------------------------------

export function MapDialog({ mode, sourceName, onClose, onSave }: { mode: 'create' | 'duplicate'; sourceName?: string; onClose(): void; onSave(payload: Record<string, unknown>): Promise<void> }) {
  const year = new Date().getFullYear() + (mode === 'duplicate' ? 1 : 0)
  const [form, setForm] = useState({ name: `Mapa de riesgos institucional ${year}`, year: String(year), description: '' })
  const { busy, error, run } = useSubmit(() => onSave({ ...form, year: Number(form.year) }))
  return (
    <RiskModal eyebrow={mode === 'duplicate' ? `Duplicar «${sourceName}»` : 'Nueva vigencia'} title={mode === 'duplicate' ? 'Duplicar mapa a otra vigencia' : 'Nuevo mapa de riesgos'} onClose={onClose}
      footer={<Footer busy={busy} error={error} onCancel={onClose} onSubmit={run} label={mode === 'duplicate' ? 'Duplicar' : 'Crear mapa'} />}>
      {mode === 'duplicate' && <p className="rsk-help"><Info size={14} /> Se copian los riesgos activos con sus causas y controles (la identificación y el diseño se heredan). No se copian pruebas, acciones, materializaciones ni seguimientos: son historia de la vigencia anterior.</p>}
      <div className="rsk-form-grid">
        <Field label="Nombre *"><Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Vigencia *"><Input type="number" value={form.year} onChange={event => setForm(current => ({ ...current, year: event.target.value }))} /></Field>
      </div>
      {mode === 'create' && <Field label="Descripción"><Textarea rows={2} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></Field>}
    </RiskModal>
  )
}
