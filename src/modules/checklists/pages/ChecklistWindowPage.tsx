import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { ToastProvider, moduleIdentity, useToast } from '@/design-system'
import { checklistsService } from '../services/checklistsService'
import { answerKey } from '../components/ChecklistFillGrid'
import { ChecklistFillFullscreen } from '../components/ChecklistFillFullscreen'
import type { ActionPlan, AuditDetail, ChecklistValue } from '../types'

const identity = moduleIdentity('checklists')

/**
 * La auditoria SOLA, en su propia ventana: para diligenciar con dos monitores dejando el resto
 * del sistema en la otra pantalla. Mismo patron que la matriz de adherencia (CLAUDE.md §12).
 *
 * Es una superficie de MARCADO, nada mas: no trae cabecera, cierre, firmas ni creacion de planes
 * de mejora — esas acciones siguen viviendo en la pantalla principal, que es donde tienen
 * contexto. Un plan ya creado SI se puede ver (el chip de la celda es informativo).
 *
 * Carga su propia copia del detalle porque una ventana aparte no puede leer el estado de React de
 * la otra; por eso quien la abre guarda primero (ver `ChecklistAuditPage.openInWindow`), para que
 * esta arranque con todo lo marcado.
 */
export default function ChecklistWindowPage() {
  return <ToastProvider><ChecklistWindowContent /></ToastProvider>
}

function ChecklistWindowContent() {
  const { auditId } = useParams()
  const toast = useToast()
  const [audit, setAudit] = useState<AuditDetail | null>(null)
  const [marks, setMarks] = useState<Record<string, ChecklistValue>>({})
  const [notesByAnswer, setNotesByAnswer] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    if (!auditId) return
    try {
      const detail = await checklistsService.audit(auditId)
      setAudit(detail)
      const nextMarks: Record<string, ChecklistValue> = {}
      const nextNotes: Record<string, string> = {}
      for (const answer of detail.answers) {
        const key = answerKey(answer.audit_subject_id, answer.criterion_id)
        nextMarks[key] = answer.value
        if (answer.observation) nextNotes[key] = answer.observation
      }
      setMarks(nextMarks)
      setNotesByAnswer(nextNotes)
      setDirty(false)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible cargar la auditoría') }
  }, [auditId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const criteria = audit ? audit.domains.flatMap(domain => domain.criteria) : []
  const closed = audit?.status === 'CERRADA'

  const plansByKey = new Map<string, ActionPlan>(
    (audit?.plans || [])
      .filter(plan => plan.audit_subject_id && plan.criterion_id)
      .map(plan => [answerKey(String(plan.audit_subject_id), String(plan.criterion_id)), plan]),
  )

  function domainTally(domain: NonNullable<typeof audit>['domains'][number]) {
    let c = 0, nc = 0, na = 0, marked = 0
    for (const criterion of domain.criteria) {
      for (const subject of audit?.subjects || []) {
        const value = marks[answerKey(subject.id, criterion.id)]
        if (value === 'C') { c++; marked++ }
        else if (value === 'NC') { nc++; marked++ }
        else if (value === 'NA') { na++; marked++ }
      }
    }
    const cells = domain.criteria.length * (audit?.subjects.length || 0)
    return { c, nc, na, marked, cells, percent: c + nc > 0 ? (c / (c + nc)) * 100 : null }
  }

  const setMark = (subjectId: string, criterionId: string, value: ChecklistValue) => {
    const key = answerKey(subjectId, criterionId)
    setMarks(current => {
      const next = { ...current }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
    setDirty(true)
  }

  const save = async () => {
    if (!audit) return
    setSaving(true); setError('')
    try {
      const payload: { auditSubjectId: string; criterionId: string; value: ChecklistValue | null; observation: string }[] = []
      for (const subject of audit.subjects) {
        for (const criterion of criteria) {
          const key = answerKey(subject.id, criterion.id)
          const previous = audit.answers.find(answer => answerKey(answer.audit_subject_id, answer.criterion_id) === key)
          const now = marks[key] ?? null
          const observation = notesByAnswer[key] ?? ''
          if ((previous?.value ?? null) !== now || (previous?.observation ?? '') !== observation) {
            payload.push({ auditSubjectId: subject.id, criterionId: criterion.id, value: now, observation })
          }
        }
      }
      const detail = payload.length ? await checklistsService.saveAnswers(audit.id, payload) : audit
      setAudit(detail)
      setDirty(false)
      toast.push('success', 'Auditoría guardada')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar') }
    finally { setSaving(false) }
  }

  if (error) return <div className="hcwin-msg"><p>{error}</p></div>
  if (!audit) return <div className="hcwin-msg"><Loader2 className="animate-spin" size={22} /><p>Cargando la auditoría…</p></div>

  const totalCells = criteria.length * audit.subjects.length
  const markedCells = Object.keys(marks).length
  const counts = { c: 0, nc: 0, na: 0 }
  for (const value of Object.values(marks)) {
    if (value === 'C') counts.c += 1
    else if (value === 'NC') counts.nc += 1
    else if (value === 'NA') counts.na += 1
  }
  const overallPercent = counts.c + counts.nc > 0 ? (counts.c / (counts.c + counts.nc)) * 100 : null

  return (
    <ChecklistFillFullscreen
      open
      // No hay adonde "volver": esta es la ventana. El boton la cierra, y si el navegador no lo
      // permite (no la abrio un script) al menos avisa.
      onClose={() => {
        window.close()
        window.setTimeout(() => {
          if (!window.closed) setError('Cierra esta ventana desde el navegador: la abriste tú, no el sistema.')
        }, 300)
      }}
      closeLabel="Cerrar ventana"
      title={audit.template_name}
      subtitle={`${audit.area_name || 'Sin servicio'} · ${audit.subjects.length} en turno · ${audit.domains.length} dominios`}
      domains={audit.domains}
      subjects={audit.subjects}
      numberedItems={audit.numbered_items}
      marks={marks}
      notesByAnswer={notesByAnswer}
      closed={closed}
      onMark={setMark}
      onNote={(subjectId, criterionId, value) => {
        setNotesByAnswer(current => ({ ...current, [answerKey(subjectId, criterionId)]: value }))
        setDirty(true)
      }}
      plansByKey={plansByKey}
      onOpenPlan={() => toast.push('info', 'Los planes de mejora se crean desde la pantalla principal de la auditoría')}
      onNavigatePlan={() => toast.push('info', 'Abre el plan desde la pantalla principal de la auditoría')}
      domainTally={domainTally}
      identityColor={identity.color}
      overallPercent={overallPercent}
      counts={counts}
      totalCells={totalCells}
      markedCells={markedCells}
      onSave={() => void save()}
      saving={saving}
      dirty={dirty}
      onReload={() => void load()}
    />
  )
}
