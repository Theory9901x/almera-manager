import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, FlaskConical, GitBranch, History, Pencil, Plus,
  ShieldCheck, ShieldX, Siren, Trash2, UserRound,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Button, ConfirmDialog, EmptyState, Tabs, ToastProvider, useToast } from '@/design-system'
import {
  CONTROL_DOCUMENTATION, CONTROL_EVIDENCE, CONTROL_FREQUENCY, CONTROL_IMPLEMENTATIONS, CONTROL_TYPES, RISK_TYPES, TREATMENTS, ZONES,
  cuatrimestreOf, impactLevel, probabilityLevel, treatmentIssues,
} from '../../../../shared/riskScoring.mjs'
import { risksService } from '../services/risksService'
import type { DefenseLine, Materialization, RiskAction, RiskCatalogs, RiskCause, RiskControl, RiskDetail } from '../types'
import { RiskForm } from '../components/RiskForm'
import { ActionDialog, CauseDialog, ControlDialog, MaterializationDialog, MaterializationManageDialog, ReviewDialog, TestDialog } from '../components/RiskDialogs'
import {
  ACTION_STATUS_LABELS, CONCLUSION_LABELS, HeatMap, LINE_LABELS, LevelPair, MAT_STATUS_LABELS, PARTY_LABELS, Progress, TEST_LABELS,
  TypeBadge, ZoneBadge, formatDate, formatDateTime, formatMoney, identity,
} from '../components/riskUi'

type TabKey = 'identificacion' | 'controles' | 'tratamiento' | 'materializacion' | 'seguimiento' | 'historial'

export default function RiskDetailPage() {
  return <ToastProvider><RiskDetailContent /></ToastProvider>
}

type Dialog =
  | { kind: 'edit' }
  | { kind: 'cause'; cause?: RiskCause }
  | { kind: 'control'; control?: RiskControl }
  | { kind: 'test'; control: RiskControl }
  | { kind: 'action'; action?: RiskAction; materialization?: Materialization }
  | { kind: 'report' }
  | { kind: 'manage'; materialization: Materialization }
  | { kind: 'review' }
  | { kind: 'delete' }
  | null

