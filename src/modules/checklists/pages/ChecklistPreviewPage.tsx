import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, FileText, Info, Loader2, Pencil, Play, RotateCcw } from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, ModuleHero, Table, ToastProvider,
  moduleIdentity, semaphoreColor, useToast,
} from '@/design-system'
import { checklistsService } from '../services/checklistsService'
import { CHECKLIST_VALUE_LABELS } from '../types'
import type { AdherenceResult, ChecklistTemplateDetail, ChecklistValue } from '../types'

const identity = moduleIdentity('checklists')
const VALUES: ChecklistValue[] = ['C', 'NC', 'NA']

/** Sujetos de mentira, solo para poder dibujar las columnas de la grilla. */
const SAMPLE = ['Ejemplo 1', 'Ejemplo 2', 'Ejemplo 3']

const answerKey = (subject: string, criterion: string) => `${subject}::${criterion}`

export default function ChecklistPreviewPage() {
  return <ToastProvider><ChecklistPreviewContent /></ToastProvider>
}

/**
 * Vista previa del diligenciamiento: la MISMA pantalla que ve el auditor, montada sobre la
 * estructura real de la lista, sin crear auditoria ni guardar nada.
 *
 * Existe porque hasta ahora la unica forma de ver como se audita un formato era publicarlo,
 * asignarselo a alguien y abrir una ronda de verdad — es decir, ensuciar los datos para
 * responder a "¿como se ve esto?". Y las listas importadas quedan en borrador a proposito,
 * asi que ni siquiera aparecian en el selector.
 *
 * Los porcentajes NO se calculan aqui: se piden a /simulate, que corre el mismo motor de
 * adherencia que la auditoria real. Una copia del calculo en el cliente acabaria discrepando
 * del informe, que es justo el error que ya costo caro con los colores del semaforo.
 */
