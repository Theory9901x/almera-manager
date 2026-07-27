import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronUp,
  CircleDashed, ClipboardCheck, ClipboardList, Clock, CreditCard, MessageSquare, Paperclip, Settings2,
  User, UserCheck,
  Download, Info, Loader2, Lock, PenLine, Plus, Save, Trash2, Unlock, UserPlus,
} from 'lucide-react'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, ModuleHero, ProgressRing, SaveStatusIndicator,
  Select, ToastProvider, moduleIdentity, semaphoreColor, useToast,
} from '@/design-system'
import { checklistsService } from '../services/checklistsService'
import { SignaturePad } from '../components/SignaturePad'
import { EvidencesCard } from '../components/EvidencesCard'
import { PlanCreateDialog, type PlanDraft } from '../components/PlanCreateDialog'
import {
  CHECKLIST_VALUE_LABELS, PLAN_STATUS_LABELS, type AuditDetail, type ChecklistField, type ChecklistValue,
  type DirectorySubject, type PlanAssignee, type SignerSuggestion,
} from '../types'

const identity = moduleIdentity('checklists')

/** Campos de cabecera que la banda superior ya muestra: repetirlos abajo era pedir dos veces
 *  el mismo dato. La fecha, el servicio y el auditor se fijan al abrir la ronda. */
const YA_EN_LA_BANDA = /^(fecha|servicio|área|area|centro de atenci|evaluador|responsable|auditor|turno)/i

/** Etiqueta del anillo. Usa los mismos cortes que el semaforo del sistema, no unos propios. */
const CONCEPT_TEXT: Record<string, string> = {
  OPTIMO: 'Excelente', ACEPTABLE: 'Bueno', DEFICIENTE: 'Regular', MUY_DEFICIENTE: 'Crítico',
}
function conceptOf(percent: number) {
  if (percent >= 90) return 'OPTIMO'
  if (percent >= 80) return 'ACEPTABLE'
  if (percent >= 70) return 'DEFICIENTE'
  return 'MUY_DEFICIENTE'
}
const VALUES: ChecklistValue[] = ['C', 'NC', 'NA']

function answerKey(subjectRowId: string, criterionId: string) { return `${subjectRowId}|${criterionId}` }

export default function ChecklistAuditPage() {
  return <ToastProvider><ChecklistAuditContent /></ToastProvider>
}

