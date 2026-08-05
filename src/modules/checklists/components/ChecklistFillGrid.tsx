import { ChevronDown, ChevronUp, CheckCircle2, CircleDashed, ClipboardList, MessageSquare, Paperclip } from 'lucide-react'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
import { CHECKLIST_VALUE_LABELS, PLAN_STATUS_LABELS, type ActionPlan, type AuditSubject, type ChecklistDomain, type ChecklistValue } from '../types'

const VALUES: ChecklistValue[] = ['C', 'NC', 'NA']

export function answerKey(subjectRowId: string, criterionId: string) { return `${subjectRowId}|${criterionId}` }

export interface DomainTally { c: number; nc: number; na: number; marked: number; cells: number; percent: number | null }

/**
 * Cuerpo de diligenciamiento: el acordeon de dominios con la matriz criterio x sujeto.
 *
 * Es EL MISMO componente en las tres superficies (embebida, pantalla completa, ventana aparte):
 * recibe el buffer de marcas y el `onMark` de quien lo use, no mantiene estado propio. Por eso
 * pasar de una superficie a otra no pierde nada — no hay dos copias que sincronizar, hay una sola
 * arriba, igual que en la matriz de adherencia (ver CLAUDE.md §12).
 *
 * `variant="fullscreen"` cambia SOLO las clases (paleta via variables --hcfs-*, que ya resuelven
 * claro/oscuro): la logica y la estructura son identicas a la vista embebida.
 */
