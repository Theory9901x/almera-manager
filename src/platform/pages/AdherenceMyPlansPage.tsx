import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CalendarClock, ClipboardList, Download, FileText, Play, Upload, X } from 'lucide-react'
import { PageHeader, moduleIdentity } from '@/design-system'
import { adherenceService } from '@/modules/adherence/services/adherenceService'
import type { ImprovementPlan, PlanFollowup } from '@/modules/adherence/types'
import { PlanStatusBadge } from '@/modules/adherence/design/PlanStatusBadge'
import { ComplianceRing } from '@/modules/adherence/design/ComplianceRing'
import { GradientButton } from '@/modules/adherence/design/GradientButton'
import { ToastStack } from '@/modules/adherence/design/Toast'

const identity = moduleIdentity('adherence-matrix')
const STATUS_COLOR: Record<string, string> = { NO_INICIADO: '#94A3B8', EN_EJECUCION: '#65A30D', TERMINADO: '#059669' }

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString()
}

export default function AdherenceMyPlansPage() {
  const [plans, setPlans] = useState<ImprovementPlan[]>([])
  const [notLinked, setNotLinked] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [followups, setFollowups] = useState<PlanFollowup[]>([])
  const [description, setDescription] = useState('')
  const [progressPercent, setProgressPercent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  const loadPlans = () => {
    setNotLinked(false)
    adherenceService.myPlans()
      .then(setPlans)
      .catch(caught => {
        if (caught instanceof Error && caught.message.includes('vinculada')) setNotLinked(true)
        else fail(caught, 'No fue posible cargar tus planes de mejora')
      })
  }

  useEffect(() => { loadPlans() }, [])

  const selected = plans.find(plan => plan.id === selectedId) || null

  const openPlan = async (id: string) => {
    setError('')
    setSelectedId(id)
    try { setFollowups(await adherenceService.followups(id)) }
    catch (caught) { fail(caught, 'No fue posible cargar los seguimientos') }
  }

  const refreshSelected = async () => {
    if (!selectedId) return
    const updated = await adherenceService.plan(selectedId)
    setPlans(current => current.map(plan => plan.id === selectedId ? { ...plan, ...updated } : plan))
  }

  const backToList = () => { setSelectedId(null); setFollowups([]); setDescription(''); setProgressPercent('') }

  const startPlan = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try { await adherenceService.startPlan(selectedId); await refreshSelected(); notify('Plan iniciado') }
    catch (caught) { fail(caught, 'No fue posible iniciar el plan') } finally { setBusy(false) }
  }

  const completePlan = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try { await adherenceService.completePlan(selectedId); await refreshSelected(); notify('Plan marcado como terminado') }
    catch (caught) { fail(caught, 'No fue posible marcar el plan como terminado') } finally { setBusy(false) }
  }

  const addFollowup = async () => {
    if (!selectedId || !description.trim() || progressPercent === '') { setError('Describe qué se hizo y el % de avance'); return }
    setBusy(true); setError('')
    try {
      await adherenceService.addFollowup(selectedId, description.trim(), Number(progressPercent), fileInputRef.current?.files || null)
      setDescription(''); setProgressPercent('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setFollowups(await adherenceService.followups(selectedId))
      await refreshSelected()
      notify('Seguimiento registrado')
    } catch (caught) { fail(caught, 'No fue posible registrar el seguimiento') } finally { setBusy(false) }
  }

  const downloadEvidence = (followupId: string, evidenceId: string, originalName: string) => {
    if (!selectedId) return
    void adherenceService.downloadFollowupEvidence(selectedId, followupId, evidenceId, originalName).catch(caught => fail(caught, 'No fue posible descargar el archivo'))
  }

  if (notLinked) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-5">
        <PageHeader eyebrow="Matrices de adherencia" title="Mi plan de trabajo" description="Seguimiento a tus planes de mejora asignados." identity={identity} />
        <div className="surface-panel">
          <p className="text-sm text-[var(--muted)]">Tu cuenta todavía no está vinculada a ningún profesional auditado. Pide al administrador que la vincule desde Usuarios.</p>
        </div>
      </div>
    )
  }

  if (selected) {
    const color = STATUS_COLOR[selected.status]
    const canAddFollowup = selected.status !== 'TERMINADO'
    return (
      <div className="mx-auto max-w-[1000px] space-y-5">
        <ToastStack notice={notice} error={error} onDismissError={() => setError('')} />

        <div className="matrix-toolbar-glass">
          <div className="matrix-toolbar-glass-top">
            <button className="row-action" onClick={backToList}><ArrowLeft size={15} />Volver a mis planes</button>
            <div className="matrix-toolbar-glass-actions">
              <PlanStatusBadge status={selected.status} />
              {selected.status === 'NO_INICIADO' && <GradientButton onClick={() => void startPlan()} disabled={busy}><Play size={16} />Iniciar plan</GradientButton>}
              {selected.status === 'EN_EJECUCION' && selected.progress_percent >= 100 && <GradientButton onClick={() => void completePlan()} disabled={busy}>Marcar como terminado</GradientButton>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <ComplianceRing percent={selected.progress_percent} size={44} strokeWidth={5} color={color} />
            <div>
              <p className="text-sm font-black">{selected.area_name} · {selected.month_reported}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]"><CalendarClock size={12} /> Planeado: {formatDate(selected.planned_start_date)} — {formatDate(selected.planned_end_date)}</p>
            </div>
          </div>
        </div>

        <div className="surface-panel">
          <p className="ds-eyebrow">Descripción del plan</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{selected.description}</p>
        </div>

        {canAddFollowup && (
          <div className="surface-panel">
            <p className="ds-eyebrow">Nuevo seguimiento</p>
            <h2 className="mt-1 text-lg font-black">Registra tu avance</h2>
            <div className="mt-4 grid gap-3">
              <textarea rows={3} className="ds-input ds-textarea w-full" placeholder="¿Qué se hizo en este seguimiento?" value={description} onChange={event => setDescription(event.target.value)} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[140px]">
                  <label className="mb-1 block text-xs font-bold text-[var(--muted)]">% de avance</label>
                  <input className="ds-input" type="number" min="0" max="100" value={progressPercent} onChange={event => setProgressPercent(event.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold text-[var(--muted)]">Evidencia (opcional)</label>
                  <input ref={fileInputRef} type="file" multiple />
                </div>
                <GradientButton onClick={() => void addFollowup()} disabled={busy}><Upload size={16} />Guardar seguimiento</GradientButton>
              </div>
            </div>
          </div>
        )}

        <div className="surface-panel">
          <p className="ds-eyebrow">Bitácora</p>
          <h2 className="mt-1 text-lg font-black">Línea de tiempo de seguimientos</h2>
          {followups.length ? (
            <div className="plan-timeline">
              {followups.map(followup => (
                <div key={followup.id} className="plan-timeline-item">
                  <div className="plan-timeline-dot" />
                  <div className="plan-timeline-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">{followup.author_name}</strong>
                      <span className="font-mono text-xs text-[var(--muted)]">{new Date(followup.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--ink-soft)]">{followup.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <ComplianceRing percent={followup.progress_percent} size={22} strokeWidth={3} showLabel={false} color="#4F46E5" />
                      <span className="text-xs font-bold text-[var(--muted)]">{followup.progress_percent}% de avance</span>
                    </div>
                    {followup.evidence.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {followup.evidence.map(item => (
                          <button key={item.id} className="plan-evidence-chip" onClick={() => downloadEvidence(followup.id, item.id, item.original_name)}>
                            <FileText size={12} /> {item.original_name} <Download size={11} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-[var(--muted)]">Aún no hay seguimientos registrados.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1000px] space-y-5">
      <PageHeader eyebrow="Matrices de adherencia" title="Mi plan de trabajo" description="Seguimiento a tus planes de mejora asignados." identity={identity} />

      {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {plans.length ? (
        <div className="grid gap-3">
          {plans.map(plan => {
            const color = STATUS_COLOR[plan.status]
            return (
              <button key={plan.id} className="plan-card" onClick={() => void openPlan(plan.id)}>
                <ComplianceRing percent={plan.progress_percent} size={40} strokeWidth={4} color={color} />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm">{plan.area_name}</strong>
                    <span className="text-xs text-[var(--muted)]">· {plan.month_reported}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">{plan.description}</p>
                </div>
                <PlanStatusBadge status={plan.status} />
              </button>
            )
          })}
        </div>
      ) : (
        <div className="surface-panel">
          <div className="almera-empty"><ClipboardList size={30} /><p>Aún no tienes planes de mejora asignados.</p></div>
        </div>
      )}
    </div>
  )
}
