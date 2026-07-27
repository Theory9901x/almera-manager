import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Info, Loader2, Lock, PenLine, Plus, Save, Trash2, Unlock, UserPlus } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, ModuleHero, SaveStatusIndicator, Select,
  ToastProvider, moduleIdentity, semaphoreColor, useToast,
} from '@/design-system'
import { checklistsService } from '../services/checklistsService'
import { SignaturePad } from '../components/SignaturePad'
import {
  CHECKLIST_VALUE_LABELS, type AuditDetail, type ChecklistField, type ChecklistValue,
  type DirectorySubject, type SignerSuggestion,
} from '../types'

const identity = moduleIdentity('checklists')
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

  function hydrate(detail: AuditDetail) {
    setAudit(detail)
    const next: Record<string, ChecklistValue> = {}
    for (const answer of detail.answers) next[answerKey(answer.audit_subject_id, answer.criterion_id)] = answer.value
    setMarks(next)
    setHeader(detail.header_values || {})
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

  const criteria = useMemo(() => audit ? audit.domains.flatMap(domain => domain.criteria) : [], [audit])
  const closed = audit?.status === 'CERRADA'

  // Avance en vivo, con la misma regla del servidor: NA cuenta como respondido.
  const localPending = useMemo(() => {
    if (!audit) return 0
    return Math.max(0, audit.subjects.length * criteria.length - Object.keys(marks).length)
  }, [audit, criteria.length, marks])

  function toggle(subjectRowId: string, criterionId: string, value: ChecklistValue) {
    if (closed) return
    setMarks(current => {
      const key = answerKey(subjectRowId, criterionId)
      const next = { ...current }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
    setDirty(true)
    setSaveState('idle')
  }

  async function saveAll() {
    if (!audit || !dirty) return
    setSaveState('saving')
    try {
      if (headerDirty.current) await checklistsService.updateAudit(audit.id, { headerValues: header })
      // Se manda tambien lo desmarcado (value null) para que el servidor borre esas filas: sin
      // esto, deshacer una marca no se persistiria nunca.
      const payload: { auditSubjectId: string; criterionId: string; value: ChecklistValue | null }[] = []
      for (const subject of audit.subjects) {
        for (const criterion of criteria) {
          const key = answerKey(subject.id, criterion.id)
          const previous = audit.answers.find(answer => answerKey(answer.audit_subject_id, answer.criterion_id) === key)
          const now = marks[key] ?? null
          if ((previous?.value ?? null) !== now) payload.push({ auditSubjectId: subject.id, criterionId: criterion.id, value: now })
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
  const livePercent = (domain: typeof audit.domains[number]) => {
    let c = 0, nc = 0
    for (const criterion of domain.criteria) {
      for (const subject of audit.subjects) {
        const value = marks[answerKey(subject.id, criterion.id)]
        if (value === 'C') c++
        else if (value === 'NC') nc++
      }
    }
    return c + nc > 0 ? (c / (c + nc)) * 100 : null
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <button className="row-action" style={{ color: identity.color }} onClick={() => navigate('/app/listas-chequeo')}>
        <ArrowLeft size={15} /> Volver a auditorías
      </button>

      <ModuleHero
        badge={audit.code ? `${audit.code} · v${audit.version}` : 'Auditoría'}
        title={audit.template_name}
        subtitle={`${audit.area_name || 'Sin área'} · ${new Date(`${audit.audit_date}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} · ${audit.auditor_name}`}
        accent={identity.color}
        className="checklists-hero"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="survey-unsaved-dot">Cambios sin guardar</span>}
            <SaveStatusIndicator state={saveState} />
            <Badge tone={closed ? 'info' : 'neutral'}>{closed ? 'Cerrada' : 'Borrador'}</Badge>
            {!closed && <Button identity={identity} onClick={() => void saveAll()} disabled={!dirty || saveState === 'saving'}><Save size={15} /> Guardar</Button>}
            <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => void exportPdf()} disabled={exporting}>
              <Download size={15} /> {exporting ? 'Generando…' : 'Informe PDF'}
            </Button>
            {!closed
              ? <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => void closeAudit()} disabled={busy}><Lock size={15} /> Cerrar auditoría</Button>
              : <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => void reopenAudit()} disabled={busy}><Unlock size={15} /> Reabrir</Button>}
          </div>
        }
      >
        <div className="hero-stat-inline">
          <div><div className="num">{audit.subjects.length}</div><div className="lbl">{audit.subject_label}s</div></div>
          <div><div className="num" style={{ color: percent === null ? undefined : semaphoreColor(percent) }}>{percent === null ? '—' : `${Number(percent).toFixed(1)}%`}</div><div className="lbl">Adherencia</div></div>
          <div><div className="num">{closed ? 0 : localPending}</div><div className="lbl">Sin marcar</div></div>
        </div>
      </ModuleHero>

      {audit.headerFields.length > 0 && (
        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Datos generales</p>
          <h2 className="mt-1 text-xl font-black">Cabecera de la auditoría</h2>
          <div className="dialog-form mt-4">
            {audit.headerFields.map(field => (
              <Field key={field.id} label={field.label + (field.required ? ' *' : '')}>
                {field.field_type === 'SELECT' ? (
                  <Select
                    value={header[field.id] || ''} disabled={closed}
                    onChange={value => { setHeader(current => ({ ...current, [field.id]: value })); headerDirty.current = true; setDirty(true) }}
                    options={(field.options || []).map(option => ({ value: option, label: option }))}
                  />
                ) : (
                  <Input
                    type={field.field_type === 'DATE' ? 'date' : field.field_type === 'NUMBER' ? 'number' : 'text'}
                    value={header[field.id] || ''} disabled={closed}
                    onChange={event => { setHeader(current => ({ ...current, [field.id]: event.target.value })); headerDirty.current = true; setDirty(true) }}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>
      )}

      <Card accent={identity.color} className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="ds-eyebrow">Sujetos auditados</p>
            <h2 className="mt-1 text-xl font-black">{audit.subject_label}s de esta ronda</h2>
          </div>
          {!closed && <Button identity={identity} onClick={() => setShowSubjectForm(true)}><UserPlus size={15} /> Agregar {audit.subject_label.toLowerCase()}</Button>}
        </div>

        {audit.subjects.length ? (
          <div className="checklist-subject-chips mt-4">
            {audit.subjects.map((subject, index) => (
              <div key={subject.id} className="checklist-subject-chip">
                <span className="idx">{index + 1}</span>
                <div className="min-w-0">
                  <strong>{subject.display_name}</strong>
                  {Object.entries(subject.attributes_snapshot || {}).filter(([, value]) => value).length > 0 && (
                    <small>{Object.entries(subject.attributes_snapshot).filter(([, value]) => value).map(([, value]) => value).join(' · ')}</small>
                  )}
                </div>
                {!closed && <button className="survey-icon-button is-danger is-tiny" title="Quitar" onClick={() => void removeSubject(subject.id)}><Trash2 size={12} /></button>}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState icon={UserPlus} title={`Aún no hay ${audit.subject_label.toLowerCase()}s`} description="Agrega al menos uno para poder empezar a calificar los criterios." />
          </div>
        )}

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
      </Card>

      {audit.subjects.length > 0 && criteria.length > 0 && (
        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Calificación</p>
          <h2 className="mt-1 text-xl font-black">Criterios por {audit.subject_label.toLowerCase()}</h2>
          <p className="survey-config-hint mt-2">
            Marca <strong>C</strong> (cumple), <strong>NC</strong> (no cumple) o <strong>NA</strong> (no aplica).
            NA no penaliza: se excluye del cálculo. Toca de nuevo para deshacer la marca.
          </p>

          <div className="checklist-progress mt-4">
            <div className="checklist-progress-bar"><i style={{ width: `${progress}%`, background: identity.color }} /></div>
            <span className="checklist-progress-label">
              {markedCells} de {totalCells} marcas · <strong>{progress}%</strong>
            </span>
          </div>

          {audit.domains.length > 1 && (
            <nav className="checklist-domain-nav" aria-label="Ir a un dominio">
              {audit.domains.map(domain => {
                const value = livePercent(domain)
                return (
                  <button
                    key={domain.id} type="button"
                    onClick={() => document.getElementById(`dom-${domain.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    <span>{domain.name}</span>
                    <b style={{ color: value === null ? 'var(--muted)' : semaphoreColor(value) }}>
                      {value === null ? '—' : `${value.toFixed(0)}%`}
                    </b>
                  </button>
                )
              })}
            </nav>
          )}

          <div className="checklist-fill-wrap mt-4">
            <table className="checklist-fill-grid">
              <thead>
                <tr>
                  <th className="fill-criterion">Criterio</th>
                  {audit.subjects.map((subject, index) => (
                    <th key={subject.id}><span className="fill-subject-head">{index + 1}. {subject.display_name}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.domains.map(domain => (
                  <Fragment key={domain.id}>
                    <tr className="fill-domain-row" id={`dom-${domain.id}`}>
                      <td colSpan={audit.subjects.length + 1}>
                        {domain.name}
                        {(() => {
                          const value = livePercent(domain)
                          return (
                            <em style={{ color: value === null ? 'var(--muted)' : semaphoreColor(value) }}>
                              {value === null ? 'sin marcar' : `${value.toFixed(1)}%`}
                            </em>
                          )
                        })()}
                      </td>
                    </tr>
                    {domain.criteria.map(criterion => (
                      <tr key={criterion.id}>
                        <td className="fill-criterion">
                          <div className="fill-criterion-text">
                            {audit.numbered_items && criterion.item_number ? <span className="fill-num">{criterion.item_number}.</span> : null}
                            <span>{criterion.text}</span>
                            {criterion.guidance ? <span className="fill-guidance" title={criterion.guidance}><Info size={13} /></span> : null}
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
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SignaturesCard
        signatures={audit.signatures}
        signers={signers}
        closed={closed}
        busy={busy}
        onAdd={addSignature}
        onRemove={removeSignature}
      />

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Resultado</p>
        <h2 className="mt-1 text-xl font-black">Adherencia {closed ? 'final' : 'en curso'}</h2>
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