export function ChecklistFillGrid({
  variant, domains, subjects, numberedItems, marks, notesByAnswer, closed, disabled, collapsed,
  onToggleDomain, onMark, onNote, plansByKey, onOpenPlan, onNavigatePlan, domainTally, identityColor,
  activeDomainId,
}: {
  variant: 'embedded' | 'fullscreen'
  domains: ChecklistDomain[]
  subjects: AuditSubject[]
  numberedItems: boolean
  marks: Record<string, ChecklistValue>
  notesByAnswer: Record<string, string>
  closed: boolean
  /** Distinto de `closed`: una evaluacion abierta pero movida a otra ventana tambien se bloquea. */
  disabled?: boolean
  collapsed: Set<string>
  onToggleDomain(id: string): void
  onMark(subjectId: string, criterionId: string, value: ChecklistValue): void
  onNote(subjectId: string, criterionId: string, value: string): void
  plansByKey: Map<string, ActionPlan>
  onOpenPlan(subjectId: string, criterionId: string): void
  onNavigatePlan(planId: string): void
  domainTally(domain: ChecklistDomain): DomainTally
  identityColor: string
  activeDomainId?: string | null
}) {
  const locked = closed || disabled
  const full = variant === 'fullscreen'
  const domainClass = full ? 'ckfs-domain' : 'eval-domain'
  const bodyClass = full ? 'ckfs-domain-body' : 'eval-domain-body'

  return (
    <>
      {domains.map((domain, domainIndex) => {
        const tally = domainTally(domain)
        const isCollapsed = collapsed.has(String(domain.id))
        const complete = tally.marked === tally.cells && tally.cells > 0
        return (
          <section
            key={domain.id}
            id={full ? `ckfs-dom-${domain.id}` : `dom-${domain.id}`}
            className={`${domainClass} ${isCollapsed ? 'is-collapsed' : ''} ${full && activeDomainId === String(domain.id) ? 'is-active' : ''}`}
          >
            <button
              className={full ? 'ckfs-domain-head' : 'eval-domain-head'}
              onClick={() => onToggleDomain(String(domain.id))}
              aria-expanded={!isCollapsed}
            >
              <span className={full ? 'ckfs-domain-num' : 'eval-domain-num'} style={{ background: identityColor }}>{domainIndex + 1}</span>
              <span className={full ? 'ckfs-domain-name' : 'eval-domain-name'}>{domain.name}</span>
              <span
                className={`${full ? 'ckfs-domain-state' : 'eval-domain-state'} ${complete ? 'is-done' : ''}`}
                title={complete ? 'Dominio completo' : 'Faltan marcas'}
              >
                {complete ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
                {tally.marked}/{tally.cells}
              </span>
              <span
                className={full ? 'ckfs-domain-pct' : 'eval-domain-pct'}
                style={{ color: tally.percent === null ? 'var(--muted)' : semaphoreColor(tally.percent) }}
              >
                {tally.percent === null ? 'Sin marcar' : `${tally.percent.toFixed(0)} %`}
              </span>
              {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>

            {!isCollapsed && (
              subjects.length === 1 ? (
                <div className={full ? 'ckfs-dbody' : 'dbody'}>
                  {domain.criteria.map((criterion, criterionIndex) => {
                    const subject = subjects[0]
                    const key = answerKey(subject.id, criterion.id)
                    const current = marks[key]
                    return (
                      <div className={full ? 'ckfs-crit' : 'crit'} key={criterion.id}>
                        <div className={full ? 'ckfs-cnum' : 'cnum'}>
                          {numberedItems && criterion.item_number ? criterion.item_number : `${domainIndex + 1}.${criterionIndex + 1}`}
                        </div>
                        <div className={full ? 'ckfs-ctext' : 'ctext'}>
                          <b>{criterion.text}</b>
                          {criterion.guidance ? <span>{criterion.guidance}</span> : null}
                          {plansByKey.has(key) ? (
                            <button
                              type="button" className="plan-chip"
                              title="Ver el plan de mejora de este hallazgo"
                              onClick={() => onNavigatePlan(plansByKey.get(key)!.id)}
                            >
                              <ClipboardList size={12} /> Plan · {PLAN_STATUS_LABELS[plansByKey.get(key)!.status]}
                            </button>
                          ) : current === 'NC' ? (
                            <button
                              type="button" className="plan-chip is-new"
                              title="Crear un plan de mejora para este hallazgo"
                              onClick={() => onOpenPlan(subject.id, criterion.id)}
                            >
                              <ClipboardList size={12} /> Asignar plan de mejora
                            </button>
                          ) : null}
                        </div>
                        <div className={full ? 'ckfs-segs' : 'segs'}>
                          {VALUES.map(value => (
                            <button
                              key={value} type="button" disabled={locked}
                              title={CHECKLIST_VALUE_LABELS[value]}
                              className={`${full ? 'ckfs-seg' : 'seg'} ${value} ${current === value ? 'on' : ''}`}
                              onClick={() => onMark(subject.id, criterion.id, value)}
                            >{value}</button>
                          ))}
                        </div>
                        {!full && (
                          <button
                            className="cico" type="button" disabled={locked}
                            title="Escribir una observación"
                            onClick={() => document.getElementById(`obs-${criterion.id}`)?.focus()}
                          ><MessageSquare size={15} /></button>
                        )}
                        <input
                          id={full ? undefined : `obs-${criterion.id}`}
                          className={full ? 'ckfs-obs' : 'cobs'} disabled={locked}
                          placeholder="Observación (opcional)…"
                          value={notesByAnswer[key] ?? ''}
                          onChange={event => onNote(subject.id, criterion.id, event.target.value)}
                        />
                        {!full && (
                          <button
                            className="cico" type="button" disabled={locked}
                            title="Adjuntar evidencia a este criterio"
                            onClick={() => document.querySelector<HTMLElement>('.eval-drop')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          ><Paperclip size={15} /></button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className={full ? 'ckfs-tablewrap-inner' : `checklist-fill-wrap ${bodyClass}`}>
                  <table className={full ? 'ckfs-table' : 'checklist-fill-grid has-many'}>
                    <thead>
                      <tr>
                        <th className={full ? 'ckfs-fill-criterion' : 'fill-criterion'}>Criterio</th>
                        {subjects.map((subject, index) => (
                          <th key={subject.id}><span className={full ? 'ckfs-fill-subject-head' : 'fill-subject-head'}>{index + 1}. {subject.display_name}</span></th>
                        ))}
                        <th className={full ? 'ckfs-spacer' : 'fill-spacer'} aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      {domain.criteria.map((criterion, criterionIndex) => (
                        <tr key={criterion.id}>
                          <td className={full ? 'ckfs-fill-criterion' : 'fill-criterion'}>
                            <div className={full ? 'ckfs-fill-criterion-text' : 'fill-criterion-text'}>
                              <span className={full ? 'ckfs-fill-num' : 'fill-num'}>
                                {numberedItems && criterion.item_number ? criterion.item_number : `${domainIndex + 1}.${criterionIndex + 1}`}
                              </span>
                              <span>{criterion.text}</span>
                            </div>
                            {criterion.guidance ? <p className={full ? 'ckfs-fill-guidance-text' : 'fill-guidance-text'}>{criterion.guidance}</p> : null}
                          </td>
                          {subjects.map(subject => {
                            const key = answerKey(subject.id, criterion.id)
                            const current = marks[key]
                            return (
                              <td key={subject.id} className={current ? '' : 'is-unanswered'}>
                                <div className="fill-value-group">
                                  {VALUES.map(value => (
                                    <button
                                      key={value} type="button" disabled={locked}
                                      title={CHECKLIST_VALUE_LABELS[value]}
                                      className={`${full ? 'ckfs-fill-value' : 'fill-value'} ${full ? `ckfs-fill-value--${value.toLowerCase()}` : `fill-value--${value.toLowerCase()}`} ${current === value ? 'is-active' : ''}`}
                                      onClick={() => onMark(subject.id, criterion.id, value)}
                                    >{value}</button>
                                  ))}
                                </div>
                                {plansByKey.has(key) ? (
                                  <button
                                    type="button" className="plan-chip"
                                    title="Ver el plan de mejora de este hallazgo"
                                    onClick={() => onNavigatePlan(plansByKey.get(key)!.id)}
                                  >
                                    <ClipboardList size={11} /> {PLAN_STATUS_LABELS[plansByKey.get(key)!.status]}
                                  </button>
                                ) : current === 'NC' ? (
                                  <button
                                    type="button" className="plan-chip is-new"
                                    title="Crear un plan de mejora para este hallazgo"
                                    onClick={() => onOpenPlan(subject.id, criterion.id)}
                                  >
                                    <ClipboardList size={11} /> Plan
                                  </button>
                                ) : null}
                              </td>
                            )
                          })}
                          <td className={full ? 'ckfs-spacer' : 'fill-spacer'} aria-hidden="true" />
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
    </>
  )
}
