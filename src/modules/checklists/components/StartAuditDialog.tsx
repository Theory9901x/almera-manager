import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Play, X } from 'lucide-react'
import { Button, DatePicker, Field, Select, moduleIdentity } from '@/design-system'
import type { ChecklistArea } from '../types'

const identity = moduleIdentity('checklists')

/** Turnos institucionales. Es una lista cerrada a proposito: si cada auditor escribe el suyo
 *  ("mañana", "AM", "1er turno"), el filtro por turno del tablero deja de agrupar. */
export const SHIFTS = ['Mañana', 'Tarde', 'Noche']

export interface StartContext {
  auditDate: string
  areaId: string
  shift: string
  /** Solo cuando el diálogo ofrece elegir el formato. */
  templateId?: string
}

/**
 * Contexto de la ronda ANTES de evaluar: fecha, servicio y turno.
 *
 * Va primero y es obligatorio porque es lo que alimenta los filtros del centro de datos. La
 * fecha NO se asume "hoy" en silencio: una ronda se registra a veces al terminar el turno o al
 * dia siguiente, y una fecha puesta sola sin que nadie la mire ensucia toda la serie temporal.
 * Se propone hoy, pero el auditor tiene que confirmarla.
 */
export function StartAuditDialog({ open, templateName, templateId, templates, areas, busy, onCancel, onStart }: {
  open: boolean
  templateName: string
  templateId?: string
  /** Si se pasan, el diálogo deja elegir el formato aquí mismo en vez de volver atrás. */
  templates?: { id: string; name: string; code?: string }[]
  areas: ChecklistArea[]
  busy?: boolean
  onCancel(): void
  onStart(context: StartContext): void
}) {
  const [context, setContext] = useState<StartContext>({ auditDate: '', areaId: '', shift: '', templateId: '' })
  const [touched, setTouched] = useState(false)
  // Centro elegido. Es un campo APARTE del servicio, no un selector combinado "centro · servicio":
  // el auditor primero se ubica en su sede y luego elige el servicio de esa sede.
  const [center, setCenter] = useState('')

  useEffect(() => {
    if (open) { setContext({ auditDate: '', areaId: '', shift: '', templateId: templateId || '' }); setCenter(''); setTouched(false) }
  }, [open, templateId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  // Los centros salen de las areas ya sembradas, en el orden que trae el servidor (HOCY primero).
  // Un area sin centro se agrupa bajo el sentinela 'SIN': Radix no distingue el valor vacio de
  // "sin seleccionar".
  const centers = [...new Set(areas.map(area => area.center || 'SIN'))]
  const centerAreas = areas.filter(area => (area.center || 'SIN') === center)

  const missingDate = !context.auditDate
  const missingArea = !context.areaId
  const canStart = !missingDate && !missingArea && !(templates && templates.length > 1 && !context.templateId)

  return createPortal(
    <div className="ds-confirm-backdrop" onClick={() => !busy && onCancel()}>
      <div className="ds-confirm start-audit" role="dialog" aria-modal="true" aria-labelledby="start-audit-title" onClick={event => event.stopPropagation()}>
        <button className="ds-confirm-close" onClick={onCancel} aria-label="Cerrar"><X size={16} /></button>
        <div className="ds-confirm-icon" style={{ background: `${identity.color}1f`, color: identity.color }}>
          <CalendarClock size={22} />
        </div>
        <h2 id="start-audit-title">Contexto de la ronda</h2>
        <p className="ds-confirm-body">
          Vas a auditar <strong>{templateName}</strong>. Estos datos identifican la ronda y son
          los que después permiten filtrar los resultados por servicio, fecha y turno.
        </p>

        <div className="start-audit-form">
          {templates && templates.length > 1 && (
            <Field label="Lista a diligenciar *">
              <Select
                value={context.templateId || ''}
                onChange={value => setContext({ ...context, templateId: value })}
                options={templates.map(item => ({ value: item.id, label: item.code ? `${item.code} · ${item.name}` : item.name }))}
              />
            </Field>
          )}
          <Field label="Fecha de la ronda *" hint={touched && missingDate ? 'Elige la fecha' : 'No se asume hoy: confírmala'}>
            <DatePicker value={context.auditDate} onChange={value => setContext({ ...context, auditDate: value })} />
          </Field>
          {/* Dos campos separados, en orden: primero el centro de atencion, luego el servicio de
              ese centro. Un selector combinado mezclaba las dos preguntas y con 47 filas era
              inmanejable en tablet. */}
          <Field label="Centro de atención *" hint={touched && !center ? 'Elige el centro' : undefined}>
            <Select
              value={center || 'NONE'}
              onChange={value => {
                const next = value === 'NONE' ? '' : value
                setCenter(next)
                // Al cambiar de centro, el servicio elegido deja de valer: era de otra sede.
                setContext(current => ({ ...current, areaId: '' }))
              }}
              options={[{ value: 'NONE', label: 'Selecciona el centro' },
                ...centers.map(item => ({ value: item, label: item === 'SIN' ? 'Sin centro' : item }))]}
            />
          </Field>
          <Field label="Servicio *" hint={touched && missingArea ? 'Elige el servicio' : !center ? 'Primero elige el centro' : undefined}>
            <Select
              value={context.areaId || 'NONE'}
              disabled={!center}
              onChange={value => setContext({ ...context, areaId: value === 'NONE' ? '' : value })}
              options={[{ value: 'NONE', label: center ? 'Selecciona el servicio' : 'Elige primero el centro' },
                ...centerAreas.map(area => ({ value: area.id, label: area.name }))]}
            />
          </Field>
          <Field label="Turno" hint="Opcional: solo si la ronda es de un turno concreto">
            <Select
              value={context.shift || 'NONE'}
              onChange={value => setContext({ ...context, shift: value === 'NONE' ? '' : value })}
              options={[{ value: 'NONE', label: 'Sin turno' }, ...SHIFTS.map(shift => ({ value: shift, label: shift }))]}
            />
          </Field>
        </div>

        <div className="ds-confirm-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            identity={identity}
            disabled={busy}
            onClick={() => { setTouched(true); if (canStart) onStart(context) }}
          >
            <Play size={15} /> {busy ? 'Abriendo…' : 'Empezar a auditar'}
          </Button>
        </div>
        {touched && !canStart && (
          <p className="start-audit-error">Faltan la fecha o el servicio. Sin ellos la auditoría no se puede ubicar después.</p>
        )}
      </div>
    </div>,
    document.body,
  )
}
