import { useState } from 'react'
import { CalendarClock, Hash, Plus, Trash2 } from 'lucide-react'
import { Button, DatePicker, Field, Select, moduleIdentity } from '@/design-system'
import type { Commitment, CommitmentStatus } from '../types'
import {
  COMMITMENT_STATUS_COLORS, COMMITMENT_STATUS_LABELS, COMMITMENT_STATUSES, isCommitmentOverdue,
} from './commitmentStatus'

const identity = moduleIdentity('adherence-matrix')

/**
 * Lista de compromisos del profesional auditado.
 *
 * Cada actividad es una fila propia con su numero, su ID (`CMP-000123`), su fecha limite y su
 * estado. Antes era un unico campo de texto, y con eso no se puede seguir nada: no se sabe cual
 * de los tres compromisos se cumplio, ni referenciarlo en la siguiente visita, ni quitarlo sin
 * reescribir el parrafo entero.
 *
 * Se guarda actividad por actividad, no con un boton global: la descripcion al salir del campo,
 * el estado al elegirlo. Un guardado que abarcara toda la lista podria pisar el cambio de estado
 * que el profesional hizo por su cuenta mientras el auditor escribia.
 */
export function CommitmentsEditor({
  commitments, professionalName, busy, readOnly = false,
  onAdd, onEdit, onRemove, onStatus,
}: {
  commitments: Commitment[]
  professionalName: string
  busy?: boolean
  readOnly?: boolean
  onAdd(description: string, dueDate: string): void | Promise<void>
  onEdit(commitmentId: string, data: { description?: string; dueDate?: string | null }): void | Promise<void>
  onRemove(commitmentId: string): void | Promise<void>
  onStatus(commitmentId: string, status: CommitmentStatus): void | Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [draftDue, setDraftDue] = useState('')

  const submit = async () => {
    const description = draft.trim()
    if (!description) return
    await onAdd(description, draftDue)
    setDraft(''); setDraftDue('')
  }

  const done = commitments.filter(item => item.status === 'CUMPLIDO').length

  return (
    <section className="cmt-block">
      <header className="cmt-head">
        <div>
          <p className="ds-eyebrow">Compromisos</p>
          <h3 className="cmt-title">Actividades acordadas con {professionalName}</h3>
          <p className="cmt-sub">
            Cada actividad se sigue por separado y tiene su propio identificador para poder
            referenciarla en la próxima visita.
          </p>
        </div>
        {commitments.length > 0 && (
          <div className="cmt-count">
            <b>{done}</b><span>de {commitments.length} cumplidas</span>
          </div>
        )}
      </header>

      {commitments.length === 0 ? (
        <p className="cmt-empty">Todavía no hay compromisos registrados.</p>
      ) : (
        <ol className="cmt-list">
          {commitments.map(item => {
            const overdue = isCommitmentOverdue(item.due_date, item.status)
            return (
              <li className="cmt-item" key={item.id}>
                <span className="cmt-n">{item.order_index}</span>
                <div className="cmt-body">
                  <div className="cmt-meta">
                    <span className="cmt-code"><Hash size={11} />{item.code}</span>
                    {item.status_changed_at && item.status_changed_by_name ? (
                      <span className="cmt-by">
                        {COMMITMENT_STATUS_LABELS[item.status]} por {item.status_changed_by_name} ·{' '}
                        {new Date(item.status_changed_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    ) : null}
                  </div>
                  {readOnly ? (
                    <p className="cmt-text">{item.description}</p>
                  ) : (
                    <textarea
                      className="ds-input ds-textarea cmt-input"
                      rows={2}
                      defaultValue={item.description}
                      disabled={busy}
                      // Al SALIR del campo, no en cada tecla: son textos largos y una peticion
                      // por pulsacion no aporta nada.
                      onBlur={event => {
                        const value = event.target.value.trim()
                        if (value && value !== item.description) void onEdit(item.id, { description: value })
                      }}
                    />
                  )}
                  <div className="cmt-row">
                    <label className={`cmt-due${overdue ? ' is-late' : ''}`}>
                      {/* El icono solo en modo lectura: el DatePicker ya trae el suyo dentro. */}
                      {readOnly ? <CalendarClock size={13} /> : null}
                      {readOnly ? (
                        <span>{item.due_date ? new Date(`${item.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha límite'}</span>
                      ) : (
                        <DatePicker
                          value={item.due_date ? item.due_date.slice(0, 10) : ''}
                          onChange={value => void onEdit(item.id, { dueDate: value || null })}
                          placeholder="Sin fecha límite"
                        />
                      )}
                      {overdue ? <b className="cmt-late">Vencida</b> : null}
                    </label>
                    <Select
                      value={item.status}
                      onChange={value => void onStatus(item.id, value as CommitmentStatus)}
                      options={COMMITMENT_STATUSES.map(status => ({ value: status, label: COMMITMENT_STATUS_LABELS[status] }))}
                    />
                    <span className="cmt-dot" style={{ background: COMMITMENT_STATUS_COLORS[item.status] }} />
                    {!readOnly && (
                      <button className="cmt-del" onClick={() => void onRemove(item.id)} disabled={busy} title="Quitar actividad">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {!readOnly && (
        <div className="cmt-new">
          <Field label="Nueva actividad">
            <textarea
              className="ds-input ds-textarea"
              rows={2}
              value={draft}
              disabled={busy}
              placeholder="Ej. Diligenciar el consentimiento informado en el 100% de los procedimientos"
              onChange={event => setDraft(event.target.value)}
            />
          </Field>
          <Field label="Fecha límite (opcional)">
            <DatePicker value={draftDue} onChange={setDraftDue} placeholder="Sin fecha" />
          </Field>
          <Button identity={identity} onClick={() => void submit()} disabled={busy || !draft.trim()}>
            <Plus size={15} />Agregar actividad
          </Button>
        </div>
      )}
    </section>
  )
}

