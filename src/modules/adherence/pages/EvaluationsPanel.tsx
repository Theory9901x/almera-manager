import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ClipboardCheck, ClipboardList, Download, Layers, ListChecks, Lock,
  Maximize2, Plus, Save, Search, Send, Sparkles, Unlock, X,
} from 'lucide-react'
import { Badge, Button, Card, DatePicker, Field, ModuleHero, Select, Table, moduleIdentity } from '@/design-system'
import { adherenceService } from '../services/adherenceService'
import type { Area, EvaluationDetail, EvaluationSummary, ImprovementPlan, Professional, Score } from '../types'
import { ConceptBadge } from '../design/ConceptBadge'
import { ComplianceRing } from '../design/ComplianceRing'
import { GradientButton } from '../design/GradientButton'
import { HcMatrix } from '../design/HcMatrix'
import { HcMatrixFullscreen } from '../design/HcMatrixFullscreen'
import { ToastStack } from '../design/Toast'
import { buildScoreMap, scoresToPayload } from '../design/scoreMap'
import { useLiveCompliance, type ScoreMap } from '../design/useLiveCompliance'
import { colorForPercent, conceptFromPercent, CONCEPT_LABELS, type Concept } from '../design/scopeColors'

const identity = moduleIdentity('adherence-matrix')

const professionalStatusOptions = [
  ['ACTIVE_INDEFINITE', 'Activo - indefinido'],
  ['ACTIVE_ADAPTATION', 'Activo - periodo de adaptación'],
  ['WITHDRAWN', 'Retirado'],
] as const

function newEvaluationForm() {
  return { professionalId: '', monthReported: '', evaluationDate: new Date().toISOString().slice(0, 10), service: '', citySite: '', professionalStatusSnapshot: 'ACTIVE_INDEFINITE' }
}