function ChecklistAuditContent() {
  const { auditId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [audit, setAudit] = useState<AuditDetail | null>(null)
  const [directory, setDirectory] = useState<DirectorySubject[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)

  // Marcas locales: solo se envian al pulsar "Guardar". El pendiente se refleja al vuelo para que
  // el auditor vea el avance sin ir y volver al servidor en cada toque.
  const [marks, setMarks] = useState<Record<string, ChecklistValue>>({})
  const [header, setHeader] = useState<Record<string, string>>({})
  const [showSubjectForm, setShowSubjectForm] = useState(false)
  const [signers, setSigners] = useState<SignerSuggestion[]>([])
  const [exporting, setExporting] = useState(false)
  const headerDirty = useRef(false)
  // Dominios plegados. Se guarda lo CERRADO, no lo abierto: una lista recien abierta debe
  // mostrarse entera, y con el set invertido habria que rellenarlo al cargar.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [notes, setNotes] = useState('')
  const [notesByAnswer, setNotesByAnswer] = useState<Record<string, string>>({})
  const [staffDraft, setStaffDraft] = useState({ name: '', role: '' })
  // Hallazgo NC para el que se esta creando un plan de mejora. Null = dialogo cerrado.
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null)
  const [assignees, setAssignees] = useState<PlanAssignee[]>([])
  // Celda recien marcada NC a la que se le pregunta "¿Requiere plan de mejora?". Si la
  // respuesta es no, no pasa nada mas; si es si, se abre la creacion del plan.
  const [askPlan, setAskPlan] = useState<{ subjectRowId: string; criterionId: string } | null>(null)

  function hydrate(detail: AuditDetail) {
    setAudit(detail)
    const next: Record<string, ChecklistValue> = {}
    for (const answer of detail.answers) next[answerKey(answer.audit_subject_id, answer.criterion_id)] = answer.value
    setMarks(next)
    setHeader(detail.header_values || {})
    setNotes(detail.notes || '')
    const observations: Record<string, string> = {}
    for (const answer of detail.answers) {
      if (answer.observation) observations[answerKey(answer.audit_subject_id, answer.criterion_id)] = answer.observation
    }
    setNotesByAnswer(observations)
    setDirty(false)
    headerDirty.current = false
  }

  async function load() {
    if (!auditId) return
    try {
      const detail = await checklistsService.audit(auditId)
      hydrate(detail)
      const [subjectDirectory, signerDirectory] = await Promise.all([
        checklistsService.directory(detail.template_id).catch(() => []),
        checklistsService.signers().catch(() => []),
      ])
      setDirectory(subjectDirectory)
      setSigners(signerDirectory)
      // Posibles responsables de un plan de mejora. Si falla (p. ej. sin permiso), el dialogo
      // simplemente ofrece "sin asignar".
      void checklistsService.planAssignees().then(setAssignees).catch(() => {})
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar la auditoría') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [auditId])

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  useEffect(() => {
    if (saveState !== 'saved') return
    const timeout = window.setTimeout(() => setSaveState('idle'), 2500)
    return () => window.clearTimeout(timeout)
  }, [saveState])

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const criteria = useMemo(() => audit ? audit.domains.flatMap(domain => domain.criteria) : [], [audit])
  const closed = audit?.status === 'CERRADA'

  // Planes de mejora ya creados en esta ronda, por celda (sujeto x criterio). Va aqui arriba
  // porque toggle() lo consulta para no volver a preguntar sobre un hallazgo que ya tiene plan.
  const plansByKey = useMemo(() => new Map(
    (audit?.plans || [])
      .filter(plan => plan.audit_subject_id && plan.criterion_id)
      .map(plan => [answerKey(String(plan.audit_subject_id), String(plan.criterion_id)), plan]),
  ), [audit])

  // Avance en vivo, con la misma regla del servidor: NA cuenta como respondido.
  const localPending = useMemo(() => {
    if (!audit) return 0
    return Math.max(0, audit.subjects.length * criteria.length - Object.keys(marks).length)
  }, [audit, criteria.length, marks])

  function toggle(subjectRowId: string, criterionId: string, value: ChecklistValue) {
    if (closed) return
    const key = answerKey(subjectRowId, criterionId)
    const wasMarked = marks[key] === value
    setMarks(current => {
      const next = { ...current }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
    setDirty(true)
    setSaveState('idle')
    // Al MARCAR un NC (no al deshacerlo) se pregunta si el hallazgo requiere plan de mejora.
    // Solo si la celda no tiene ya uno: repetir la pregunta sobre un hallazgo con plan es ruido.
    if (value === 'NC' && !wasMarked && !plansByKey.has(key)) {
      setAskPlan({ subjectRowId, criterionId })
    }
  }

  async function addStaff() {
    if (!audit || !staffDraft.name.trim()) return
    setBusy(true)
    try {
      await checklistsService.addStaff(audit.id, staffDraft.name.trim(), staffDraft.role.trim())
      setStaffDraft({ name: '', role: '' })
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible agregar') }
    finally { setBusy(false) }
  }

  async function removeStaff(staffId: string) {
    if (!audit) return
    try { await checklistsService.removeStaff(audit.id, staffId); await load() }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible quitar') }
  }

  async function addEvidence(file: File) {
    if (!audit) return
    await checklistsService.addEvidence(audit.id, file)
    await load()
    toast.push('success', 'Evidencia adjuntada')
  }

  async function removeEvidence(evidenceId: string) {
    if (!audit) return
    try {
      await checklistsService.removeEvidence(audit.id, evidenceId)
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible quitar la evidencia') }
  }

  async function saveAll() {
    if (!audit || !dirty) return
    setSaveState('saving')
    try {
      if (headerDirty.current) await checklistsService.updateAudit(audit.id, { headerValues: header })
      // Las observaciones van con el mismo boton "Guardar": para el auditor es una sola accion,
      // no dos cosas que se guardan por separado.
      if ((audit.notes || '') !== notes) await checklistsService.saveNotes(audit.id, notes)
      // Se manda tambien lo desmarcado (value null) para que el servidor borre esas filas: sin
      // esto, deshacer una marca no se persistiria nunca.
      const payload: { auditSubjectId: string; criterionId: string; value: ChecklistValue | null; observation: string }[] = []
      for (const subject of audit.subjects) {
        for (const criterion of criteria) {
          const key = answerKey(subject.id, criterion.id)
          const previous = audit.answers.find(answer => answerKey(answer.audit_subject_id, answer.criterion_id) === key)
          const now = marks[key] ?? null
          const observation = notesByAnswer[key] ?? ''
          const cambio = (previous?.value ?? null) !== now || (previous?.observation ?? '') !== observation
          if (cambio) payload.push({ auditSubjectId: subject.id, criterionId: criterion.id, value: now, observation })
        }
      }
      const detail = payload.length
        ? await checklistsService.saveAnswers(audit.id, payload)
        : await checklistsService.audit(audit.id)
      hydrate(detail)
      setSaveState('saved')
      toast.push('success', 'Auditoría guardada')
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar. Tus marcas siguen aquí.')
      setSaveState('error')
    }
  }

  async function closeAudit() {
    if (!audit) return
    if (dirty) await saveAll()
    setBusy(true)
    try {
      hydrate(await checklistsService.closeAudit(audit.id))
      toast.push('success', 'Auditoría cerrada')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cerrar') }
    finally { setBusy(false) }
  }

  async function reopenAudit() {
    if (!audit) return
    setBusy(true)
    try {
      const detail = await checklistsService.reopenAudit(audit.id)
      hydrate(detail)
      // Reabrir invalida las firmas (ver el endpoint): avisarlo, porque el auditor tendra que
      // volver a recogerlas antes de cerrar de nuevo.
      toast.push('success', detail.invalidatedSignatures
        ? `Auditoría reabierta. Se invalidaron ${detail.invalidatedSignatures} firma${detail.invalidatedSignatures === 1 ? '' : 's'}: habrá que volver a firmar.`
        : 'Auditoría reabierta')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible reabrir') }
    finally { setBusy(false) }
  }

  async function exportPdf() {
    if (!audit) return
    setExporting(true)
    try { await checklistsService.downloadAuditReport(audit.id) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el informe') }
    finally { setExporting(false) }
  }

  async function addSignature(signerName: string, signerRole: string, signatureImage: string) {
    if (!audit) return
    setBusy(true)
    try {
      await checklistsService.addSignature(audit.id, { signerName, signerRole, signatureImage })
      await load()
      toast.push('success', 'Firma registrada')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible registrar la firma') }
    finally { setBusy(false) }
  }

  async function removeSignature(signatureId: string) {
    if (!audit) return
    setBusy(true)
    try {
      await checklistsService.removeSignature(audit.id, signatureId)
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible quitar la firma') }
    finally { setBusy(false) }
  }

  async function addSubject(displayName: string, attributes: Record<string, string>, subjectId: string | null) {
    if (!audit) return
    if (dirty) await saveAll()
    setBusy(true)
    try {
      await checklistsService.addSubject(audit.id, { displayName, attributes, subjectId })
      setShowSubjectForm(false)
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible agregar') }
    finally { setBusy(false) }
  }

  // Abrir el dialogo de plan de mejora sobre un NC. Si hay marcas sin guardar se guardan antes:
  // el servidor exige que el NC exista como respuesta, no como marca local.
  async function openPlanDialog(subjectRowId: string, criterionId: string) {
    if (!audit) return
    if (dirty) await saveAll()
    const subject = audit.subjects.find(item => String(item.id) === String(subjectRowId))
    const criterion = criteria.find(item => String(item.id) === String(criterionId))
    if (!subject || !criterion) return
    setPlanDraft({
      criterionId: String(criterion.id),
      auditSubjectId: String(subject.id),
      criterionText: criterion.text,
      subjectName: subject.display_name,
      observation: notesByAnswer[answerKey(subjectRowId, criterionId)] || '',
      linkedMembershipId: subject.linked_membership_id ? String(subject.linked_membership_id) : null,
    })
  }

  async function createPlan(data: { title: string; dueDate: string | null; finding: string; assignedMembershipId: string | null; rememberAssignee: boolean }) {
    if (!audit || !planDraft) return
    setBusy(true)
    try {
      const created = await checklistsService.createPlan(audit.id, {
        criterionId: planDraft.criterionId,
        auditSubjectId: planDraft.auditSubjectId,
        title: data.title,
        dueDate: data.dueDate,
        finding: data.finding,
        assignedMembershipId: data.assignedMembershipId,
        rememberAssignee: data.rememberAssignee,
      })
      setPlanDraft(null)
      await load()
      // El codigo unico se dice aqui mismo: es con el que se busca despues en el modulo.
      toast.push('success', `Plan de mejora PM-${created.id} creado${data.assignedMembershipId ? '. Se notificó al responsable.' : ''}`)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible crear el plan') }
    finally { setBusy(false) }
  }

  async function removeSubject(subjectRowId: string) {
    if (!audit) return
    setBusy(true)
    try {
      await checklistsService.removeSubject(audit.id, subjectRowId)
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible quitar') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!audit) return null

  const percent = closed ? audit.adherence_percent : audit.adherence.overall.percent

  // Avance y adherencia por dominio EN VIVO, contados sobre las marcas que hay en pantalla. El
  // numero que manda sigue siendo el del servidor (se recalcula al guardar); esto solo evita que
  // el auditor tenga que guardar para saber como va, que en una ronda de 40 criterios importa.
  const totalCells = criteria.length * audit.subjects.length
  const markedCells = Object.keys(marks).length
  const progress = totalCells ? Math.round((markedCells / totalCells) * 100) : 0
  const domainTally = (domain: typeof audit.domains[number]) => {
    let c = 0, nc = 0, na = 0, marked = 0
    for (const criterion of domain.criteria) {
      for (const subject of audit.subjects) {
        const value = marks[answerKey(subject.id, criterion.id)]
        if (value === 'C') { c++; marked++ }
        else if (value === 'NC') { nc++; marked++ }
        else if (value === 'NA') { na++; marked++ }
      }
    }
    const cells = domain.criteria.length * audit.subjects.length
    return { c, nc, na, marked, cells, percent: c + nc > 0 ? (c / (c + nc)) * 100 : null }
  }
  const livePercent = (domain: typeof audit.domains[number]) => domainTally(domain).percent

  // Hallazgos: los NC marcados en pantalla. Son los que exigen accion, y el auditor tiene que
  // verlos crecer mientras marca, no al final.
  const findings = Object.values(marks).filter(value => value === 'NC').length
  const liveOverall = (() => {
    let c = 0, nc = 0
    for (const value of Object.values(marks)) { if (value === 'C') c++; else if (value === 'NC') nc++ }
    return c + nc > 0 ? (c / (c + nc)) * 100 : null
  })()
  const shownPercent = closed ? (percent === null ? null : Number(percent)) : liveOverall
  const clock = `${String(Math.floor(elapsed / 3600)).padStart(2, '0')}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  function toggleDomain(id: string) {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <div className="crumbs">
        <ArrowLeft size={13} />
        <button onClick={() => navigate('/app/listas-chequeo')}>Listas de Chequeo</button>
        <span>›</span><b>{audit.template_code || audit.code || ''} {audit.template_name}</b>
      </div>

      {/* La pregunta del flujo acordado: NC recien marcado -> "¿Requiere plan de mejora?".
          Si = se abre la creacion; No = no pasa nada mas, la marca queda tal cual. */}
      <ConfirmDialog
        open={askPlan !== null}
        title="¿Requiere plan de mejora?"
        confirmLabel="Sí, crear plan"
        cancelLabel="No"
        onCancel={() => setAskPlan(null)}
        onConfirm={() => {
          const target = askPlan
          setAskPlan(null)
          if (target) void openPlanDialog(target.subjectRowId, target.criterionId)
        }}
        description={<p>El hallazgo quedó marcado como <strong>NC</strong>. Si requiere plan, se crea con nombre, fecha y responsable, y este será notificado para subir su evidencia.</p>}
      />

      <PlanCreateDialog
        draft={planDraft}
        assignees={assignees}
        busy={busy}
        onCancel={() => setPlanDraft(null)}
        onCreate={data => void createPlan(data)}
      />

      <div className="topbar">
        <div className="title-wrap">
          <div className="title-ic"><ClipboardCheck size={22} /></div>
          <div>
            {/* El codigo va DELANTE del nombre: es como se identifica el formato en el papel y
                en la acreditacion, y en el subtitulo se perdia. */}
            {audit.template_code || audit.code ? (
              <span className="code-pill is-lg">{audit.template_code || audit.code} · v{audit.template_version || audit.version}</span>
            ) : null}
            <h1>{audit.template_name}</h1>
            <div className="subtitle">
              {audit.area_name || 'Sin servicio'}
              {audit.shift ? ` · turno ${audit.shift.toLowerCase()}` : ''}
            </div>
          </div>
        </div>
        <div className="actions">
          {!closed && (
            <button className="btn col" onClick={() => void saveAll()} disabled={!dirty || saveState === 'saving'}>
              <span><Save size={15} /> Guardar borrador</span>
              <span className="sub">
                {saveState === 'saving' ? 'Guardando…' : dirty ? 'Hay cambios sin guardar' : 'Todo guardado'}
              </span>
            </button>
          )}
          {!closed
            ? <button className="btn pri" onClick={() => void closeAudit()} disabled={busy}><Lock size={15} /> Finalizar evaluación</button>
            : <button className="btn pri" onClick={() => void reopenAudit()} disabled={busy}><Unlock size={15} /> Reabrir evaluación</button>}
          <button className="btn" onClick={() => void exportPdf()} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      <div className="eval-context">
        <div className="eval-context-grid">
        <div className="eval-context-cell">
          <span className="eval-context-icon"><CalendarDays size={16} /></span>
          <div>
            <dt>Fecha</dt>
            <dd>{new Date(`${String(audit.audit_date).slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              {audit.shift ? <small>Turno {audit.shift.toLowerCase()}</small> : null}
            </dd>
          </div>
        </div>
        <div className="eval-context-cell">
          <span className="eval-context-icon"><Building2 size={16} /></span>
          <div><dt>Servicio o área</dt><dd>{audit.area_name || 'Sin servicio'}</dd></div>
        </div>
        {/* Los atributos del primer sujeto: cambian por lista (cama y documento en una de
            pacientes, cargo y servicio en una de colaboradores). */}
        {audit.subjects[0] && (
          <div className="eval-context-cell">
            <span className="eval-context-icon"><User size={16} /></span>
            <div>
              <dt>{audit.subject_label}</dt>
              <dd>
                {audit.subjects[0].display_name}
                {audit.subjects.length > 1 ? <small>y {audit.subjects.length - 1} más</small> : null}
              </dd>
            </div>
          </div>
        )}
        {audit.subjectFields
          .filter(field => (audit.subjects[0]?.attributes_snapshot || {})[field.id])
          .slice(0, 2)
          .map(field => (
            <div className="eval-context-cell" key={field.id}>
              <span className="eval-context-icon"><CreditCard size={16} /></span>
              <div><dt>{field.label}</dt><dd>{audit.subjects[0].attributes_snapshot[field.id]}</dd></div>
            </div>
          ))}
        <div className="eval-context-cell">
          <span className="eval-context-icon"><UserCheck size={16} /></span>
          <div><dt>Responsable</dt><dd>{audit.auditor_name}</dd></div>
        </div>

        </div>

        <div className="eval-strip">
          <div>
            <span className="eval-strip-label">Escala de calificación</span>
            <div className="eval-risk">
              <span className="eval-risk-chip is-c">C</span>
              <span className="eval-risk-chip is-nc">NC</span>
              <span className="eval-risk-chip is-na">NA</span>
            </div>
          </div>
          <div>
            <span className="eval-strip-label">Avance de la evaluación</span>
            <div className="checklist-progress">
              <div className="checklist-progress-bar"><i style={{ width: `${progress}%` }} /></div>
              <span className="checklist-progress-label"><strong>{progress}%</strong></span>
            </div>
          </div>
          <div>
            <span className="eval-strip-label">Tiempo transcurrido</span>
            <span className="eval-clock"><Clock size={14} /> {clock}</span>
          </div>
        </div>

        {/* Campos propios de la lista y sujetos de la ronda: van en la MISMA banda. Antes eran
            dos tarjetas grandes para tres datos, y en una sola hoja eso es ruido. */}
        {audit.headerFields.filter(f => !YA_EN_LA_BANDA.test(f.label)).length > 0 && (
          <div className="eval-fields">
            {audit.headerFields.filter(f => !YA_EN_LA_BANDA.test(f.label)).map(field => (
              <label key={field.id} className="eval-field">
                <span>{field.label}{field.required ? ' *' : ''}</span>
                {field.field_type === 'SELECT' ? (
                  <select
                    value={header[field.id] || ''} disabled={closed}
                    onChange={event => { setHeader(c => ({ ...c, [field.id]: event.target.value })); headerDirty.current = true; setDirty(true) }}
                  >
                    <option value="">—</option>
                    {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.field_type === 'DATE' ? 'date' : field.field_type === 'NUMBER' ? 'number' : 'text'}
                    value={header[field.id] || ''} disabled={closed}
                    onChange={event => { setHeader(c => ({ ...c, [field.id]: event.target.value })); headerDirty.current = true; setDirty(true) }}
                  />
                )}
              </label>
            ))}
          </div>
        )}

        <div className="eval-subjects">
          <span className="eval-strip-label">Personal de turno</span>
          {(audit.staff || []).map(person => (
            <span className="eval-subject" key={person.id}>
              <b><UserCheck size={12} /></b>
              <span>
                {person.full_name}
                <small>{person.role || 'Sin cargo'}</small>
              </span>
              {!closed && <button title="Quitar" onClick={() => void removeStaff(person.id)}><Trash2 size={13} /></button>}
            </span>
          ))}
          {!closed && (
            <span className="eval-staff-add">
              <input
                placeholder="Nombre del profesional"
                value={staffDraft.name}
                onChange={event => setStaffDraft({ ...staffDraft, name: event.target.value })}
                onKeyDown={event => { if (event.key === 'Enter') void addStaff() }}
              />
              <input
                placeholder="Cargo (opcional)"
                value={staffDraft.role}
                onChange={event => setStaffDraft({ ...staffDraft, role: event.target.value })}
                onKeyDown={event => { if (event.key === 'Enter') void addStaff() }}
              />
              <button onClick={() => void addStaff()} disabled={busy || !staffDraft.name.trim()}>
                <UserPlus size={14} /> Agregar
              </button>
            </span>
          )}
        </div>

        <div className="eval-subjects">
          <span className="eval-strip-label">{audit.subject_label}s de esta ronda</span>
          {audit.subjects.map((subject, index) => (
            <span className="eval-subject" key={subject.id}>
              <b>{index + 1}</b>
              <span>
                {subject.display_name}
                <small>{
                  audit.subjectFields
                    .map(field => (subject.attributes_snapshot || {})[field.id])
                    .filter(Boolean).join(' · ') || '—'
                }</small>
              </span>
              {!closed && (
                <button title="Quitar" onClick={() => void removeSubject(subject.id)}><Trash2 size={13} /></button>
              )}
            </span>
          ))}
          {!closed && (
            <button className="eval-subject-add" onClick={() => setShowSubjectForm(true)}>
              <UserPlus size={14} /> Agregar {audit.subject_label.toLowerCase()}
            </button>
          )}
        </div>

        {showSubjectForm && !closed && (
          <SubjectForm
            subjectLabel={audit.subject_label}
            fields={audit.subjectFields}
            directory={directory}
            busy={busy}
            onCancel={() => setShowSubjectForm(false)}
            onSubmit={addSubject}
          />
        )}
      </div>

      {audit.subjects.length > 0 && criteria.length > 0 && (
        <div className="eval-shell">
          {/* Cuerpo: un acordeon por dominio. Dentro de cada uno se conserva la MATRIZ
              criterio x sujeto — con un solo sujeto se ve como una lista de criterios, que es el
              caso comun, y con varios sigue sirviendo. Pasar a una fila por criterio habria roto
              las rondas de varios pacientes, que es la mitad de los formatos. */}
          <div className="eval-body">
            <div className="eval-toolbar">
              <p className="survey-config-hint" style={{ margin: 0 }}>
                Marca <strong>C</strong> (cumple), <strong>NC</strong> (no cumple) o <strong>NA</strong> (no aplica).
                NA no penaliza: se excluye del cálculo. Toca de nuevo para deshacer.
              </p>
              <button
                className="row-action"
                onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(audit.domains.map(d => String(d.id))))}
              >
                {collapsed.size ? <><ChevronDown size={14} /> Expandir todo</> : <><ChevronUp size={14} /> Colapsar todo</>}
              </button>
            </div>

            {audit.domains.map((domain, domainIndex) => {
              const tally = domainTally(domain)
              const isCollapsed = collapsed.has(String(domain.id))
              const complete = tally.marked === tally.cells && tally.cells > 0
              return (
                <section key={domain.id} id={`dom-${domain.id}`} className={`eval-domain ${isCollapsed ? 'is-collapsed' : ''}`}>
                  <button className="eval-domain-head" onClick={() => toggleDomain(String(domain.id))} aria-expanded={!isCollapsed}>
                    <span className="eval-domain-num" style={{ background: identity.color }}>{domainIndex + 1}</span>
                    <span className="eval-domain-name">{domain.name}</span>
                    <span className={`eval-domain-state ${complete ? 'is-done' : ''}`} title={complete ? 'Dominio completo' : 'Faltan marcas'}>
                      {complete ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
                      {tally.marked}/{tally.cells}
                    </span>
                    <span className="eval-domain-pct" style={{ color: tally.percent === null ? 'var(--muted)' : semaphoreColor(tally.percent) }}>
                      {tally.percent === null ? 'Sin marcar' : `${tally.percent.toFixed(0)} %`}
                    </span>
                    {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                  </button>

                  {!isCollapsed && (
                    audit.subjects.length === 1 ? (
                      <div className="dbody">
                        {domain.criteria.map((criterion, criterionIndex) => {
                          const subject = audit.subjects[0]
                          const key = answerKey(subject.id, criterion.id)
                          const current = marks[key]
                          return (
                            <div className="crit" key={criterion.id}>
                              <div className="cnum">
                                {audit.numbered_items && criterion.item_number
                                  ? criterion.item_number
                                  : `${domainIndex + 1}.${criterionIndex + 1}`}
                              </div>
                              <div className="ctext">
                                <b>{criterion.text}</b>
                                {criterion.guidance ? <span>{criterion.guidance}</span> : null}
                                {/* Un NC es un hallazgo: desde aqui mismo se le asigna plan de
                                    mejora, sin salir de la ronda. Si ya lo tiene, el chip lleva
                                    a su seguimiento. */}
                                {plansByKey.has(key) ? (
                                  <button
                                    type="button" className="plan-chip"
                                    title="Ver el plan de mejora de este hallazgo"
                                    onClick={() => navigate(`/app/listas-chequeo/planes/${plansByKey.get(key)!.id}`)}
                                  >
                                    <ClipboardList size={12} /> Plan · {PLAN_STATUS_LABELS[plansByKey.get(key)!.status]}
                                  </button>
                                ) : current === 'NC' ? (
                                  <button
                                    type="button" className="plan-chip is-new"
                                    title="Crear un plan de mejora para este hallazgo"
                                    onClick={() => void openPlanDialog(subject.id, criterion.id)}
                                  >
                                    <ClipboardList size={12} /> Asignar plan de mejora
                                  </button>
                                ) : null}
                              </div>
                              <div className="segs">
                                {VALUES.map(value => (
                                  <button
                                    key={value} type="button" disabled={closed}
                                    title={CHECKLIST_VALUE_LABELS[value]}
                                    className={`seg ${value} ${current === value ? 'on' : ''}`}
                                    onClick={() => toggle(subject.id, criterion.id, value)}
                                  >{value}</button>
                                ))}
                              </div>
                              <button
                                className="cico" type="button" disabled={closed}
                                title="Escribir una observación"
                                onClick={() => document.getElementById(`obs-${criterion.id}`)?.focus()}
                              ><MessageSquare size={15} /></button>
                              <input
                                id={`obs-${criterion.id}`}
                                className="cobs" disabled={closed}
                                placeholder="Observación (opcional)…"
                                value={notesByAnswer[key] ?? ''}
                                onChange={event => {
                                  setNotesByAnswer(current => ({ ...current, [key]: event.target.value }))
                                  setDirty(true)
                                }}
                              />
                              <button
                                className="cico" type="button" disabled={closed}
                                title="Adjuntar evidencia a este criterio"
                                onClick={() => document.querySelector<HTMLElement>('.eval-drop')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                              ><Paperclip size={15} /></button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                    <div className="checklist-fill-wrap eval-domain-body">
                      <table className="checklist-fill-grid has-many">
                        <thead>
                          <tr>
                            <th className="fill-criterion">Criterio</th>
                            {audit.subjects.map((subject, index) => (
                              <th key={subject.id}><span className="fill-subject-head">{index + 1}. {subject.display_name}</span></th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {domain.criteria.map((criterion, criterionIndex) => (
                            <tr key={criterion.id}>
                              <td className="fill-criterion">
                                <div className="fill-criterion-text">
                                  <span className="fill-num">
                                    {audit.numbered_items && criterion.item_number
                                      ? criterion.item_number
                                      : `${domainIndex + 1}.${criterionIndex + 1}`}
                                  </span>
                                  <span>{criterion.text}</span>
                                </div>
                                {criterion.guidance ? <p className="fill-guidance-text">{criterion.guidance}</p> : null}
                              </td>
                              {audit.subjects.map(subject => {
                                const key = answerKey(subject.id, criterion.id)
                                const current = marks[key]
                                return (
                                  <td key={subject.id} className={current ? '' : 'is-unanswered'}>
                                    <div className="fill-value-group">
                                      {VALUES.map(value => (
                                        <button
                                          key={value} type="button" disabled={closed}
                                          title={CHECKLIST_VALUE_LABELS[value]}
                                          className={`fill-value fill-value--${value.toLowerCase()} ${current === value ? 'is-active' : ''}`}
                                          onClick={() => toggle(subject.id, criterion.id, value)}
                                        >{value}</button>
                                      ))}
                                    </div>
                                    {plansByKey.has(key) ? (
                                      <button
                                        type="button" className="plan-chip"
                                        title="Ver el plan de mejora de este hallazgo"
                                        onClick={() => navigate(`/app/listas-chequeo/planes/${plansByKey.get(key)!.id}`)}
                                      >
                                        <ClipboardList size={11} /> {PLAN_STATUS_LABELS[plansByKey.get(key)!.status]}
                                      </button>
                                    ) : current === 'NC' ? (
                                      <button
                                        type="button" className="plan-chip is-new"
                                        title="Crear un plan de mejora para este hallazgo"
                                        onClick={() => void openPlanDialog(subject.id, criterion.id)}
                                      >
                                        <ClipboardList size={11} /> Plan
                                      </button>
                                    ) : null}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )
                  )}
                </section>
              )
            })}
            <EvidencesCard
              auditId={audit.id}
              evidences={audit.evidences || []}
              notes={notes}
              closed={closed}
              evidenceUrl={checklistsService.evidenceUrl}
              onUpload={addEvidence}
              onRemove={removeEvidence}
              onNotesChange={value => { setNotes(value); setDirty(true) }}
            />

            {/* La firma va AQUI, en la misma hoja: cerrar es el ultimo gesto de la ronda y
                obligar a bajar a otra tarjeta para firmar era un paso de mas. */}
            <SignaturesCard
              signatures={audit.signatures}
              signers={signers}
              closed={closed}
              busy={busy}
              onAdd={addSignature}
              onRemove={removeSignature}
            />

            <div className="scale-note">
              <Info size={14} /> Escala: <strong>C</strong> = Cumple · <strong>NC</strong> = No cumple ·
              {' '}<strong>NA</strong> = No aplica. NA se excluye del cálculo.
            </div>
          </div>

          {/* Panel de resumen. Va pegado al scroll: el auditor tiene que ver el impacto de lo que
              marca sin dejar de marcar. En pantalla angosta se pliega arriba (ver CSS) para no
              robarle ancho a la grilla, que es donde se trabaja. */}
          <aside className="eval-summary">
            <div className="summary">
              <div className="scard">
                <div className="shead">
                  <b>Resumen ejecutivo</b>
                  <span className="cfg" title="La escala y los cortes del semáforo son fijos en todo el sistema"><Settings2 size={14} /></span>
                </div>
                <div className="gauge-wrap">
                  <div className="gauge">
                    {/* Anillo propio y no ProgressRing: la maqueta pide 170 px con degradado
                        violeta -> cian y tres lineas dentro, que el componente compartido no
                        dibuja. El valor sigue saliendo del mismo calculo. */}
                    <svg width="170" height="170" viewBox="0 0 170 170">
                      <circle cx="85" cy="85" r="74" fill="none" stroke="#EDEFF6" strokeWidth="15" />
                      <circle
                        cx="85" cy="85" r="74" fill="none" stroke="url(#ringGrad)" strokeWidth="15"
                        strokeLinecap="round" strokeDasharray={464.9}
                        strokeDashoffset={464.9 - (464.9 * Math.max(0, Math.min(100, shownPercent ?? 0))) / 100}
                        style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)' }}
                      />
                      <defs>
                        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0" stopColor="#5B4BE8" /><stop offset="1" stopColor="#38BDF8" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="ctr">
                      <div className="lbl">Cumplimiento general</div>
                      <div className="pct">{shownPercent === null ? '—' : `${shownPercent.toFixed(0)}%`}</div>
                      {shownPercent !== null && (
                        <div className="tag" style={{
                          background: `color-mix(in srgb, ${semaphoreColor(shownPercent)} 14%, white)`,
                          color: semaphoreColor(shownPercent),
                        }}>● {CONCEPT_TEXT[conceptOf(shownPercent)]}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="stat3">
                  <div className="s"><div className="n">{totalCells}</div><div className="l">Total ítems</div></div>
                  <div className="s"><div className="n">{markedCells}</div><div className="l">Respondidos</div></div>
                  <div className="s"><div className="n pend">{closed ? 0 : localPending}</div><div className="l">Pendientes</div></div>
                </div>
              </div>

              <div className="scard cat">
                <h5>Cumplimiento por categoría</h5>
                {audit.domains.map((domain, index) => {
                  const tally = domainTally(domain)
                  return (
                    <div className="catrow" key={domain.id}>
                      <div className="top">
                        <span>
                          <span className="cn" style={{ background: identity.color }}>{index + 1}</span>
                          {domain.name}
                        </span>
                        <b>{tally.percent === null ? '—' : `${tally.percent.toFixed(0)}%`}</b>
                      </div>
                      <div className="bar">
                        <i style={{
                          width: `${tally.percent ?? 0}%`,
                          background: tally.percent === null ? '#CBD5E1' : semaphoreColor(tally.percent),
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="alert crit">
                <div className="ic"><AlertTriangle size={16} /></div>
                <div className="tx">
                  <b>Hallazgos críticos</b>
                  <span>
                    Ítems marcados como NC que requieren acción inmediata.
                    {(audit.plans || []).length > 0 && <> <b>{(audit.plans || []).length}</b> ya con plan de mejora.</>}
                  </span>
                </div>
                <div className="big">{findings}</div>
              </div>

              {(audit.plans || []).length > 0 && (
                <button className="alert ev" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate('/app/listas-chequeo/planes')}>
                  <div className="ic"><ClipboardList size={16} /></div>
                  <div className="tx">
                    <b>Planes de mejora</b>
                    <span>Seguimiento de los hallazgos de esta ronda.</span>
                  </div>
                  <div className="big">{(audit.plans || []).length}</div>
                </button>
              )}

              <div className="alert ev">
                <div className="ic"><Paperclip size={16} /></div>
                <div className="tx">
                  <b>Evidencias cargadas</b>
                  <span>Archivos e imágenes adjuntadas a esta evaluación.</span>
                </div>
                <div className="big">{(audit.evidences || []).length}</div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {closed && (
      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Resultado</p>
        <h2 className="mt-1 text-xl font-black">Adherencia final</h2>
        <div className="checklist-result-strip mt-4">
          <div className="checklist-result-main">
            <span className="num" style={{ color: semaphoreColor(percent === null ? null : Number(percent)) }}>
              {percent === null ? 'Sin dato' : `${Number(percent).toFixed(1)}%`}
            </span>
            <span className="lbl">Adherencia general</span>
          </div>
          <div className="checklist-result-tallies">
            <div><strong>{audit.adherence.overall.c}</strong><span>Cumple</span></div>
            <div><strong>{audit.adherence.overall.nc}</strong><span>No cumple</span></div>
            <div><strong>{audit.adherence.overall.na}</strong><span>No aplica</span></div>
            <div><strong>{closed ? 0 : localPending}</strong><span>Sin marcar</span></div>
          </div>
        </div>

        {percent === null && audit.subjects.length > 0 && (
          <p className="survey-config-hint mt-3">Todo lo marcado quedó en <strong>NA</strong>: no hay nada aplicable que medir, por eso es «sin dato» y no 0 %.</p>
        )}
        {!closed && localPending > 0 && (
          <p className="survey-config-hint mt-1">Faltan {localPending} marcas. No podrás cerrar la auditoría hasta completarlas.</p>
        )}

        {audit.adherence.byDomain.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-sm font-bold">Por dominio</h3>
            <div className="checklist-domain-results">
              {audit.adherence.byDomain.map(row => {
                const domain = audit.domains.find(item => String(item.id) === String(row.domainId))
                return (
                  <div key={row.domainId} className="checklist-domain-result">
                    <span className="name">{domain?.name || 'Dominio'}</span>
                    <span className="value" style={{ color: semaphoreColor(row.percent) }}>{row.percent === null ? 'Sin dato' : `${row.percent.toFixed(1)}%`}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Firmas. Se recogen con la auditoria ABIERTA y quedan congeladas al cerrar; reabrir las
// invalida (el servidor las borra), porque una firma avala un contenido concreto.

function SignaturesCard({ signatures, signers, closed, busy, onAdd, onRemove }: {
  signatures: AuditDetail['signatures']
  signers: SignerSuggestion[]
  closed: boolean
  busy: boolean
  onAdd(signerName: string, signerRole: string, image: string): void
  onRemove(signatureId: string): void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [image, setImage] = useState<string | null>(null)

  function pickSigner(value: string) {
    if (value === 'NEW') { setName(''); setRole(''); return }
    const found = signers.find(signer => signer.signer_name === value)
    if (found) { setName(found.signer_name); setRole(found.signer_role) }
  }

  function submit() {
    if (!name.trim() || !image) return
    onAdd(name.trim(), role.trim(), image)
    setOpen(false); setName(''); setRole(''); setImage(null)
  }

  return (
    <Card accent={identity.color} className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ds-eyebrow">Trazabilidad</p>
          <h2 className="mt-1 text-xl font-black">Firmas</h2>
        </div>
        {!closed && !open && <Button identity={identity} onClick={() => setOpen(true)}><PenLine size={15} /> Agregar firma</Button>}
      </div>

      {signatures.length ? (
        <div className="signature-list mt-4">
          {signatures.map(signature => (
            <div key={signature.id} className="signature-item">
              <img src={signature.signature_image} alt={`Firma de ${signature.signer_name}`} />
              <div className="signature-item-meta">
                <strong>{signature.signer_name}</strong>
                {signature.signer_role && <small>{signature.signer_role}</small>}
                <time>{new Date(signature.signed_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              {!closed && <button className="survey-icon-button is-danger is-tiny" title="Quitar firma" onClick={() => onRemove(signature.id)}><Trash2 size={12} /></button>}
            </div>
          ))}
        </div>
      ) : (
        <p className="survey-config-hint mt-3">
          {closed
            ? 'Esta auditoría se cerró sin firmas registradas.'
            : 'Aún no hay firmas. Recógelas antes de cerrar: al cerrar quedan congeladas junto al resultado.'}
        </p>
      )}

      {open && !closed && (
        <div className="signature-capture mt-4">
          <div className="signature-capture-fields">
            {signers.length > 0 && (
              <div className="min-w-[220px]">
                <Field label="Firmante frecuente" hint="Opcional">
                  <Select
                    value="NEW"
                    onChange={pickSigner}
                    options={[{ value: 'NEW', label: 'Nuevo firmante' }, ...signers.map(signer => ({ value: signer.signer_name, label: signer.signer_name }))]}
                  />
                </Field>
              </div>
            )}
            <div className="min-w-[220px] flex-1"><Field label="Nombre de quien firma *"><Input value={name} onChange={event => setName(event.target.value)} placeholder="Nombre completo" /></Field></div>
            <div className="min-w-[200px]"><Field label="Rol" hint="Responsable, profesional auditado…"><Input value={role} onChange={event => setRole(event.target.value)} /></Field></div>
          </div>

          <SignaturePad onChange={setImage} />

          <div className="mt-3 flex items-center gap-3">
            <Button identity={identity} onClick={submit} disabled={busy || !name.trim() || !image}><PenLine size={15} /> Registrar firma</Button>
            <button className="survey-config-add" onClick={() => { setOpen(false); setImage(null) }}>Cancelar</button>
            {!image && <span className="survey-config-hint">Traza la firma en el recuadro para poder registrarla.</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function SubjectForm({ subjectLabel, fields, directory, busy, onCancel, onSubmit }: {
  subjectLabel: string
  fields: ChecklistField[]
  directory: DirectorySubject[]
  busy: boolean
  onCancel(): void
  onSubmit(displayName: string, attributes: Record<string, string>, subjectId: string | null): void
}) {
  const [displayName, setDisplayName] = useState('')
  const [attributes, setAttributes] = useState<Record<string, string>>({})
  const [fromDirectory, setFromDirectory] = useState('')

  // Traer del directorio evita volver a teclear a alguien ya registrado en una ronda anterior.
  function pickFromDirectory(id: string) {
    setFromDirectory(id)
    const found = directory.find(subject => String(subject.id) === id)
    if (found) { setDisplayName(found.display_name); setAttributes(found.attributes || {}) }
  }

  return (
    <div className="checklist-subject-form mt-4">
      {directory.length > 0 && (
        <div className="min-w-[240px]">
          <Field label="Traer de registros anteriores" hint="Opcional">
            <Select
              value={fromDirectory || 'NEW'}
              onChange={value => { if (value === 'NEW') { setFromDirectory(''); setDisplayName(''); setAttributes({}) } else pickFromDirectory(value) }}
              options={[{ value: 'NEW', label: `Nuevo ${subjectLabel.toLowerCase()}` }, ...directory.map(subject => ({ value: subject.id, label: subject.display_name }))]}
            />
          </Field>
        </div>
      )}
      <div className="min-w-[220px] flex-1">
        <Field label={`Identificación del ${subjectLabel.toLowerCase()} *`}>
          <Input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Ej. Nombre o número de HC" />
        </Field>
      </div>
      {fields.map(field => (
        <div key={field.id} className="min-w-[160px]">
          <Field label={field.label}>
            {field.field_type === 'SELECT' ? (
              <Select
                value={attributes[field.id] || ''}
                onChange={value => setAttributes(current => ({ ...current, [field.id]: value }))}
                options={(field.options || []).map(option => ({ value: option, label: option }))}
              />
            ) : (
              <Input
                type={field.field_type === 'DATE' ? 'date' : field.field_type === 'NUMBER' ? 'number' : 'text'}
                value={attributes[field.id] || ''}
                onChange={event => setAttributes(current => ({ ...current, [field.id]: event.target.value }))}
              />
            )}
          </Field>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button identity={identity} disabled={busy || !displayName.trim()} onClick={() => onSubmit(displayName.trim(), attributes, fromDirectory || null)}>
          <Plus size={15} /> Agregar
        </Button>
        <button className="survey-config-add" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
