import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Download, Lock, Plus, Save, Send, Trash2, Unlock, X } from 'lucide-react'
import { Badge, Button, Card, Field } from '@/shared/ui'
import { adherenceService } from '../services/adherenceService'
import type { Area, CriterionResult, EvaluationDetail, EvaluationSummary, Professional, Score, ScopeResult } from '../types'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

const professionalStatusOptions = [
  ['ACTIVE_INDEFINITE', 'Activo - indefinido'],
  ['ACTIVE_ADAPTATION', 'Activo - periodo de adaptación'],
  ['WITHDRAWN', 'Retirado'],
] as const

const scoreOptions: { value: Score; label: string }[] = [
  { value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: null, label: 'N/A' },
]

const conceptLabels: Record<string, string> = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }

function conceptTone(concept: string | null): Tone {
  if (concept === 'OPTIMO') return 'success'
  if (concept === 'ACEPTABLE') return 'info'
  if (concept === 'DEFICIENTE') return 'warning'
  if (concept === 'MUY_DEFICIENTE') return 'danger'
  return 'neutral'
}

function newEvaluationForm() {
  return { professionalId: '', monthReported: '', evaluationDate: new Date().toISOString().slice(0, 10), service: '', citySite: '', professionalStatusSnapshot: 'ACTIVE_INDEFINITE' }
}

function newClosureForm() {
  return { generalObservations: '', commitments: '', improvementPlanPercent: '' }
}

type ScoreMap = Record<string, Record<string, Score>>