function newClosureForm() {
  return { generalObservations: '', commitments: '', improvementPlanPercent: '' }
}

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
  const [newRecordNumber, setNewRecordNumber] = useState('')
  const [concept, setConcept] = useState<string | null>(null)
  const [closureForm, setClosureForm] = useState(newClosureForm)
  const [evaluatorSignedNameInput, setEvaluatorSignedNameInput] = useState('')
  const [professionalSignedNameInput, setProfessionalSignedNameInput] = useState('')
  const [reopenJustification, setReopenJustification] = useState('')
  const [improvementPlan, setImprovementPlan] = useState<ImprovementPlan | null>(null)
  const [planForm, setPlanForm] = useState({ description: '', plannedStartDate: '', plannedEndDate: '' })
  // Modo ampliado y filtros de la matriz. El filtro de sección y la búsqueda recortan LO QUE SE
  // MUESTRA, nunca lo calificado: el cálculo sigue corriendo sobre la matriz completa.
  const [fullscreen, setFullscreen] = useState(false)
  const [scopeFilter, setScopeFilter] = useState('')
  const [matrixSearch, setMatrixSearch] = useState('')
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  // Cumplimiento EN VIVO con el motor compartido con el servidor. El hook va al nivel superior
  // (no dentro del bloque de detalle) porque las reglas de hooks exigen el mismo orden en cada
  // render; con la evaluación cerrada o sin abrir, recibe listas vacías.
  const live = useLiveCompliance(detail?.criteria || [], detail?.scopes || [], detail?.records || [], scores)

  // Criterios y ámbitos visibles según el filtro de sección y la búsqueda de la Parte A.
  const visibleScopes = useMemo(() => {
    if (!detail) return []
    return detail.scopes.filter(scope => !scopeFilter || scope.id === scopeFilter)
  }, [detail, scopeFilter])
  const visibleCriteria = useMemo(() => {
    if (!detail) return []
    const needle = matrixSearch.trim().toLowerCase()
    return detail.criteria.filter(criterion => !needle || criterion.text.toLowerCase().includes(needle))
  }, [detail, matrixSearch])
  const visibleRecords = useMemo(() => {
    if (!detail) return []
    const needle = matrixSearch.trim().toLowerCase()
    // La búsqueda sirve para las dos cosas que el auditor teclea: un criterio o un nº de HC.
    // Si coincide con alguna HC, se recorta a esas; si no, no toca las columnas.
    if (!needle) return detail.records
    const matching = detail.records.filter(record => record.record_number.toLowerCase().includes(needle))
    return matching.length ? matching : detail.records
  }, [detail, matrixSearch])

  /** Hallazgos críticos: las celdas en 0 (no cumple), dichas como «HC 3333 — criterio». */
  const criticalFindings = useMemo(() => {
    if (!detail) return []
    const out: { recordNumber: string; criterionText: string }[] = []
    for (const record of detail.records) {
      const byCriterion = scores[record.id] || {}
      for (const criterion of detail.criteria) {
        if (byCriterion[criterion.id] === 0) out.push({ recordNumber: record.record_number, criterionText: criterion.text })
      }
    }
    return out
  }, [detail, scores])

  /** Los criterios que peor van, con dato. Ordenados de menor a mayor cumplimiento. */
  const worstCriteria = useMemo(() => {
    if (!detail) return []
    return detail.criteria
      .map(criterion => ({ criterion, percent: live.byCriterion.get(criterion.id) ?? null }))
      .filter((row): row is { criterion: typeof row.criterion; percent: number } => row.percent !== null)
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 5)
  }, [detail, live])

  const loadEvaluations = () => adherenceService.evaluations(filterAreaId ? { areaId: filterAreaId } : {}).then(setEvaluations).catch(caught => fail(caught, 'No fue posible cargar las evaluaciones'))
  useEffect(() => { void loadEvaluations() }, [filterAreaId])

  const openEvaluation = async (id: string) => {
    setError('')
    try {
      const result = await adherenceService.evaluationDetail(id)
      setDetail(result)
      setScores(buildScoreMap(result))
      setConcept(result.evaluation.concept)
      setClosureForm({
        generalObservations: result.evaluation.general_observations || '',
        commitments: result.evaluation.commitments || '',
        improvementPlanPercent: result.evaluation.improvement_plan_percent === null || result.evaluation.improvement_plan_percent === undefined ? '' : String(result.evaluation.improvement_plan_percent),
      })
      setEvaluatorSignedNameInput(result.evaluation.evaluator_signed_name || '')
      setProfessionalSignedNameInput(result.evaluation.professional_signed_name || '')
      setReopenJustification('')
      setSelectedId(id)
      const plan = await adherenceService.evaluationPlan(id)
      setImprovementPlan(plan)
      setPlanForm({
        description: plan?.description || '',
        plannedStartDate: plan?.planned_start_date || '',
        plannedEndDate: plan?.planned_end_date || '',
      })
    } catch (caught) { fail(caught, 'No fue posible abrir la evaluación') }
  }

  const backToList = () => { setSelectedId(null); setDetail(null) }

  const savePlan = async () => {
    if (!selectedId || !planForm.description.trim()) { setError('Describe el plan de mejora'); return }
    setBusy(true); setError('')
    try {
      const saved = await adherenceService.saveEvaluationPlan(selectedId, {
        description: planForm.description.trim(),
        plannedStartDate: planForm.plannedStartDate || undefined,
        plannedEndDate: planForm.plannedEndDate || undefined,
      })
      setImprovementPlan(saved)
      notify('Plan de mejora guardado')
    } catch (caught) { fail(caught, 'No fue posible guardar el plan de mejora') } finally { setBusy(false) }
  }

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
    } catch (caught) { fail(caught, 'No fue posible agregar la historia clínica') } finally { setBusy(false) }
  }

  const removeRecord = async (recordId: string) => {
    if (!selectedId) return
    try {
      await adherenceService.removeRecord(selectedId, recordId)
      setDetail(current => current ? { ...current, records: current.records.filter(record => record.id !== recordId) } : current)
      setScores(current => { const next = { ...current }; delete next[recordId]; return next })
    } catch (caught) { fail(caught, 'No fue posible quitar la historia clínica') }
  }

  const setScore = (recordId: string, criterionId: string, value: Score) => {
    setScores(current => ({ ...current, [recordId]: { ...current[recordId], [criterionId]: value } }))
  }

  const saveScores = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      const result = await adherenceService.saveScores(selectedId, scoresToPayload(scores))
      setConcept(result.concept)
      notify('Calificaciones guardadas')
    } catch (caught) { fail(caught, 'No fue posible guardar las calificaciones') } finally { setBusy(false) }
  }


  const updateRecordObservations = async (recordId: string, observations: string) => {
    if (!selectedId) return
    try {
      const record = await adherenceService.updateRecord(selectedId, recordId, { observations })
      setDetail(current => current ? { ...current, records: current.records.map(item => item.id === recordId ? record : item) } : current)
      notify('Observación guardada')
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

  /**
   * Abre la matriz en una ventana aparte (dos monitores). GUARDA PRIMERO a proposito: la ventana
   * nueva carga su copia del servidor y no puede ver el buffer de esta pantalla, asi que sin
   * guardar arrancaria sin lo ultimo marcado. Si el guardado falla, no se abre nada — mejor un
   * mensaje que dos ventanas mostrando cosas distintas.
   */
  const openInWindow = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      if (!isClosedById(selectedId)) await adherenceService.saveScores(selectedId, scoresToPayload(scores))
      const url = `${window.location.origin}/app/adherencia/matriz/${selectedId}`
      const opened = window.open(url, `sgimr-matriz-${selectedId}`, 'width=1600,height=1000')
      if (!opened) setError('El navegador bloqueó la ventana. Permite las ventanas emergentes de sgimr.cloud e inténtalo de nuevo.')
      else notify('Calificaciones guardadas y matriz abierta en una ventana aparte')
    } catch (caught) { fail(caught, 'No fue posible guardar antes de abrir la ventana') }
    finally { setBusy(false) }
  }

  /** Una evaluacion cerrada no acepta escrituras: abrir su ventana no debe intentar guardar. */
  const isClosedById = (id: string) => detail?.evaluation.id === id && detail.evaluation.status === 'CLOSED'

  const downloadReport = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try { await adherenceService.downloadReport(selectedId) }
    catch (caught) { fail(caught, 'No fue posible generar el informe') } finally { setBusy(false) }
  }

  if (selectedId && detail) {
    const isClosed = detail.evaluation.status === 'CLOSED'
    return (
      <div className="space-y-5">
        <ToastStack notice={notice} error={error} onDismissError={() => setError('')} />

        <button className="row-action" style={{ color: identity.color }} onClick={backToList}><ArrowLeft size={15} />Volver a evaluaciones</button>

        <ModuleHero
          badge="Evaluación de adherencia"
          title={detail.evaluation.professional_name}
          subtitle={`${detail.evaluation.area_name} · ${detail.evaluation.month_reported}`}
          accent={identity.color}
          className="matrices-hero"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isClosed ? 'info' : 'neutral'}>{isClosed ? 'Cerrada' : 'Borrador'}</Badge>
              {/* Concepto EN VIVO, no el ultimo guardado: con el del servidor la cabecera decia
                  "Sin calificar" junto a un 84 % ya calculado en pantalla. Al guardar, el
                  servidor lo recalcula con los umbrales de la entidad y `concept` manda. */}
              <ConceptBadge concept={(concept || conceptFromPercent(live.overall)) as Concept | null} />
              <Button identity={identity} onClick={() => void downloadReport()} disabled={busy}><Download size={15} />Informe PDF</Button>
            </div>
          }
        >
          <div className="hero-stat-inline">
            <div><div className="num">{detail.records.length}</div><div className="lbl">HC evaluadas</div></div>
            <div><div className="num" style={{ color: colorForPercent(live.overall) }}>{live.overall === null ? '—' : `${Math.round(live.overall)}%`}</div><div className="lbl">Cumplimiento general</div></div>
          </div>
        </ModuleHero>

        {/* --- A1: KPIs de la evaluación, en vivo --- */}
        <div className="hcop-kpis">
          <div className="hcop-kpi">
            <span className="ic"><ClipboardCheck size={17} /></span>
            <div><div className="l">HC evaluadas</div><div className="v">{live.completedRecordIds.size}</div><div className="d">de {detail.records.length}</div></div>
          </div>
          <div className="hcop-kpi">
            <span className="ic"><Sparkles size={17} /></span>
            <div>
              <div className="l">Cumplimiento general</div>
              <div className="v" style={{ color: colorForPercent(live.overall) }}>{live.overall === null ? '—' : `${Math.round(live.overall)}%`}</div>
              <div className="d">ponderado, NA excluido</div>
            </div>
          </div>
          <div className="hcop-kpi">
            <span className="ic"><ListChecks size={17} /></span>
            <div><div className="l">Celdas calificadas</div><div className="v">{live.graded}/{live.totalCells}</div><div className="d">{live.totalCells ? Math.round((live.graded / live.totalCells) * 100) : 0}% del total</div></div>
          </div>
          <div className="hcop-kpi">
            <span className="ic"><AlertTriangle size={17} /></span>
            <div><div className="l">No conformidades</div><div className="v">{live.counts.zero}</div><div className="d">requieren acción</div></div>
          </div>
          <div className="hcop-kpi">
            <span className="ic"><Layers size={17} /></span>
            <div>
              <div className="l">Estado semaforización</div>
              <div className="v is-sm">{live.overall === null ? 'Sin dato' : CONCEPT_LABELS[conceptFromPercent(live.overall) as Concept]}</div>
              <div className="hcop-dots">
                <i style={{ background: '#059669' }} /><i style={{ background: '#65A30D' }} />
                <i style={{ background: '#D97706' }} /><i style={{ background: '#DC2626' }} />
              </div>
            </div>
          </div>
        </div>

        {/* --- A1: filtros de la matriz --- */}
        <div className="hcop-filters">
          <label className="hcop-f">
            <span>Sección</span>
            <Select
              value={scopeFilter || 'ALL'}
              onChange={value => setScopeFilter(value === 'ALL' ? '' : value)}
              options={[{ value: 'ALL', label: 'Todas las secciones' }, ...detail.scopes.map(scope => ({ value: scope.id, label: scope.name }))]}
            />
          </label>
          <label className="hcop-f is-grow">
            <span>Buscar criterio o HC</span>
            <span className="hcop-search">
              <Search size={14} />
              <input value={matrixSearch} onChange={event => setMatrixSearch(event.target.value)} placeholder="Texto del criterio o nº de historia clínica" />
            </span>
          </label>
          {(scopeFilter || matrixSearch) && (
            <Button variant="secondary" onClick={() => { setScopeFilter(''); setMatrixSearch('') }}><X size={15} /> Limpiar filtros</Button>
          )}
          <Button variant="secondary" onClick={() => void downloadReport()} disabled={busy}><Download size={15} /> Exportar</Button>
        </div>

        {/* --- A2 + A3: matriz y panel de análisis --- */}
        <div className="hcop-content">
          <Card accent={identity.color} className="overflow-hidden">
            <div className="hcop-mhead">
              <div>
                <p className="ds-eyebrow">Calificación</p>
                <h2 className="mt-1 text-lg font-black">Matriz de evaluación por historia clínica</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Escala 2 (cumple) · 1 (parcial) · 0 (no cumple) · NA (no aplica), ponderada por el peso del criterio.
                </p>
              </div>
              <div className="hcop-macts">
                {!isClosed && (
                  <div className="hcop-addhc">
                    <input className="ds-input" value={newRecordNumber} onChange={event => setNewRecordNumber(event.target.value)} placeholder="Nueva HC (No.)" />
                    <GradientButton onClick={() => void addRecord()} disabled={busy}><Plus size={15} />Agregar</GradientButton>
                  </div>
                )}
                {/* B1: la misma matriz con más espacio. No duplica estado, así que al volver
                    no se pierde ninguna calificación. */}
                <Button identity={identity} onClick={() => setFullscreen(true)} disabled={!detail.records.length}>
                  <Maximize2 size={15} /> Pantalla completa
                </Button>
              </div>
            </div>

            {detail.records.length ? (
              <>
                <div className="hcop-tablewrap">
                  <HcMatrix
                    variant="embedded"
                    scopes={visibleScopes}
                    criteria={visibleCriteria}
                    records={visibleRecords}
                    scores={scores}
                    live={live}
                    disabled={isClosed}
                    activeRecordId={activeRecordId}
                    onFocusRecord={setActiveRecordId}
                    onScore={setScore}
                    onRemoveRecord={!isClosed ? recordId => void removeRecord(recordId) : undefined}
                  />
                </div>
                <p className="hcop-hint">
                  Desplázate horizontalmente para ver más historias clínicas · con muchas HC usa «Pantalla completa»
                </p>
              </>
            ) : <div className="almera-empty"><p>Agrega al menos una historia clínica para empezar a calificar.</p></div>}
          </Card>

          <aside className="hcop-rpanel">
            <Card accent={identity.color} className="p-4">
              <div className="hcop-rh"><b>Cumplimiento general</b></div>
              <div className="hcop-cmp">
                <ComplianceRing percent={live.overall} size={86} strokeWidth={7} />
                <div className="hcop-cmpstat">
                  <div><span>Objetivo</span><b>90%</b></div>
                  <div><span>Celdas</span><b>{live.graded}/{live.totalCells}</b></div>
                  <div>
                    <span>Estado</span>
                    <ConceptBadge concept={conceptFromPercent(live.overall) as Concept | null} size="sm" />
                  </div>
                </div>
              </div>
            </Card>

            <Card accent={identity.color} className="p-4">
              <div className="hcop-rh"><b>Semaforización</b></div>
              <div className="hcop-semrow">
                <div className="hcop-sem is-ok"><div className="n">{live.counts.two}</div><div className="l">Cumple</div></div>
                <div className="hcop-sem is-pa"><div className="n">{live.counts.one}</div><div className="l">Parcial</div></div>
                <div className="hcop-sem is-no"><div className="n">{live.counts.zero}</div><div className="l">No cumple</div></div>
                <div className="hcop-sem is-na"><div className="n">{live.counts.na}</div><div className="l">No aplica</div></div>
              </div>
            </Card>

            <Card accent={identity.color} className="p-4">
              <div className="hcop-rh"><b>Adherencia por sección</b></div>
              {detail.scopes.map(scope => {
                const percent = live.byScope.get(scope.id) ?? null
                return (
                  <div className="hcop-secbar" key={scope.id}>
                    <span className="nm" title={scope.name}>{scope.name}</span>
                    <span className="tk"><i style={{ width: `${percent ?? 0}%`, background: colorForPercent(percent) }} /></span>
                    <span className="pv" style={{ color: colorForPercent(percent) }}>{percent === null ? '—' : `${Math.round(percent)}%`}</span>
                  </div>
                )
              })}
            </Card>

            <Card accent={identity.color} className="p-4">
              <div className="hcop-rh">
                <b>Hallazgos críticos</b>
                <span className="hcop-tag">{criticalFindings.length}</span>
              </div>
              {criticalFindings.length ? criticalFindings.slice(0, 6).map((finding, index) => (
                <div className="hcop-hall" key={`${finding.recordNumber}-${index}`}>
                  <span className="d" />
                  <div><b>HC {finding.recordNumber}</b> — {finding.criterionText}</div>
                </div>
              )) : <p className="hcop-muted">Ninguna celda calificada en 0 (no cumple).</p>}
            </Card>

            <Card accent={identity.color} className="p-4">
              <div className="hcop-rh"><b>Criterios con menor cumplimiento</b></div>
              {worstCriteria.length ? worstCriteria.map(row => (
                <div className="hcop-secbar" key={row.criterion.id}>
                  <span className="nm" title={row.criterion.text}>{row.criterion.text}</span>
                  <span className="tk"><i style={{ width: `${row.percent}%`, background: colorForPercent(row.percent) }} /></span>
                  <span className="pv" style={{ color: colorForPercent(row.percent) }}>{Math.round(row.percent)}%</span>
                </div>
              )) : <p className="hcop-muted">Aún no hay criterios calificados.</p>}
            </Card>
          </aside>
        </div>

        {detail.records.length > 0 && (
          <Card accent={identity.color} className="p-5">
            <p className="ds-eyebrow">Notas</p>
            <h2 className="mt-1 text-xl font-black">Observaciones por historia clínica</h2>
            <div className="mt-3 divide-y divide-[var(--border-hairline)]">
              {detail.records.map(record => (
                <div key={record.id} className="hc-observations-row">
                  <strong>HC {record.record_number}</strong>
                  <input
                    disabled={isClosed}
                    defaultValue={record.observations}
                    onBlur={event => void updateRecordObservations(record.id, event.target.value)}
                    placeholder="Observación del evaluador para esta HC (opcional)"
                  />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* --- B1..B4: modo ampliado. Recibe el MISMO buffer de calificaciones. --- */}
        <HcMatrixFullscreen
          open={fullscreen}
          onClose={() => setFullscreen(false)}
          evaluationTitle={detail.evaluation.professional_name}
          evaluationSubtitle={`${detail.evaluation.area_name} · ${detail.evaluation.month_reported} · ${detail.records.length} historias clínicas`}
          scopes={detail.scopes}
          criteria={detail.criteria}
          records={detail.records}
          scores={scores}
          live={live}
          disabled={isClosed}
          onScore={setScore}
          onSave={() => void saveScores()}
          saving={busy}
          onExportPdf={() => void downloadReport()}
          exporting={busy}
          onOpenWindow={() => void openInWindow()}
        />

        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Seguimiento</p>
          <h2 className="mt-1 text-xl font-black">Plan de mejora</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">El profesional verá este plan en "Mi plan de trabajo" y podrá registrar seguimientos con evidencia.</p>
          <div className="dialog-form mt-4">
            <div className="full"><Field label="Descripción del plan"><textarea className="ds-input ds-textarea" rows={3} value={planForm.description} onChange={event => setPlanForm({ ...planForm, description: event.target.value })} placeholder="Qué debe hacer el profesional para mejorar" /></Field></div>
            <Field label="Fecha inicio planeada"><DatePicker value={planForm.plannedStartDate} onChange={value => setPlanForm({ ...planForm, plannedStartDate: value })} /></Field>
            <Field label="Fecha fin planeada"><DatePicker value={planForm.plannedEndDate} onChange={value => setPlanForm({ ...planForm, plannedEndDate: value })} /></Field>
            <div className="full flex items-center gap-3">
              <GradientButton onClick={() => void savePlan()} disabled={busy}><Save size={16} />{improvementPlan ? 'Actualizar plan' : 'Crear plan'}</GradientButton>
              {improvementPlan && <span className="text-xs text-[var(--muted)]">Estado: {improvementPlan.status} · {improvementPlan.progress_percent}% de avance</span>}
            </div>
          </div>
        </Card>

        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Cierre</p>
          <h2 className="mt-1 text-xl font-black">Observaciones, compromisos y firmas</h2>
          <div className="dialog-form mt-4">
            <div className="full"><Field label="Observaciones generales"><textarea className="ds-input ds-textarea" rows={3} disabled={isClosed} value={closureForm.generalObservations} onChange={event => setClosureForm({ ...closureForm, generalObservations: event.target.value })} /></Field></div>
            <div className="full"><Field label="Compromisos del profesional"><textarea className="ds-input ds-textarea" rows={3} disabled={isClosed} value={closureForm.commitments} onChange={event => setClosureForm({ ...closureForm, commitments: event.target.value })} /></Field></div>
            <Field label="Mejoramiento esperado (%)"><input className="ds-input" type="number" min="0" max="100" disabled={isClosed} value={closureForm.improvementPlanPercent} onChange={event => setClosureForm({ ...closureForm, improvementPlanPercent: event.target.value })} /></Field>
            {!isClosed && <div className="full"><Button variant="secondary" onClick={() => void saveClosureFields()} disabled={busy}><Save size={16} />Guardar cierre</Button></div>}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="scope-editor">
              <strong>Firma del evaluador</strong>
              {detail.evaluation.evaluator_signed_name ? (
                <span className="text-xs text-[var(--muted)]">{detail.evaluation.evaluator_signed_name} · firmado</span>
              ) : (
                <>
                  <Field label="Nombre del evaluador"><input className="ds-input" value={evaluatorSignedNameInput} onChange={event => setEvaluatorSignedNameInput(event.target.value)} placeholder="Nombre de quien evalúa" /></Field>
                  {!isClosed && <Button identity={identity} onClick={() => void closeEvaluationAction()} disabled={busy}><Lock size={16} />Cerrar y firmar evaluación</Button>}
                </>
              )}
            </div>
            <div className="scope-editor">
              <strong>Firma del profesional auditado</strong>
              {detail.evaluation.professional_signed_name ? (
                <span className="text-xs text-[var(--muted)]">{detail.evaluation.professional_signed_name} · firmado</span>
              ) : (
                <>
                  <Field label="Nombre del profesional"><input className="ds-input" value={professionalSignedNameInput} onChange={event => setProfessionalSignedNameInput(event.target.value)} placeholder="Nombre de quien acepta" /></Field>
                  <Button variant="secondary" onClick={() => void signAsProfessional()} disabled={busy}><Send size={16} />Registrar firma</Button>
                </>
              )}
            </div>
          </div>

          {isClosed && (
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="min-w-[260px] flex-1"><Field label="Justificación para reabrir"><input className="ds-input" value={reopenJustification} onChange={event => setReopenJustification(event.target.value)} placeholder="Motivo de la reapertura" /></Field></div>
              <Button variant="secondary" onClick={() => void reopenEvaluationAction()} disabled={busy}><Unlock size={16} />Reabrir evaluación</Button>
            </div>
          )}
        </Card>

        {/* --- A4: pie con el progreso y las acciones. Pegado al scroll: con una matriz larga,
            «Guardar» al final de la página obliga a bajar hasta el fondo para no perder nada. --- */}
        <div className="hcop-foot">
          <div className="hcop-prog">
            <span className="ic"><ListChecks size={16} /></span>
            <div>
              <div className="l">Progreso de la evaluación</div>
              <div className="v">{live.graded} de {live.totalCells} celdas calificadas</div>
            </div>
            <span className="tk"><i style={{ width: `${live.totalCells ? (live.graded / live.totalCells) * 100 : 0}%` }} /></span>
            <b>{live.totalCells ? Math.round((live.graded / live.totalCells) * 100) : 0}%</b>
          </div>
          <div className="hcop-fbtns">
            <Button variant="secondary" onClick={() => void saveScores()} disabled={busy || isClosed}>
              <Save size={15} /> Guardar borrador
            </Button>
            <Button variant="secondary" onClick={() => void saveScores()} disabled={busy || isClosed}>
              <ClipboardCheck size={15} /> Guardar calificaciones
            </Button>
            {!isClosed
              ? <GradientButton onClick={() => void closeEvaluationAction()} disabled={busy}><Lock size={15} />Finalizar evaluación</GradientButton>
              : <Button variant="secondary" onClick={() => void reopenEvaluationAction()} disabled={busy}><Unlock size={15} />Reabrir</Button>}
          </div>
        </div>
      </div>
    )
  }

  const closedCount = evaluations.filter(evaluation => evaluation.status === 'CLOSED').length
  const complianceValues = evaluations.map(evaluation => evaluation.overall_compliance).filter((value): value is number => value !== null)
  const avgCompliance = complianceValues.length ? complianceValues.reduce((sum, value) => sum + Number(value), 0) / complianceValues.length : null

  return (
    <div className="space-y-5">
      <ToastStack notice={notice} error={error} onDismissError={() => setError('')} />

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Registro</p>
        <h2 className="mt-1 text-xl font-black">Nueva evaluación</h2>
        <div className="dialog-form mt-4">
          <Field label="Profesional">
            <Select
              value={form.professionalId}
              onChange={value => setForm({ ...form, professionalId: value })}
              placeholder="Selecciona un profesional"
              options={professionals.map(professional => ({ value: professional.id, label: `${professional.full_name} — ${professional.area_name}` }))}
            />
          </Field>
          <Field label="Mes reportado"><input className="ds-input" value={form.monthReported} onChange={event => setForm({ ...form, monthReported: event.target.value })} placeholder="Ej. Julio 2026" /></Field>
          <Field label="Fecha de evaluación"><DatePicker value={form.evaluationDate} onChange={value => setForm({ ...form, evaluationDate: value })} /></Field>
          <Field label="Servicio"><input className="ds-input" value={form.service} onChange={event => setForm({ ...form, service: event.target.value })} /></Field>
          <Field label="Ciudad / sede"><input className="ds-input" value={form.citySite} onChange={event => setForm({ ...form, citySite: event.target.value })} /></Field>
          <Field label="Estado del profesional">
            <Select
              value={form.professionalStatusSnapshot}
              onChange={value => setForm({ ...form, professionalStatusSnapshot: value })}
              options={professionalStatusOptions.map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <div className="full"><Button identity={identity} onClick={() => void createEvaluation()} disabled={busy}><Plus size={16} />Crear evaluación</Button></div>
        </div>
      </Card>

      <Card accent={identity.color} className="overflow-hidden">
        <div className="table-toolbar">
          <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
            <span><ClipboardList size={19} /></span>
            <div><h2>Evaluaciones</h2><p>{evaluations.length} registradas</p></div>
          </div>
          <div className="evaluations-stat-strip">
            <div><span className="num">{evaluations.length}</span><span className="lbl">Total</span></div>
            <div><span className="num">{closedCount}</span><span className="lbl">Cerradas</span></div>
            <div><span className="num" style={{ color: colorForPercent(avgCompliance) }}>{avgCompliance === null ? '—' : `${avgCompliance.toFixed(0)}%`}</span><span className="lbl">Cumpl. promedio</span></div>
          </div>
          <div className="w-[220px]">
            <Select
              value={filterAreaId || 'ALL'}
              onChange={value => setFilterAreaId(value === 'ALL' ? '' : value)}
              options={[{ value: 'ALL', label: 'Todas las áreas' }, ...areas.map(area => ({ value: area.id, label: area.name }))]}
            />
          </div>
        </div>
        <div className="evaluations-table">
          <Table>
            <thead><tr><th>Profesional</th><th>Área</th><th>Mes</th><th>HC</th><th>Cumplimiento</th><th>Concepto</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {evaluations.map(evaluation => (
                <tr key={evaluation.id}>
                  <td><strong>{evaluation.professional_name}</strong></td>
                  <td>{evaluation.area_name}</td>
                  <td>{evaluation.month_reported}</td>
                  <td className="tabular-col">{evaluation.total_records}</td>
                  <td className="tabular-col">{evaluation.overall_compliance === null ? '—' : `${Number(evaluation.overall_compliance).toFixed(1)}%`}</td>
                  <td><ConceptBadge concept={evaluation.concept as Concept | null} size="sm" /></td>
                  <td><Badge tone={evaluation.status === 'CLOSED' ? 'info' : 'neutral'}>{evaluation.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}</Badge></td>
                  <td><button className="row-action" style={{ color: identity.color }} onClick={() => void openEvaluation(evaluation.id)}>Abrir</button></td>
                </tr>
              ))}
              {!evaluations.length && <tr><td colSpan={8}><div className="almera-empty"><ClipboardList size={30} /><p>Aún no hay evaluaciones registradas.</p></div></td></tr>}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