function RiskDetailContent() {
  const { riskId } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) || 'identificacion'
  const [detail, setDetail] = useState<RiskDetail | null>(null)
  const [catalogs, setCatalogs] = useState<RiskCatalogs | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [notFound, setNotFound] = useState(false)
  const permissions = session?.permissions || []
  const can = (key: string) => permissions.includes(key)

  const load = useCallback(async () => {
    if (!riskId) return
    try { setDetail(await risksService.detail(riskId)) } catch (cause) {
      setNotFound(true)
      toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el riesgo')
    }
  }, [riskId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { risksService.catalogs().then(setCatalogs).catch(() => undefined) }, [])

  const setTab = (key: string) => { const next = new URLSearchParams(params); next.set('tab', key); setParams(next, { replace: true }) }

  async function act(promise: Promise<unknown>, message: string) {
    await promise
    toast.push('success', message)
    setDialog(null)
    await load()
  }

  if (notFound) return <EmptyState icon={AlertTriangle} title="Riesgo no encontrado" action={<Button variant="secondary" onClick={() => navigate('/app/riesgos?tab=matriz')}>Volver a la matriz</Button>} />
  if (!detail) return <div className="rsk-loading">Cargando riesgo…</div>

  const { risk, causes, controls, actions, materializations, reviews, activity } = detail
  const a = risk.assessment
  const editable = can('risks.edit')
  const openMats = materializations.filter(item => item.status !== 'CERRADA')
  const issues = treatmentIssues({ treatment: risk.treatment, riskType: risk.risk_type, residualZone: a.residual?.zone || null, actionsCount: actions.filter(item => item.kind === 'TRATAMIENTO').length })
  const allowedLines: DefenseLine[] = [
    ...(editable ? ['PRIMERA' as DefenseLine] : []),
    ...(can('risks.review') || can('risks.manage') ? ['SEGUNDA' as DefenseLine, 'TERCERA' as DefenseLine] : []),
  ]

  const tabs = [
    { key: 'identificacion', label: 'Identificación' },
    { key: 'controles', label: `Controles y valoración · ${controls.length}` },
    { key: 'tratamiento', label: `Tratamiento · ${actions.filter(item => item.kind === 'TRATAMIENTO').length}` },
    { key: 'materializacion', label: `Materialización${materializations.length ? ` · ${materializations.length}` : ''}` },
    { key: 'seguimiento', label: `Seguimiento · ${reviews.length}` },
    { key: 'historial', label: 'Historial' },
  ]

  return (
    <div className="rsk-page">
      <section className="rsk-detail-head" style={{ ['--zone' as string]: a.residual ? ZONES[a.residual.zone].color : '#94a3b8' }}>
        <div className="rsk-detail-top">
          <button type="button" className="rsk-back" onClick={() => navigate('/app/riesgos?tab=matriz')}><ArrowLeft size={16} /> Matriz</button>
          <div className="rsk-detail-actions">
            {can('risks.materialize') && risk.status === 'ACTIVO' && <Button variant="danger" onClick={() => setDialog({ kind: 'report' })}><Siren size={15} /> Reportar materialización</Button>}
            {editable && <Button variant="secondary" onClick={() => setDialog({ kind: 'edit' })}><Pencil size={15} /> Editar</Button>}
            {can('risks.manage') && <Button variant="ghost" onClick={() => setDialog({ kind: 'delete' })}><Trash2 size={15} /></Button>}
          </div>
        </div>
        <div className="rsk-detail-main">
          <div className="rsk-detail-title">
            <div className="rsk-detail-meta">
              <strong className="rsk-code is-lg">{risk.code}</strong>
              <TypeBadge type={risk.risk_type} />
              {risk.class_name && <span className="rsk-class-chip"><i style={{ background: risk.class_color || '#94a3b8' }} />{risk.class_name}</span>}
              {risk.status === 'RETIRADO' && <span className="rsk-tag">Retirado</span>}
              {openMats.length > 0 && <span className="rsk-tag is-violet"><Siren size={11} /> {openMats.length} materialización(es) abierta(s)</span>}
            </div>
            <h1>{risk.description}</h1>
            <p className="rsk-detail-sub">{risk.process_name} · {risk.map_name}{risk.owner_label && <> · <UserRound size={13} /> {risk.owner_label}</>}</p>
          </div>
          <div className="rsk-transition">
            <div><span>Inherente</span><ZoneBadge zone={a.inherent?.zone} size="lg" /><LevelPair probability={a.inherent?.probability} impact={a.inherent?.impact} /></div>
            <div className="rsk-transition-arrow"><ArrowRight size={22} /><strong>{a.reduction ? `−${Math.round(a.reduction)}%` : '0%'}</strong><small>{controls.length} control(es)</small></div>
            <div><span>Residual</span><ZoneBadge zone={a.residual?.zone} size="lg" /><LevelPair probability={a.residual?.probability} impact={a.residual?.impact} /></div>
          </div>
        </div>
      </section>

      <div className="rsk-tabs"><Tabs items={tabs} active={tab} onChange={setTab} identity={identity} /></div>

      {tab === 'identificacion' && (
        <div className="rsk-grid-detail">
          <section className="rsk-card">
            <header className="rsk-card-head"><div><h2>Identificación</h2><p>{RISK_TYPES[risk.risk_type].description}</p></div></header>
            <dl className="rsk-dl">
              <dt>Proceso</dt><dd>{risk.process_code} · {risk.process_name}</dd>
              <dt>Objetivo del proceso</dt><dd>{risk.process_objective || '—'}</dd>
              <dt>Tipología</dt><dd>{risk.typology || '—'}</dd>
              <dt>Impacto</dt><dd>{risk.impact_statement || '—'}</dd>
              <dt>Causa inmediata</dt><dd>{risk.cause_immediate || '—'}</dd>
              <dt>Causa raíz</dt><dd>{risk.cause_root || '—'}</dd>
              <dt>Consecuencias</dt><dd>{risk.consequences || '—'}</dd>
              {risk.risk_type === 'SEGURIDAD_DIGITAL' && <>
                <dt>Activo de información</dt><dd>{risk.asset || '—'}</dd>
                <dt>Amenaza / vulnerabilidad</dt><dd>{risk.threat || '—'} / {risk.vulnerability || '—'}</dd>
                <dt>Se pierde</dt><dd>{risk.cia.map(item => ({ C: 'Confidencialidad', I: 'Integridad', D: 'Disponibilidad' }[item])).join(', ') || '—'}</dd>
              </>}
              <dt>Exposición</dt><dd>{risk.exposure_per_year !== null ? `${Number(risk.exposure_per_year).toLocaleString('es-CO')} veces / año → ${probabilityLevel(risk.inherent_probability)?.name}` : 'Nivel de probabilidad elegido directamente'}</dd>
              <dt>Criterio de impacto</dt><dd>{{ '': '—', ECONOMICO: 'Económico', REPUTACIONAL: 'Reputacional', SALUD: 'Seguridad del paciente' }[risk.impact_criterion]}</dd>
              {risk.risk_type === 'CORRUPCION' && <><dt>Cuestionario de corrupción</dt><dd>{risk.corruption_answers.filter(Boolean).length} de 19 respuestas afirmativas → {impactLevel(risk.inherent_impact)?.name || '—'}</dd></>}
            </dl>
          </section>
          <section className="rsk-card">
            <header className="rsk-card-head"><div><h2>Posición en el mapa</h2><p>I = inherente · R = residual</p></div></header>
            <HeatMap markers={[
              ...(a.inherent ? [{ probability: a.inherent.probability, impact: a.inherent.impact, label: 'I', tone: 'inherent' as const }] : []),
              ...(a.residual ? [{ probability: a.residual.probability, impact: a.residual.impact, label: 'R', tone: 'residual' as const }] : []),
            ]} />
            <div className="rsk-causes">
              <div className="rsk-causes-head"><h3>Causas</h3>{editable && <button type="button" className="rsk-link" onClick={() => setDialog({ kind: 'cause' })}><Plus size={13} /> Agregar</button>}</div>
              {causes.length ? causes.map(cause => (
                <div key={cause.id} className="rsk-cause">
                  <span className={`rsk-tag ${cause.kind === 'RAIZ' ? 'is-warn' : ''}`}>{cause.kind === 'RAIZ' ? 'Raíz' : 'Inmediata'}</span>
                  <span>{cause.description}</span>
                  {editable && <span className="rsk-row-actions">
                    <button type="button" className="rsk-icon-btn is-sm" onClick={() => setDialog({ kind: 'cause', cause })} aria-label="Editar causa"><Pencil size={13} /></button>
                    <button type="button" className="rsk-icon-btn is-sm" onClick={() => act(risksService.removeCause(cause.id), 'Causa eliminada').catch(cause => toast.push('error', cause.message))} aria-label="Eliminar causa"><Trash2 size={13} /></button>
                  </span>}
                </div>
              )) : <p className="rsk-muted">Sin causas registradas.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'controles' && (
        <div className="rsk-stack">
          <section className="rsk-card">
            <header className="rsk-card-head">
              <div><h2>Valoración paso a paso</h2><p>Cada control se aplica sobre el valor ya reducido por el anterior.</p></div>
              {editable && <Button identity={identity} onClick={() => setDialog({ kind: 'control' })}><Plus size={15} /> Nuevo control</Button>}
            </header>
            {a.inherent ? (
              <div className="rsk-steps">
                <div className="rsk-step is-start">
                  <span className="rsk-step-dot" />
                  <div><strong>Riesgo inherente</strong><span>Probabilidad {probabilityLevel(a.inherent.probability)?.percent}% · Impacto {impactLevel(a.inherent.impact)?.percent}%</span></div>
                  <ZoneBadge zone={a.inherent.zone} size="sm" />
                </div>
                {a.steps.map((step, index) => {
                  const control = controls[index]
                  return (
                    <div key={step.id ?? index} className={`rsk-step ${step.excluded ? 'is-excluded' : ''}`}>
                      <span className="rsk-step-dot" />
                      <div>
                        <strong>{CONTROL_TYPES[control.control_type].name} {CONTROL_IMPLEMENTATIONS[control.implementation].name.toLowerCase()} · {step.weight}%</strong>
                        <span>{step.excluded ? `No reduce: ${step.excluded === 'NO_EFECTIVO' ? 'última prueba no efectiva' : 'control inactivo'}` : `${step.affects === 'IMPACTO' ? 'Impacto' : 'Probabilidad'} ${step.before}% → ${step.after}%`}</span>
                      </div>
                      <span className="rsk-step-text">{control.description}</span>
                    </div>
                  )
                })}
                <div className="rsk-step is-end">
                  <span className="rsk-step-dot" />
                  <div><strong>Riesgo residual</strong><span>Probabilidad {a.residual!.probabilityPercent}% ({probabilityLevel(a.residual!.probability)?.name}) · Impacto {a.residual!.impactPercent}% ({impactLevel(a.residual!.impact)?.name})</span></div>
                  <ZoneBadge zone={a.residual!.zone} size="sm" />
                </div>
              </div>
            ) : <p className="rsk-muted">El riesgo no tiene probabilidad e impacto inherentes: edítalo para valorarlo.</p>}
          </section>

          {controls.length === 0 ? (
            <section className="rsk-card"><EmptyState icon={ShieldCheck} title="Sin controles" description="Registra los controles que hoy existen para este riesgo: son los que lo reducen al nivel residual." action={editable ? <Button identity={identity} onClick={() => setDialog({ kind: 'control' })}><Plus size={15} /> Nuevo control</Button> : undefined} /></section>
          ) : (
            <div className="rsk-controls">
              {controls.map(control => {
                const cause = causes.find(item => item.id === control.cause_id)
                return (
                  <article key={control.id} className={`rsk-control ${control.active ? '' : 'is-off'} ${control.last_test_result === 'NO_EFECTIVO' ? 'is-failed' : ''}`}>
                    <header>
                      <span className={`rsk-strength is-${control.strength.key.toLowerCase()}`}>{control.weight}% · {control.strength.name}</span>
                      <span className="rsk-tag">{CONTROL_TYPES[control.control_type].name}</span>
                      <span className="rsk-tag">{CONTROL_IMPLEMENTATIONS[control.implementation].name}</span>
                      {control.last_test_result
                        ? <span className={`rsk-tag is-${control.last_test_result === 'EFECTIVO' ? 'ok' : control.last_test_result === 'PARCIAL' ? 'warn' : 'danger'}`}>{control.last_test_result === 'NO_EFECTIVO' ? <ShieldX size={11} /> : <CheckCircle2 size={11} />} {TEST_LABELS[control.last_test_result]} · {formatDate(control.last_tested_at)}</span>
                        : <span className="rsk-tag is-muted">Sin probar</span>}
                      {!control.active && <span className="rsk-tag">Inactivo</span>}
                    </header>
                    <p className="rsk-control-text">{control.description}</p>
                    <div className="rsk-control-attrs">
                      <span><b>Responsable</b>{control.responsible || '—'}</span>
                      <span><b>Causa que ataca</b>{cause ? cause.description : 'Sin asociar'}</span>
                      <span><b>Documentación</b>{CONTROL_DOCUMENTATION[control.documentation]}</span>
                      <span><b>Frecuencia</b>{CONTROL_FREQUENCY[control.frequency]}</span>
                      <span><b>Evidencia</b>{CONTROL_EVIDENCE[control.evidence]}</span>
                    </div>
                    {control.tests.length > 0 && (
                      <details className="rsk-tests">
                        <summary>Historial de pruebas ({control.tests.length})</summary>
                        {control.tests.map(test => (
                          <div key={test.id} className="rsk-test">
                            <span className={`rsk-tag is-${test.result === 'EFECTIVO' ? 'ok' : test.result === 'PARCIAL' ? 'warn' : 'danger'}`}>{TEST_LABELS[test.result]}</span>
                            <span>{formatDate(test.tested_at)} · {LINE_LABELS[test.defense_line]} · {test.tester_name || '—'}</span>
                            {test.observations && <p>{test.observations}</p>}
                          </div>
                        ))}
                      </details>
                    )}
                    <footer>
                      {(can('risks.review') || can('risks.manage')) && <button type="button" className="rsk-link" onClick={() => setDialog({ kind: 'test', control })}><FlaskConical size={13} /> Probar efectividad</button>}
                      {editable && <button type="button" className="rsk-link" onClick={() => setDialog({ kind: 'control', control })}><Pencil size={13} /> Editar</button>}
                      {editable && <button type="button" className="rsk-link is-danger" onClick={() => act(risksService.removeControl(control.id), 'Control eliminado').catch(cause => toast.push('error', cause.message))}><Trash2 size={13} /> Eliminar</button>}
                    </footer>
                  </article>
                )
              })}
            </div>
          )}

          {controls.length > 0 && causes.length > 0 && (
            <section className="rsk-card">
              <header className="rsk-card-head"><div><h2>Matriz control-causa</h2><p>Qué causa ataca cada control. Una causa sin control es un flanco abierto.</p></div></header>
              <div className="rsk-table-wrap">
                <table className="rsk-table rsk-cc">
                  <thead><tr><th className="is-wide">Control \ Causa</th>{causes.map(cause => <th key={cause.id} title={cause.description}>{cause.kind === 'RAIZ' ? 'Raíz' : 'Inmediata'}: {cause.description.slice(0, 42)}{cause.description.length > 42 ? '…' : ''}</th>)}</tr></thead>
                  <tbody>
                    {controls.map(control => (
                      <tr key={control.id} className="is-static">
                        <td className="is-wide"><span className="rsk-desc">{control.description}</span></td>
                        {causes.map(cause => <td key={cause.id} className="rsk-cc-cell">{control.cause_id === cause.id ? <CheckCircle2 size={18} /> : ''}</td>)}
                      </tr>
                    ))}
                    <tr className="is-static rsk-cc-total">
                      <td>Controles por causa</td>
                      {causes.map(cause => { const count = controls.filter(control => control.cause_id === cause.id).length; return <td key={cause.id} className={count ? '' : 'is-gap'}>{count || 'Sin control'}</td> })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'tratamiento' && (
        <div className="rsk-stack">
          <section className="rsk-card">
            <header className="rsk-card-head">
              <div><h2>Opción de tratamiento</h2><p>{risk.treatment ? TREATMENTS[risk.treatment].description : 'Aún no se ha definido cómo se tratará el riesgo.'}</p></div>
              <span className="rsk-treat is-lg">{risk.treatment ? TREATMENTS[risk.treatment].name : 'Sin definir'}</span>
            </header>
            {risk.treatment_justification && <p className="rsk-quote">{risk.treatment_justification}</p>}
            {issues.map(issue => <p key={issue} className="rsk-warning"><AlertTriangle size={15} /> {issue}</p>)}
          </section>
          <ActionsCard
            title="Plan de acción"
            description="Acciones para reducir el riesgo antes de que ocurra."
            actions={actions.filter(item => item.kind === 'TRATAMIENTO')}
            editable={editable}
            onAdd={() => setDialog({ kind: 'action' })}
            onEdit={action => setDialog({ kind: 'action', action })}
          />
        </div>
      )}

      {tab === 'materializacion' && (
        <div className="rsk-stack">
          {materializations.length === 0 ? (
            <section className="rsk-card">
              <EmptyState icon={ShieldCheck} title="Este riesgo no se ha materializado" description="Si ocurre, repórtalo: el sistema guía el análisis de causa raíz, las acciones correctivas, el reporte a quien corresponda y la revaluación del riesgo."
                action={can('risks.materialize') ? <Button variant="danger" onClick={() => setDialog({ kind: 'report' })}><Siren size={15} /> Reportar materialización</Button> : undefined} />
            </section>
          ) : materializations.map(mat => {
            const correctives = actions.filter(item => item.materialization_id === mat.id)
            // Cerrada no es un paso "en curso": el ciclo termino y los cuatro pasos quedan completos.
            const stage = mat.status === 'CERRADA' ? 4 : ['REPORTADA', 'EN_ANALISIS', 'EN_TRATAMIENTO', 'CERRADA'].indexOf(mat.status)
            return (
              <section key={mat.id} className={`rsk-card rsk-mat ${mat.status === 'CERRADA' ? 'is-closed' : ''}`}>
                <header className="rsk-card-head">
                  <div>
                    <h2><Siren size={17} /> {mat.code} · {formatDate(mat.occurred_at)}</h2>
                    <p>Reportado por {mat.reported_by_name || '—'}{mat.detected_at ? ` · detectado ${formatDate(mat.detected_at)}` : ''}</p>
                  </div>
                  {can('risks.materialize') && <Button variant="secondary" onClick={() => setDialog({ kind: 'manage', materialization: mat })}>{mat.status === 'CERRADA' ? 'Reabrir' : 'Analizar y cerrar'}</Button>}
                </header>
                <ol className="rsk-stepper">
                  {(['REPORTADA', 'EN_ANALISIS', 'EN_TRATAMIENTO', 'CERRADA'] as const).map((status, index) => (
                    <li key={status} className={index < stage ? 'is-done' : index === stage ? 'is-current' : ''}><span>{index + 1}</span>{MAT_STATUS_LABELS[status]}</li>
                  ))}
                </ol>
                <p className="rsk-mat-text">{mat.description}</p>
                <div className="rsk-mat-facts">
                  <span><b>Impacto real</b>{impactLevel(mat.actual_impact)?.name || '—'}</span>
                  <span><b>Pérdida económica</b>{formatMoney(mat.economic_loss)}</span>
                  <span><b>Personas afectadas</b>{mat.affected_people ?? '—'}</span>
                  <span><b>Revaluación</b>{mat.revalued_at ? `${probabilityLevel(mat.prev_probability)?.name || '—'}×${impactLevel(mat.prev_impact)?.name || '—'} → ${probabilityLevel(mat.new_probability)?.name}×${impactLevel(mat.new_impact)?.name}` : <em className="rsk-required">Pendiente</em>}</span>
                </div>
                <dl className="rsk-dl is-compact">
                  <dt>Consecuencias</dt><dd>{mat.consequences || '—'}</dd>
                  <dt>Corrección inmediata</dt><dd>{mat.immediate_correction || '—'}</dd>
                  <dt>Causa raíz</dt><dd>{mat.root_cause || <em className="rsk-required">Pendiente de análisis</em>}</dd>
                  <dt>Controles que fallaron</dt><dd>{mat.failed_control_ids.length ? controls.filter(control => mat.failed_control_ids.map(String).includes(String(control.id))).map(control => control.description.slice(0, 90)).join(' · ') : '—'}</dd>
                  <dt>Informado a</dt><dd>{mat.notified_parties.map(party => PARTY_LABELS[party] || party).join(', ') || '—'}</dd>
                  {mat.revaluation_note && <><dt>Justificación revaluación</dt><dd>{mat.revaluation_note}</dd></>}
                  {mat.closed_at && <><dt>Cierre</dt><dd>{formatDateTime(mat.closed_at)} · {mat.closed_by_name || '—'}{mat.closure_notes ? ` · ${mat.closure_notes}` : ''}</dd></>}
                </dl>
                <ActionsCard
                  nested
                  title="Acciones correctivas"
                  description="Eliminan la causa del evento para que no se repita."
                  actions={correctives}
                  editable={editable && mat.status !== 'CERRADA'}
                  onAdd={() => setDialog({ kind: 'action', materialization: mat })}
                  onEdit={action => setDialog({ kind: 'action', action, materialization: mat })}
                />
              </section>
            )
          })}
        </div>
      )}

      {tab === 'seguimiento' && (
        <section className="rsk-card">
          <header className="rsk-card-head">
            <div><h2>Seguimiento por líneas de defensa</h2><p>Periodo actual: {cuatrimestreOf(new Date())?.label}. Control Interno hace corte cuatrimestral.</p></div>
            {allowedLines.length > 0 && <Button identity={identity} onClick={() => setDialog({ kind: 'review' })}><Plus size={15} /> Registrar seguimiento</Button>}
          </header>
          {reviews.length ? (
            <ul className="rsk-reviews">
              {reviews.map(item => (
                <li key={item.id} className={`is-${item.conclusion.toLowerCase()}`}>
                  <div className="rsk-review-head">
                    <span className="rsk-line">{LINE_LABELS[item.defense_line]}</span>
                    <span className={`rsk-tag is-${item.conclusion === 'ADECUADO' ? 'ok' : item.conclusion === 'CRITICO' ? 'danger' : 'warn'}`}>{CONCLUSION_LABELS[item.conclusion]}</span>
                    <span className="rsk-muted">{item.period_label} · {item.author_name || '—'} · {formatDateTime(item.created_at)}</span>
                  </div>
                  <p>{item.observations}</p>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={GitBranch} title="Sin seguimientos" description="La primera línea se autoevalúa; la segunda monitorea y la tercera (Control Interno) evalúa con independencia." />}
        </section>
      )}

      {tab === 'historial' && (
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Historial</h2><p>Bitácora inmutable de cambios del riesgo.</p></div></header>
          <ol className="rsk-timeline">
            {activity.map(item => (
              <li key={item.id}>
                <span className="rsk-timeline-dot"><History size={12} /></span>
                <div><strong>{item.action.replaceAll('_', ' ').toLowerCase().replace(/^\w/, char => char.toUpperCase())}</strong><span>{item.detail}</span><small>{item.actor_name || '—'} · {formatDateTime(item.created_at)}</small></div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {dialog?.kind === 'edit' && catalogs && (
        <RiskForm catalogs={catalogs} mapId={risk.map_id} risk={risk} onClose={() => setDialog(null)}
          onSave={payload => act(risksService.update(risk.id, payload), 'Riesgo actualizado')} />
      )}
      {dialog?.kind === 'cause' && (
        <CauseDialog cause={dialog.cause} onClose={() => setDialog(null)}
          onSave={payload => act(dialog.cause ? risksService.updateCause(dialog.cause.id, payload) : risksService.addCause(risk.id, payload), 'Causa guardada')} />
      )}
      {dialog?.kind === 'control' && (
        <ControlDialog control={dialog.control} causes={causes} onClose={() => setDialog(null)}
          onSave={payload => act(dialog.control ? risksService.updateControl(dialog.control.id, payload) : risksService.addControl(risk.id, payload), 'Control guardado: el residual se recalculó')} />
      )}
      {dialog?.kind === 'test' && (
        <TestDialog control={dialog.control} onClose={() => setDialog(null)}
          onSave={payload => act(risksService.testControl(dialog.control.id, payload), 'Prueba registrada')} />
      )}
      {dialog?.kind === 'action' && (
        <ActionDialog action={dialog.action} materialization={dialog.materialization} responsibles={catalogs?.responsibles || []} onClose={() => setDialog(null)}
          onSave={payload => act(dialog.action ? risksService.updateAction(dialog.action.id, payload) : risksService.addAction(risk.id, payload), 'Acción guardada')} />
      )}
      {dialog?.kind === 'report' && (
        <MaterializationDialog risk={risk} controls={controls} onClose={() => setDialog(null)}
          onSave={async payload => { await act(risksService.reportMaterialization(risk.id, payload), 'Materialización reportada. Analiza la causa raíz y revalúa el riesgo.'); setTab('materializacion') }} />
      )}
      {dialog?.kind === 'manage' && (
        <MaterializationManageDialog materialization={dialog.materialization} risk={risk} controls={controls} onClose={() => setDialog(null)}
          onSave={payload => act(risksService.updateMaterialization(dialog.materialization.id, payload), 'Materialización actualizada')} />
      )}
      {dialog?.kind === 'review' && (
        <ReviewDialog allowedLines={allowedLines} period={cuatrimestreOf(new Date())?.label || ''} onClose={() => setDialog(null)}
          onSave={payload => act(risksService.addReview(risk.id, payload), 'Seguimiento registrado')} />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={`¿Eliminar ${risk.code}?`}
        description="El riesgo sale del mapa y del tablero. Queda en la base con su historial (borrado lógico)."
        confirmLabel="Eliminar riesgo"
        onCancel={() => setDialog(null)}
        onConfirm={async () => { await risksService.remove(risk.id); toast.push('success', 'Riesgo eliminado'); navigate('/app/riesgos?tab=matriz') }}
      />
    </div>
  )
}

function ActionsCard({ title, description, actions, editable, onAdd, onEdit, nested = false }: {
  title: string; description: string; actions: RiskAction[]; editable: boolean; onAdd(): void; onEdit(action: RiskAction): void; nested?: boolean
}) {
  const active = actions.filter(item => item.status !== 'CANCELADA')
  const progress = active.length ? Math.round(active.reduce((sum, item) => sum + item.progress, 0) / active.length) : 0
  return (
    <section className={nested ? 'rsk-nested' : 'rsk-card'}>
      <header className="rsk-card-head">
        <div><h2><ClipboardList size={16} /> {title}</h2><p>{description}{actions.length ? ` · Avance ponderado ${progress}%` : ''}</p></div>
        {editable && <Button variant={nested ? 'secondary' : 'primary'} identity={identity} onClick={onAdd}><Plus size={15} /> Nueva acción</Button>}
      </header>
      {actions.length ? (
        <div className="rsk-actions">
          {actions.map(action => (
            <button type="button" key={action.id} className={`rsk-action ${action.overdue ? 'is-overdue' : ''}`} onClick={() => editable && onEdit(action)} disabled={!editable}>
              <span className="rsk-action-main">
                <span className="rsk-action-top"><b>{action.code}</b><span className={`rsk-status is-${action.status.toLowerCase()}`}>{ACTION_STATUS_LABELS[action.status]}</span>{action.overdue && <span className="rsk-tag is-danger">Vencida</span>}</span>
                <span className="rsk-desc">{action.description}</span>
                <span className="rsk-sub">{action.responsible_label || 'Sin responsable'} · {formatDate(action.start_date)} → {formatDate(action.due_date)}{action.evidence ? ` · Evidencia: ${action.evidence}` : ''}</span>
              </span>
              <span className="rsk-action-progress"><Progress value={action.progress} tone={action.overdue ? 'danger' : action.status === 'TERMINADA' ? 'ok' : undefined} /><b>{action.progress}%</b></span>
            </button>
          ))}
        </div>
      ) : <p className="rsk-muted">Sin acciones registradas.</p>}
    </section>
  )
}