function ChecklistPreviewContent() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [template, setTemplate] = useState<ChecklistTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [marks, setMarks] = useState<Record<string, ChecklistValue>>({})
  const [result, setResult] = useState<AdherenceResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!templateId) return
    checklistsService.detail(templateId)
      .then(setTemplate)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible abrir la lista'))
      .finally(() => setLoading(false))
  }, [templateId])

  const criteria = useMemo(() => (template?.domains || []).flatMap(domain => domain.criteria), [template])
  const subjects = useMemo(() => SAMPLE.map((name, index) => ({ id: `p${index}`, name })), [])

  // Cada marca se manda al motor real. Son pocas celdas y solo en la vista previa, asi que el
  // viaje extra sale gratis y a cambio el porcentaje es el mismo que dara la auditoria.
  useEffect(() => {
    if (!template) return
    const answers = Object.entries(marks).map(([key, value]) => {
      const [subject_id, criterion_id] = key.split('::')
      return { subject_id, criterion_id, value }
    })
    if (!answers.length) { setResult(null); return }
    let cancelled = false
    checklistsService.simulate(template.id, subjects.map(subject => ({ id: subject.id })), answers)
      .then(next => { if (!cancelled) setResult(next) })
      .catch(() => { if (!cancelled) setResult(null) })
    return () => { cancelled = true }
  }, [marks, template])

  // Sale de la prueba y abre una ronda de verdad sobre esta misma lista.
  async function fillNow() {
    if (!template) return
    setBusy(true)
    try {
      const created = await checklistsService.createAudit({ templateId: template.id, auditDate: new Date().toISOString().slice(0, 10) })
      navigate(`/app/listas-chequeo/auditorias/${created.id}`)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible abrir la lista') }
    finally { setBusy(false) }
  }

  function toggle(subjectId: string, criterionId: string, value: ChecklistValue) {
    const key = answerKey(subjectId, criterionId)
    setMarks(current => {
      const next = { ...current }
      if (next[key] === value) delete next[key]
      else next[key] = value
      return next
    })
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!template) return <EmptyState icon={Eye} title="Lista no encontrada" description="Puede que se haya eliminado o que no tengas acceso a ella." />

  const subjectLabel = template.subject_label || 'sujeto'
  const percent = result?.overall.percent ?? null

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <button className="row-action" style={{ color: identity.color }} onClick={() => navigate('/app/listas-chequeo')}>
        <ArrowLeft size={15} /> Volver a listas de chequeo
      </button>

      <ModuleHero
        badge={`${template.code || 'Sin código'}${template.code ? ` · v${template.version}` : ''}`}
        title={template.name}
        subtitle={`Vista previa del diligenciamiento · audita ${subjectLabel.toLowerCase()} · ${template.domains.length} dominios · ${criteria.length} criterios`}
        accent={identity.color}
        className="checklists-hero"
        actions={
          <>
            <Badge tone={template.status === 'PUBLICADA' ? 'info' : 'neutral'}>
              {template.status === 'PUBLICADA' ? 'Publicada' : template.status === 'ARCHIVADA' ? 'Archivada' : 'Borrador'}
            </Badge>
            <Button identity={identity} onClick={() => void fillNow()} disabled={busy}>
              <Play size={15} /> Auditar en tablet
            </Button>
            <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => setMarks({})}>
              <RotateCcw size={15} /> Limpiar marcas
            </Button>
            <a className="ds-button ds-button-secondary btn-on-hero-secondary"
               href={checklistsService.formatUrl(template.id)} target="_blank" rel="noreferrer">
              <FileText size={15} /> PDF de respaldo
            </a>
            <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => navigate(`/app/listas-chequeo/${template.id}/constructor`)}>
              <Pencil size={15} /> Abrir en el constructor
            </Button>
          </>
        }
      >
        <div className="hero-stat-inline">
          <div><div className="num">{template.domains.length}</div><div className="lbl">Dominios</div></div>
          <div><div className="num">{criteria.length}</div><div className="lbl">Criterios</div></div>
          <div><div className="num">{template.headerFields.length}</div><div className="lbl">Campos de cabecera</div></div>
          <div><div className="num">{template.subjectFields.length}</div><div className="lbl">Atributos del {subjectLabel.toLowerCase()}</div></div>
        </div>
      </ModuleHero>

      <div className="checklist-preview-note">
        <Info size={16} />
        <p>
          Así se ve la pantalla que abre el auditor, con el contenido real de este formato.
          <strong> Nada de lo que marques aquí se guarda</strong>: no crea auditoría ni afecta a la analítica.
          Los porcentajes sí salen del motor de adherencia real, así que coinciden con los de una ronda de verdad.
        </p>
      </div>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Datos generales</p>
        <h2 className="mt-1 text-xl font-black">Cabecera de la auditoría</h2>
        {template.headerFields.length ? (
          <div className="dialog-form mt-4">
            {template.headerFields.map(field => (
              <Field key={field.id} label={field.label}>
                <Input disabled placeholder={field.field_type === 'DATE' ? 'dd/mm/aaaa' : 'Se diligencia en la ronda'} />
              </Field>
            ))}
          </div>
        ) : (
          <p className="survey-config-hint mt-3">Este formato no pide datos de cabecera.</p>
        )}
      </Card>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Sujetos auditados</p>
        <h2 className="mt-1 text-xl font-black">Atributos de cada {subjectLabel.toLowerCase()}</h2>
        {template.subjectFields.length ? (
          <div className="checklists-table mt-4">
            <Table>
              <thead><tr><th>Campo</th><th>Tipo</th><th>Opciones</th></tr></thead>
              <tbody>
                {template.subjectFields.map(field => (
                  <tr key={field.id}>
                    <td><strong>{field.label}</strong></td>
                    <td>{field.field_type === 'SELECT' ? 'Lista de opciones' : field.field_type === 'DATE' ? 'Fecha' : field.field_type === 'NUMBER' ? 'Número' : 'Texto'}</td>
                    <td>{field.options.length ? field.options.join(' · ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <p className="survey-config-hint mt-3">De cada {subjectLabel.toLowerCase()} solo se pide el nombre.</p>
        )}
      </Card>

      {criteria.length ? (
        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Calificación</p>
          <h2 className="mt-1 text-xl font-black">Criterios por {subjectLabel.toLowerCase()}</h2>
          <p className="survey-config-hint mt-2">
            Marca <strong>C</strong> (cumple), <strong>NC</strong> (no cumple) o <strong>NA</strong> (no aplica).
            NA no penaliza: se excluye del cálculo. Toca de nuevo para deshacer la marca.
          </p>

          <div className="checklist-fill-wrap mt-4">
            <table className="checklist-fill-grid">
              <thead>
                <tr>
                  <th className="fill-criterion">Criterio</th>
                  {subjects.map((subject, index) => (
                    <th key={subject.id}><span className="fill-subject-head">{index + 1}. {subject.name}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {template.domains.map(domain => (
                  <Fragment key={domain.id}>
                    <tr className="fill-domain-row"><td colSpan={subjects.length + 1}>{domain.name}</td></tr>
                    {domain.criteria.map(criterion => (
                      <tr key={criterion.id}>
                        <td className="fill-criterion">
                          <div className="fill-criterion-text">
                            {template.numbered_items && criterion.item_number ? <span className="fill-num">{criterion.item_number}.</span> : null}
                            <span>{criterion.text}</span>
                          </div>
                          {criterion.guidance ? <p className="fill-guidance-text">{criterion.guidance}</p> : null}
                        </td>
                        {subjects.map(subject => {
                          const current = marks[answerKey(subject.id, criterion.id)]
                          return (
                            <td key={subject.id} className={current ? '' : 'is-unanswered'}>
                              <div className="fill-value-group">
                                {VALUES.map(value => (
                                  <button
                                    key={value} type="button"
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
      ) : (
        <Card accent={identity.color} className="p-5">
          <EmptyState
            icon={Eye}
            title="Esta lista todavía no tiene criterios"
            description="Ábrela en el constructor y agrégale sus dominios y criterios; aquí verás cómo queda la pantalla del auditor."
          />
        </Card>
      )}

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Resultado</p>
        <h2 className="mt-1 text-xl font-black">Adherencia de la prueba</h2>
        <div className="checklist-result-strip mt-4">
          <div className="checklist-result-main">
            <span className="num" style={{ color: semaphoreColor(percent) }}>
              {percent === null ? 'Sin dato' : `${percent.toFixed(1)}%`}
            </span>
            <span className="lbl">Adherencia general</span>
          </div>
          <div className="checklist-result-tallies">
            <div><strong>{result?.overall.c ?? 0}</strong><span>Cumple</span></div>
            <div><strong>{result?.overall.nc ?? 0}</strong><span>No cumple</span></div>
            <div><strong>{result?.overall.na ?? 0}</strong><span>No aplica</span></div>
            <div><strong>{criteria.length * subjects.length - Object.keys(marks).length}</strong><span>Sin marcar</span></div>
          </div>
        </div>
        {percent === null && Object.keys(marks).length > 0 && (
          <p className="survey-config-hint mt-3">Todo lo marcado quedó en <strong>NA</strong>: no hay nada aplicable que medir, por eso es «sin dato» y no 0 %.</p>
        )}
        {!Object.keys(marks).length && (
          <p className="survey-config-hint mt-3">Marca algunas celdas arriba para ver cómo se calcula la adherencia.</p>
        )}
      </Card>
    </div>
  )
}
