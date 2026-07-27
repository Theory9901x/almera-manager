import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardList, FileText, Image as ImageIcon, Loader2, Lock,
  Paperclip, RotateCcw, Trash2, Undo2, Upload, UserCheck,
} from 'lucide-react'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, ModuleHero, Select, Textarea,
  ToastProvider, moduleIdentity, useToast,
} from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { checklistsService } from '../services/checklistsService'
import {
  PLAN_STATUS_LABELS, type ActionPlan, type ActionPlanDetail, type ActionPlanStatus, type PlanAssignee,
} from '../types'

const identity = moduleIdentity('checklists')

/** Tono del Badge por estado. SUBSANADO va en warning: es lo que espera revision de calidad. */
const STATUS_TONE: Record<ActionPlanStatus, 'neutral' | 'info' | 'warning' | 'success'> = {
  ABIERTO: 'neutral', EN_PROCESO: 'info', SUBSANADO: 'warning', CERRADO: 'success',
}

const humanSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`

// Una DATE de pg llega como medianoche UTC: pasarla cruda a new Date() la corre un dia en
// Colombia (UTC-5). Se corta a AAAA-MM-DD y se interpreta como fecha local, igual que en la
// pantalla de la ronda. Los timestamps reales (con hora distinta de medianoche) van directos.
const fecha = (value: string | null | undefined) => {
  if (!value) return '—'
  const raw = String(value)
  const soloFecha = raw.length <= 10 || /T00:00:00(\.\d+)?Z?$/.test(raw)
  const date = soloFecha ? new Date(`${raw.slice(0, 10)}T00:00:00`) : new Date(raw)
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ChecklistPlansPage() {
  return <ToastProvider><ChecklistPlansContent /></ToastProvider>
}

function ChecklistPlansContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const { planId } = useParams()
  const canManage = Boolean(session?.permissions.includes('checklists.manage'))
  const canView = Boolean(session?.permissions.includes('checklists.view'))

  const [rows, setRows] = useState<ActionPlan[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const data = await checklistsService.plans(status ? { status } : {})
      setRows(data.rows)
      setCounts(data.counts)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar los planes') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [status])

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const pendientes = (counts.ABIERTO || 0) + (counts.EN_PROCESO || 0)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <ModuleHero
        badge="Seguridad del paciente"
        title="Planes de mejora"
        subtitle={canView
          ? 'Cada criterio marcado NC se convierte en un plan con responsable, evidencia de subsanación y cierre verificado por calidad.'
          : 'Estos son los hallazgos que tienes asignados. Sube la evidencia de lo corregido y márcalos como subsanados; calidad los revisa y los cierra.'}
        accent={identity.color}
        className="checklists-hero"
      >
        <div className="hero-stat-inline">
          <div><div className="num">{total}</div><div className="lbl">Planes</div></div>
          <div><div className="num">{pendientes}</div><div className="lbl">En curso</div></div>
          <div><div className="num">{counts.SUBSANADO || 0}</div><div className="lbl">Por verificar</div></div>
          <div><div className="num">{counts.CERRADO || 0}</div><div className="lbl">Cerrados</div></div>
        </div>
      </ModuleHero>

      {canView && (
        <div className="crumbs">
          <ArrowLeft size={13} />
          <button onClick={() => navigate('/app/listas-chequeo')}>Listas de Chequeo</button>
          <span>›</span><b>Planes de mejora</b>
        </div>
      )}

      {planId ? (
        <PlanDetail
          planId={planId}
          canManage={canManage}
          myMembershipId={session?.membershipId || ''}
          onBack={() => { navigate('/app/listas-chequeo/planes'); void load() }}
        />
      ) : (
        <div className="surface-panel is-header" style={{ ['--ds-accent' as string]: identity.color }}>
          <div className="program-tabs" style={{ marginTop: 0 }}>
            <button className={`program-tab ${status === '' ? 'is-active' : ''}`} onClick={() => setStatus('')}>
              Todos <span>{total}</span>
            </button>
            {(Object.keys(PLAN_STATUS_LABELS) as ActionPlanStatus[]).map(key => (
              <button key={key} className={`program-tab ${status === key ? 'is-active' : ''}`} onClick={() => setStatus(key)}>
                {key === 'SUBSANADO' ? 'Por verificar' : PLAN_STATUS_LABELS[key]} <span>{counts[key] || 0}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>
          ) : rows.length ? (
            <div className="plan-list mt-4">
              {rows.map(plan => (
                <button key={plan.id} className="plan-row" onClick={() => navigate(`/app/listas-chequeo/planes/${plan.id}`)}>
                  <span className="plan-row-icon"><ClipboardList size={17} /></span>
                  <span className="plan-row-body">
                    <strong>
                      {plan.item_number ? `Ítem ${plan.item_number} · ` : ''}{plan.criterion_text}
                    </strong>
                    <small>
                      {plan.template_code ? `${plan.template_code} · ` : ''}{plan.template_name}
                      {' · '}{plan.area_center ? `${plan.area_center} — ` : ''}{plan.area_name}
                      {' · '}{fecha(plan.audit_date)}
                    </small>
                    <small>
                      {plan.subject_name ? <>Evaluado: <b>{plan.subject_name}</b> · </> : null}
                      Responsable: <b>{plan.assigned_name || 'sin asignar'}</b>
                      {plan.evidence_count ? ` · ${plan.evidence_count} evidencia${plan.evidence_count === 1 ? '' : 's'}` : ''}
                    </small>
                  </span>
                  <Badge tone={STATUS_TONE[plan.status]}>
                    {plan.status === 'SUBSANADO' ? 'Por verificar' : PLAN_STATUS_LABELS[plan.status]}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                icon={ClipboardList}
                title={status ? 'No hay planes en este estado' : canView ? 'Aún no hay planes de mejora' : 'No tienes planes asignados'}
                description={canView
                  ? 'Los planes se crean desde la ronda: al marcar un criterio como NC aparece la opción «Plan de mejora».'
                  : 'Cuando un auditor te asigne un hallazgo para subsanar, aparecerá aquí.'}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detalle: hallazgo, evidencias de subsanacion, bitacora y acciones segun quien mira.
// El servidor es quien decide de verdad (aislamiento + "quien subsana no cierra"); aqui
// solo se muestran los botones que tienen sentido para no invitar a errores.

function PlanDetail({ planId, canManage, myMembershipId, onBack }: {
  planId: string
  canManage: boolean
  myMembershipId: string
  onBack(): void
}) {
  const toast = useToast()
  const [plan, setPlan] = useState<ActionPlanDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [returnNote, setReturnNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [assignees, setAssignees] = useState<PlanAssignee[]>([])
  const [reassigning, setReassigning] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  async function load() {
    try { setPlan(await checklistsService.plan(planId)) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el plan') }
  }

  useEffect(() => {
    void load()
    if (canManage) void checklistsService.planAssignees().then(setAssignees).catch(() => {})
  }, [planId])

  if (!plan) return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>

  const isAssignee = Boolean(plan.assigned_membership_id) && String(plan.assigned_membership_id) === String(myMembershipId)
  const open = plan.status === 'ABIERTO' || plan.status === 'EN_PROCESO'
  const canWork = (isAssignee || canManage) && plan.status !== 'CERRADO'

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try { await action(); toast.push('success', success); await load() }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible completar la operación') }
    finally { setBusy(false) }
  }

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.push('error', `"${file.name}" pesa ${humanSize(file.size)}. El máximo son 10 MB.`); return }
    await act(() => checklistsService.addPlanEvidence(plan!.id, file), 'Evidencia subida')
  }

  return (
    <div className="space-y-5">
      <div className="crumbs">
        <ArrowLeft size={13} />
        <button onClick={onBack}>Planes de mejora</button>
        <span>›</span><b>{plan.item_number ? `Ítem ${plan.item_number}` : 'Hallazgo'}</b>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="¿Eliminar este plan de mejora?"
        confirmLabel="Sí, eliminar"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void act(async () => { await checklistsService.removePlan(plan.id); onBack() }, 'Plan eliminado')}
        description={<p>Se borran sus evidencias. Queda constancia en la bitácora de quién lo eliminó.</p>}
      />

      <Card accent={identity.color} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ds-eyebrow">{plan.domain_name || 'Hallazgo'}</p>
            <h2 className="mt-1 text-xl font-black" style={{ lineHeight: 1.3 }}>
              {plan.item_number ? `Ítem ${plan.item_number} · ` : ''}{plan.criterion_text}
            </h2>
            <p className="survey-config-hint" style={{ marginTop: 8 }}>
              {plan.template_code ? `${plan.template_code} · ` : ''}{plan.template_name}
              {' · '}{plan.area_center ? `${plan.area_center} — ` : ''}{plan.area_name || 'Sin servicio'}
              {' · ronda del '}{fecha(plan.audit_date)} por {plan.auditor_name}
            </p>
          </div>
          <Badge tone={STATUS_TONE[plan.status]}>
            {plan.status === 'SUBSANADO' ? 'Por verificar' : PLAN_STATUS_LABELS[plan.status]}
          </Badge>
        </div>

        <div className="plan-facts mt-4">
          {plan.subject_name && (
            <div><dt>Evaluado en la ronda</dt><dd>{plan.subject_name}</dd></div>
          )}
          <div>
            <dt>Responsable de subsanar</dt>
            <dd>
              {plan.assigned_name || 'Sin asignar'}
              {plan.assigned_user_name && plan.assigned_user_name !== plan.assigned_name ? ` (${plan.assigned_user_name})` : ''}
            </dd>
          </div>
          <div><dt>Creado</dt><dd>{fecha(plan.created_at)} por {plan.created_by_name}</dd></div>
          {plan.resolved_at && <div><dt>Subsanado</dt><dd>{fecha(plan.resolved_at)} por {plan.resolved_by_name}</dd></div>}
          {plan.closed_at && <div><dt>Cerrado</dt><dd>{fecha(plan.closed_at)} por {plan.closed_by_name}</dd></div>}
        </div>

        {plan.finding && (
          <div className="plan-finding mt-4">
            <dt>Hallazgo / acción de mejora</dt>
            <dd>{plan.finding}</dd>
          </div>
        )}
        {plan.resolution_note && (
          <div className="plan-finding mt-3">
            <dt>Nota de subsanación</dt>
            <dd>{plan.resolution_note}</dd>
          </div>
        )}
        {plan.closing_note && (
          <div className="plan-finding mt-3">
            <dt>Nota de cierre</dt>
            <dd>{plan.closing_note}</dd>
          </div>
        )}

        {canManage && plan.status !== 'CERRADO' && (
          <div className="mt-4">
            {reassigning ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[260px]">
                  <Field label="Nuevo responsable">
                    <Select
                      value={plan.assigned_membership_id || 'NONE'}
                      onChange={value => void act(
                        () => checklistsService.updatePlan(plan.id, { assignedMembershipId: value === 'NONE' ? null : value }),
                        'Responsable actualizado',
                      ).then(() => setReassigning(false))}
                      options={[{ value: 'NONE', label: 'Sin asignar' },
                        ...assignees.map(item => ({ value: item.id, label: item.full_name }))]}
                    />
                  </Field>
                </div>
                <button className="survey-config-add" onClick={() => setReassigning(false)}>Cancelar</button>
              </div>
            ) : (
              <button className="row-action" style={{ color: identity.color }} onClick={() => setReassigning(true)}>
                <UserCheck size={13} /> Reasignar responsable
              </button>
            )}
          </div>
        )}
      </Card>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Subsanación</p>
        <h2 className="mt-1 text-xl font-black">Evidencias</h2>

        {canWork && open && (
          <>
            <div className="eval-drop" style={{ marginTop: 14 }}>
              <Upload size={26} />
              <p><strong>Sube la evidencia de lo corregido</strong><br />fotos o documentos</p>
              <div className="eval-drop-actions">
                <Button variant="secondary" onClick={() => cameraInput.current?.click()} disabled={busy}>
                  <Camera size={15} /> Tomar foto
                </Button>
                <Button identity={identity} onClick={() => fileInput.current?.click()} disabled={busy}>
                  <Paperclip size={15} /> {busy ? 'Subiendo…' : 'Subir archivo'}
                </Button>
              </div>
              <small>JPG, PNG, WEBP, HEIC o PDF · máximo 10 MB por archivo</small>
            </div>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
              onChange={event => { void upload(event.target.files); event.target.value = '' }} />
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf" hidden
              onChange={event => { void upload(event.target.files); event.target.value = '' }} />
          </>
        )}

        {plan.evidences.length ? (
          <ul className="eval-evidences">
            {plan.evidences.map(evidence => {
              const isImage = evidence.mime_type.startsWith('image/')
              return (
                <li key={evidence.id}>
                  <a href={checklistsService.planEvidenceUrl(plan.id, evidence.id)} target="_blank" rel="noreferrer" className="eval-evidence-link">
                    <span className="eval-evidence-icon">{isImage ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
                    <span className="min-w-0">
                      <strong>{evidence.original_name}</strong>
                      <small>{humanSize(evidence.size_bytes)}{evidence.uploaded_by_name ? ` · ${evidence.uploaded_by_name}` : ''} · {fecha(evidence.created_at)}</small>
                    </span>
                  </a>
                  {canWork && plan.status !== 'SUBSANADO' && (
                    <button className="row-action is-danger" title="Quitar"
                      onClick={() => void act(() => checklistsService.removePlanEvidence(plan.id, evidence.id), 'Evidencia quitada')}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="survey-config-hint mt-3">
            {open
              ? 'Aún no hay evidencias. Se necesita al menos una para marcar el plan como subsanado.'
              : 'Este plan no tiene evidencias adjuntas.'}
          </p>
        )}

        {canWork && open && (
          <div className="mt-4 space-y-2">
            <Field label="Nota de subsanación" hint="Opcional: qué se corrigió y cómo">
              <Textarea rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} />
            </Field>
            <Button
              identity={identity}
              disabled={busy || !plan.evidences.length}
              onClick={() => void act(() => checklistsService.resolvePlan(plan.id, note), 'Plan marcado como subsanado. Calidad lo revisará para cerrarlo.')}
            >
              <CheckCircle2 size={15} /> Marcar como subsanado
            </Button>
            {!plan.evidences.length && (
              <p className="survey-config-hint">Sube al menos una evidencia para poder marcarlo como subsanado.</p>
            )}
          </div>
        )}

        {canManage && plan.status === 'SUBSANADO' && (
          <div className="mt-4 space-y-2">
            <Field label="Nota de verificación" hint="Obligatoria si se devuelve; opcional al cerrar">
              <Textarea rows={3} maxLength={2000} value={returnNote} onChange={event => setReturnNote(event.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                identity={identity}
                disabled={busy}
                onClick={() => void act(() => checklistsService.closePlan(plan.id, returnNote), 'Plan cerrado')}
              >
                <Lock size={15} /> Verificar y cerrar
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  if (!returnNote.trim()) { toast.push('error', 'Escribe por qué se devuelve: el responsable tiene que saber qué corregir'); return }
                  void act(() => checklistsService.returnPlan(plan.id, returnNote), 'Plan devuelto al responsable')
                }}
              >
                <Undo2 size={15} /> Devolver
              </Button>
            </div>
            <p className="survey-config-hint">
              Quien subsanó no puede cerrar el plan: si tú mismo subiste la evidencia, otra persona de calidad debe verificarlo.
            </p>
          </div>
        )}

        {plan.status === 'SUBSANADO' && !canManage && (
          <p className="survey-config-hint mt-3">
            <RotateCcw size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Pendiente de verificación por calidad.
          </p>
        )}
      </Card>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Trazabilidad</p>
        <h2 className="mt-1 text-xl font-black">Bitácora del plan</h2>
        <ul className="plan-log mt-3">
          {plan.log.map(entry => (
            <li key={entry.id}>
              <span className="plan-log-dot" />
              <div>
                <strong>{entry.action.charAt(0) + entry.action.slice(1).toLowerCase().replace('_', ' ')}</strong>
                {entry.detail ? <span> — {entry.detail}</span> : null}
                <small>{entry.actor_name} · {new Date(entry.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
              </div>
            </li>
          ))}
        </ul>
        {canManage && (
          <div className="mt-4">
            <button className="row-action is-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Eliminar plan
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
