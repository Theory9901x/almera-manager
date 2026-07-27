import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, X } from 'lucide-react'
import { Button, Field, Select, Textarea, moduleIdentity } from '@/design-system'
import type { PlanAssignee } from '../types'

const identity = moduleIdentity('checklists')

export interface PlanDraft {
  criterionId: string
  auditSubjectId: string
  criterionText: string
  subjectName: string
  /** Observacion ya escrita en la celda: se propone como descripcion del hallazgo. */
  observation: string
  /** Membresia enlazada al sujeto, si existe: preselecciona al responsable (§15.1). */
  linkedMembershipId: string | null
}

/**
 * Crear un plan de mejora desde la ronda, sobre un criterio marcado NC.
 *
 * El responsable se elige de las cuentas de la entidad; si el sujeto auditado esta enlazado a
 * una cuenta, viene preseleccionado. "Recordar responsable" guarda ese enlace en el directorio
 * para que la proxima ronda sobre el mismo colaborador no vuelva a preguntarlo.
 */
export function PlanCreateDialog({ draft, assignees, busy, onCancel, onCreate }: {
  draft: PlanDraft | null
  assignees: PlanAssignee[]
  busy: boolean
  onCancel(): void
  onCreate(data: { finding: string; assignedMembershipId: string | null; rememberAssignee: boolean }): void
}) {
  const [finding, setFinding] = useState('')
  const [assigned, setAssigned] = useState('')
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    if (draft) {
      setFinding(draft.observation || '')
      setAssigned(draft.linkedMembershipId || '')
      setRemember(false)
    }
  }, [draft])

  useEffect(() => {
    if (!draft) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [draft, onCancel])

  if (!draft) return null

  return createPortal(
    <div className="ds-confirm-backdrop" onClick={() => !busy && onCancel()}>
      <div className="ds-confirm start-audit" role="dialog" aria-modal="true" aria-labelledby="plan-create-title" onClick={event => event.stopPropagation()}>
        <button className="ds-confirm-close" onClick={onCancel} aria-label="Cerrar"><X size={16} /></button>
        <div className="ds-confirm-icon" style={{ background: `${identity.color}1f`, color: identity.color }}>
          <ClipboardList size={22} />
        </div>
        <h2 id="plan-create-title">Plan de mejora</h2>
        <p className="ds-confirm-body">
          <strong>{draft.criterionText}</strong>
          {draft.subjectName ? <> — evaluado: <strong>{draft.subjectName}</strong></> : null}.
          {' '}El hallazgo queda con responsable y seguimiento hasta que calidad verifique la subsanación.
        </p>

        <div className="start-audit-form">
          <Field label="Hallazgo / acción de mejora" hint="Qué se encontró y qué debe corregirse">
            <Textarea rows={3} maxLength={4000} value={finding} onChange={event => setFinding(event.target.value)} />
          </Field>
          <Field label="Responsable de subsanar" hint="Debe tener cuenta para subir su evidencia; si aún no la tiene, calidad gestiona por él">
            <Select
              value={assigned || 'NONE'}
              onChange={value => setAssigned(value === 'NONE' ? '' : value)}
              options={[{ value: 'NONE', label: 'Sin asignar todavía' },
                ...assignees.map(item => ({ value: item.id, label: item.full_name }))]}
            />
          </Field>
          {assigned && draft.subjectName ? (
            <label className="plan-remember">
              <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} />
              <span>Recordar que <strong>{draft.subjectName}</strong> es esta cuenta, para preseleccionarla en próximas rondas</span>
            </label>
          ) : null}
        </div>

        <div className="ds-confirm-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            identity={identity}
            disabled={busy}
            onClick={() => onCreate({ finding: finding.trim(), assignedMembershipId: assigned || null, rememberAssignee: remember })}
          >
            <ClipboardList size={15} /> {busy ? 'Creando…' : 'Crear plan'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