export default function EvaluationsPanel({ areas, professionals }: { areas: Area[]; professionals: Professional[] }) {
  const [evaluations, setEvaluations] = useState<EvaluationSummary[]>([])
  const [filterAreaId, setFilterAreaId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(newEvaluationForm)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EvaluationDetail | null>(null)
  const [scores, setScores] = useState<ScoreMap>({})
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [newRecordNumber, setNewRecordNumber] = useState('')
  const [criterionResults, setCriterionResults] = useState<CriterionResult[]>([])
  const [scopeResults, setScopeResults] = useState<ScopeResult[]>([])
  const [overallCompliance, setOverallCompliance] = useState(0)
  const [concept, setConcept] = useState<string | null>(null)
  const [closureForm, setClosureForm] = useState(newClosureForm)
  const [evaluatorSignedNameInput, setEvaluatorSignedNameInput] = useState('')
  const [professionalSignedNameInput, setProfessionalSignedNameInput] = useState('')
  const [reopenJustification, setReopenJustification] = useState('')

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  const loadEvaluations = () => adherenceService.evaluations(filterAreaId ? { areaId: filterAreaId } : {}).then(setEvaluations).catch(caught => fail(caught, 'No fue posible cargar las evaluaciones'))
  useEffect(() => { void loadEvaluations() }, [filterAreaId])

  const openEvaluation = async (id: string) => {
    setError('')
    try {
      const result = await adherenceService.evaluationDetail(id)
      setDetail(result)
      const map: ScoreMap = {}
      for (const record of result.records) map[record.id] = {}
      for (const scoreRow of result.scores) {
        map[scoreRow.evaluation_record_id] = map[scoreRow.evaluation_record_id] || {}
        map[scoreRow.evaluation_record_id][scoreRow.criterion_id] = scoreRow.score
      }
      setScores(map)
      setCriterionResults(result.criterionResults)
      setScopeResults(result.scopeResults)
      setOverallCompliance(result.overallCompliance)
      setConcept(result.evaluation.concept)
      setSelectedRecordId(result.records[0]?.id || null)
      setClosureForm({
        generalObservations: result.evaluation.general_observations || '',
        commitments: result.evaluation.commitments || '',
        improvementPlanPercent: result.evaluation.improvement_plan_percent === null || result.evaluation.improvement_plan_percent === undefined ? '' : String(result.evaluation.improvement_plan_percent),
      })
      setEvaluatorSignedNameInput(result.evaluation.evaluator_signed_name || '')
      setProfessionalSignedNameInput(result.evaluation.professional_signed_name || '')
      setReopenJustification('')
      setSelectedId(id)
    } catch (caught) { fail(caught, 'No fue posible abrir la evaluación') }
  }

  const backToList = () => { setSelectedId(null); setDetail(null) }

  const createEvaluation = async () => {
    if (!form.professionalId || !form.monthReported) { setError('Selecciona el profesional y el mes reportado'); return }
    setBusy(true); setError('')
    try {
      const created = await adherenceService.createEvaluation(form)
      setForm(newEvaluationForm())
      await loadEvaluations()
      notify('Evaluación creada')
      await openEvaluation(created.id)
    } catch (caught) { fail(caught, 'No fue posible crear la evaluación') } finally { setBusy(false) }
  }

  const addRecord = async () => {
    if (!selectedId || !newRecordNumber.trim()) return
    setBusy(true); setError('')
    try {
      const record = await adherenceService.addRecord(selectedId, { recordNumber: newRecordNumber.trim() })
      setNewRecordNumber('')
      setDetail(current => current ? { ...current, records: [...current.records, record] } : current)
      setScores(current => ({ ...current, [record.id]: {} }))
      setSelectedRecordId(record.id)
    } catch (caught) { fail(caught, 'No fue posible agregar la historia clínica') } finally { setBusy(false) }
  }

  const removeRecord = async (recordId: string) => {
    if (!selectedId) return
    try {
      await adherenceService.removeRecord(selectedId, recordId)
      setDetail(current => current ? { ...current, records: current.records.filter(record => record.id !== recordId) } : current)
      setScores(current => { const next = { ...current }; delete next[recordId]; return next })
      if (selectedRecordId === recordId) setSelectedRecordId(null)
    } catch (caught) { fail(caught, 'No fue posible quitar la historia clínica') }
  }

  const setScore = (recordId: string, criterionId: string, value: Score) => {
    setScores(current => ({ ...current, [recordId]: { ...current[recordId], [criterionId]: value } }))
  }

  const saveScores = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      const payload = Object.entries(scores).flatMap(([recordId, byCriterion]) =>
        Object.entries(byCriterion).map(([criterionId, score]) => ({ recordId, criterionId, score })))
      const result = await adherenceService.saveScores(selectedId, payload)
      setCriterionResults(result.criterionResults)
      setScopeResults(result.scopeResults)
      setOverallCompliance(result.overallCompliance)
      setConcept(result.concept)
      notify('Calificaciones guardadas')
    } catch (caught) { fail(caught, 'No fue posible guardar las calificaciones') } finally { setBusy(false) }
  }

  const scopeCompliance = (scopeId: string) => scopeResults.find(result => result.scopeId === scopeId)?.compliancePercent ?? null

  const updateRecordObservations = async (recordId: string, observations: string) => {
    if (!selectedId) return
    try {
      const record = await adherenceService.updateRecord(selectedId, recordId, { observations })
      setDetail(current => current ? { ...current, records: current.records.map(item => item.id === recordId ? record : item) } : current)
    } catch (caught) { fail(caught, 'No fue posible guardar la observación') }
  }

  const saveClosureFields = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      const updated = await adherenceService.updateEvaluation(selectedId, {
        generalObservations: closureForm.generalObservations,
        commitments: closureForm.commitments,
        improvementPlanPercent: closureForm.improvementPlanPercent === '' ? null : Number(closureForm.improvementPlanPercent),
      })
      setDetail(current => current ? { ...current, evaluation: updated } : current)
      notify('Cierre guardado')
    } catch (caught) { fail(caught, 'No fue posible guardar el cierre') } finally { setBusy(false) }
  }

  const closeEvaluationAction = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      const updated = await adherenceService.closeEvaluation(selectedId, evaluatorSignedNameInput.trim() || undefined)
      setDetail(current => current ? { ...current, evaluation: updated } : current)
      setEvaluatorSignedNameInput(updated.evaluator_signed_name || '')
      notify('Evaluación cerrada')
    } catch (caught) { fail(caught, 'No fue posible cerrar la evaluación') } finally { setBusy(false) }
  }

  const reopenEvaluationAction = async () => {
    if (!selectedId || !reopenJustification.trim()) { setError('La justificación es obligatoria para reabrir'); return }
    setBusy(true); setError('')
    try {
      const updated = await adherenceService.reopenEvaluation(selectedId, reopenJustification.trim())
      setDetail(current => current ? { ...current, evaluation: updated } : current)
      setEvaluatorSignedNameInput(''); setProfessionalSignedNameInput(''); setReopenJustification('')
      notify('Evaluación reabierta')
    } catch (caught) { fail(caught, 'No fue posible reabrir la evaluación') } finally { setBusy(false) }
  }

  const signAsProfessional = async () => {
    if (!selectedId || !professionalSignedNameInput.trim()) { setError('Escribe el nombre del profesional para registrar la firma'); return }
    setBusy(true); setError('')
    try {
      const updated = await adherenceService.signEvaluation(selectedId, professionalSignedNameInput.trim())
      setDetail(current => current ? { ...current, evaluation: updated } : current)
      notify('Firma del profesional registrada')
    } catch (caught) { fail(caught, 'No fue posible registrar la firma') } finally { setBusy(false) }
  }

  const downloadReport = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try { await adherenceService.downloadReport(selectedId) }
    catch (caught) { fail(caught, 'No fue posible generar el informe') } finally { setBusy(false) }
  }

  if (selectedId && detail) {
    const selectedRecord = detail.records.find(record => record.id === selectedRecordId) || null
    const isClosed = detail.evaluation.status === 'CLOSED'
    return (
      <div className="space-y-5">
        {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="almera-notice"><CheckCircle2 size={17} />{notice}</div>}

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button className="row-action" onClick={backToList}><ArrowLeft size={15} />Volver a evaluaciones</button>
            <div className="flex items-center gap-3">
              <Badge tone={isClosed ? 'success' : 'warning'}>{isClosed ? 'Cerrada' : 'Borrador'}</Badge>
              <Badge tone={conceptTone(concept)}>{concept ? conceptLabels[concept] || concept : 'Sin calificar'}</Badge>
              <span className="text-xs text-[var(--muted)]">Cumplimiento general: {overallCompliance.toFixed(1)}%</span>
              <Button variant="secondary" onClick={() => void downloadReport()} disabled={busy}><Download size={16} />Informe PDF</Button>
            </div>
          </div>
          <div className="grid gap-1 text-sm text-[var(--ink-soft)]">
            <strong>{detail.evaluation.professional_name}</strong>
            <span className="text-xs text-[var(--muted)]">{detail.evaluation.area_name} · {detail.evaluation.month_reported} · {detail.records.length} HC evaluadas</span>
          </div>
        </Card>

        <Card className="p-5">
          <p className="eyebrow">Historias clínicas</p>
          <h2 className="mt-1 text-xl font-black">Historias clínicas evaluadas</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.records.map(record => (
              <button
                key={record.id}
                className={`ui-badge tone-${record.id === selectedRecordId ? 'accent' : 'neutral'}`}
                onClick={() => setSelectedRecordId(record.id)}
              >
                HC {record.record_number}
                {!isClosed && <Trash2 size={12} onClick={event => { event.stopPropagation(); void removeRecord(record.id) }} />}
              </button>
            ))}
          </div>
          {!isClosed && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1"><Field label="Nueva historia clínica (No.)"><input value={newRecordNumber} onChange={event => setNewRecordNumber(event.target.value)} placeholder="Ej. 100234" /></Field></div>
              <Button onClick={() => void addRecord()} disabled={busy}><Plus size={16} />Agregar HC</Button>
            </div>
          )}
        </Card>

        {selectedRecord && (
          <Card className="p-5">
            <p className="eyebrow">Calificación</p>
            <h2 className="mt-1 text-xl font-black">HC {selectedRecord.record_number}</h2>
            <div className="mt-4 grid gap-4">
              {detail.scopes.map(scope => (
                <div key={scope.id} className="scope-editor">
                  <div className="flex items-center justify-between">
                    <strong>{scope.name}</strong>
                    <span className="text-xs text-[var(--muted)]">{scopeCompliance(scope.id) === null ? 'Sin datos' : `${scopeCompliance(scope.id)!.toFixed(1)}%`}</span>
                  </div>
                  <div className="grid gap-2">
                    {detail.criteria.filter(criterion => criterion.scope_id === scope.id).map(criterion => (
                      <div key={criterion.id} className="score-row">
                        <span>{criterion.text} <em>({Number(criterion.weight).toFixed(0)}%)</em></span>
                        <div className="score-options">
                          {scoreOptions.map(option => (
                            <button
                              key={String(option.value)}
                              disabled={isClosed}
                              className={scores[selectedRecord.id]?.[criterion.id] === option.value ? 'active' : ''}
                              onClick={() => setScore(selectedRecord.id, criterion.id, option.value)}
                            >{option.label}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Field label={`Observaciones para HC ${selectedRecord.record_number}`}>
                <textarea
                  rows={3}
                  disabled={isClosed}
                  defaultValue={selectedRecord.observations}
                  onBlur={event => void updateRecordObservations(selectedRecord.id, event.target.value)}
                  placeholder="Observaciones del evaluador para esta historia clínica"
                />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => void saveScores()} disabled={busy || isClosed}><Save size={16} />Guardar calificaciones</Button>
            </div>
          </Card>
        )}

        <Card className="p-5">
          <p className="eyebrow">Cierre</p>
          <h2 className="mt-1 text-xl font-black">Observaciones, compromisos y firmas</h2>
          <div className="dialog-form mt-4">
            <div className="full"><Field label="Observaciones generales"><textarea rows={3} disabled={isClosed} value={closureForm.generalObservations} onChange={event => setClosureForm({ ...closureForm, generalObservations: event.target.value })} /></Field></div>
            <div className="full"><Field label="Compromisos del profesional"><textarea rows={3} disabled={isClosed} value={closureForm.commitments} onChange={event => setClosureForm({ ...closureForm, commitments: event.target.value })} /></Field></div>
            <Field label="Mejoramiento esperado (%)"><input type="number" min="0" max="100" disabled={isClosed} value={closureForm.improvementPlanPercent} onChange={event => setClosureForm({ ...closureForm, improvementPlanPercent: event.target.value })} /></Field>
            {!isClosed && <div className="full"><Button variant="secondary" onClick={() => void saveClosureFields()} disabled={busy}><Save size={16} />Guardar cierre</Button></div>}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="scope-editor">
              <strong>Firma del evaluador</strong>
              {detail.evaluation.evaluator_signed_name ? (
                <span className="text-xs text-[var(--muted)]">{detail.evaluation.evaluator_signed_name} · firmado</span>
              ) : (
                <>
                  <Field label="Nombre del evaluador"><input value={evaluatorSignedNameInput} onChange={event => setEvaluatorSignedNameInput(event.target.value)} placeholder="Nombre de quien evalúa" /></Field>
                  {!isClosed && <Button onClick={() => void closeEvaluationAction()} disabled={busy}><Lock size={16} />Cerrar y firmar evaluación</Button>}
                </>
              )}
            </div>
            <div className="scope-editor">
              <strong>Firma del profesional auditado</strong>
              {detail.evaluation.professional_signed_name ? (
                <span className="text-xs text-[var(--muted)]">{detail.evaluation.professional_signed_name} · firmado</span>
              ) : (
                <>
                  <Field label="Nombre del profesional"><input value={professionalSignedNameInput} onChange={event => setProfessionalSignedNameInput(event.target.value)} placeholder="Nombre de quien acepta" /></Field>
                  <Button variant="secondary" onClick={() => void signAsProfessional()} disabled={busy}><Send size={16} />Registrar firma</Button>
                </>
              )}
            </div>
          </div>

          {isClosed && (
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1"><Field label="Justificación para reabrir"><input value={reopenJustification} onChange={event => setReopenJustification(event.target.value)} placeholder="Motivo de la reapertura" /></Field></div>
              <Button variant="secondary" onClick={() => void reopenEvaluationAction()} disabled={busy}><Unlock size={16} />Reabrir evaluación</Button>
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="almera-notice"><CheckCircle2 size={17} />{notice}</div>}

      <Card className="p-5">
        <p className="eyebrow">Registro</p>
        <h2 className="mt-1 text-xl font-black">Nueva evaluación</h2>
        <div className="dialog-form mt-4">
          <Field label="Profesional">
            <select value={form.professionalId} onChange={event => setForm({ ...form, professionalId: event.target.value })}>
              <option value="">Selecciona un profesional</option>
              {professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.full_name} — {professional.area_name}</option>)}
            </select>
          </Field>
          <Field label="Mes reportado"><input value={form.monthReported} onChange={event => setForm({ ...form, monthReported: event.target.value })} placeholder="Ej. Julio 2026" /></Field>
          <Field label="Fecha de evaluación"><input type="date" value={form.evaluationDate} onChange={event => setForm({ ...form, evaluationDate: event.target.value })} /></Field>
          <Field label="Servicio"><input value={form.service} onChange={event => setForm({ ...form, service: event.target.value })} /></Field>
          <Field label="Ciudad / sede"><input value={form.citySite} onChange={event => setForm({ ...form, citySite: event.target.value })} /></Field>
          <Field label="Estado del profesional">
            <select value={form.professionalStatusSnapshot} onChange={event => setForm({ ...form, professionalStatusSnapshot: event.target.value })}>
              {professionalStatusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <div className="full"><Button onClick={() => void createEvaluation()} disabled={busy}><Plus size={16} />Crear evaluación</Button></div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="table-toolbar">
          <div className="almera-panel-title"><span><ClipboardList size={19} /></span><div><h2>Evaluaciones</h2><p>{evaluations.length} registradas</p></div></div>
          <select value={filterAreaId} onChange={event => setFilterAreaId(event.target.value)}>
            <option value="">Todas las áreas</option>
            {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[860px]">
            <thead><tr><th>Profesional</th><th>Área</th><th>Mes</th><th>HC</th><th>Cumplimiento</th><th>Concepto</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {evaluations.map(evaluation => (
                <tr key={evaluation.id}>
                  <td><strong>{evaluation.professional_name}</strong></td>
                  <td>{evaluation.area_name}</td>
                  <td>{evaluation.month_reported}</td>
                  <td>{evaluation.total_records}</td>
                  <td>{evaluation.overall_compliance === null ? '—' : `${Number(evaluation.overall_compliance).toFixed(1)}%`}</td>
                  <td>{evaluation.concept ? <Badge tone={conceptTone(evaluation.concept)}>{conceptLabels[evaluation.concept] || evaluation.concept}</Badge> : <Badge tone="neutral">Sin calificar</Badge>}</td>
                  <td><Badge tone={evaluation.status === 'CLOSED' ? 'success' : 'warning'}>{evaluation.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}</Badge></td>
                  <td><button className="row-action" onClick={() => void openEvaluation(evaluation.id)}>Abrir</button></td>
                </tr>
              ))}
              {!evaluations.length && <tr><td colSpan={8}><div className="almera-empty"><ClipboardList size={30} /><p>Aún no hay evaluaciones registradas.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
