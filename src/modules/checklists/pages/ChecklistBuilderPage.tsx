import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Rocket, RotateCcw, Save, Trash2,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, Field, Input, ModuleHero, SaveStatusIndicator, Select,
  Textarea, ToastProvider, moduleIdentity, semaphoreColor, useToast,
} from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { checklistsService } from '../services/checklistsService'
import {
  CHECKLIST_VALUE_LABELS, type AdherenceResult, type ChecklistArea, type ChecklistDomain,
  type ChecklistField, type ChecklistFieldType, type ChecklistMembership,
  type ChecklistTemplateDetail, type ChecklistValue,
} from '../types'

const identity = moduleIdentity('checklists')

const FIELD_TYPE_OPTIONS: { value: ChecklistFieldType; label: string }[] = [
  { value: 'TEXT', label: 'Texto corto' },
  { value: 'LONG_TEXT', label: 'Texto largo' },
  { value: 'DATE', label: 'Fecha' },
  { value: 'NUMBER', label: 'Número' },
  { value: 'SELECT', label: 'Selección' },
]

const VALUES: ChecklistValue[] = ['C', 'NC', 'NA']

function newId(prefix: string) { return `new_${prefix}_${Math.random().toString(36).slice(2, 8)}` }

function moved<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function ChecklistBuilderPage() {
  return <ToastProvider><ChecklistBuilderContent /></ToastProvider>
}

function ChecklistBuilderContent() {
  const { templateId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const canManage = Boolean(session?.permissions.includes('checklists.manage'))

  const [template, setTemplate] = useState<ChecklistTemplateDetail | null>(null)
  const [areas, setAreas] = useState<ChecklistArea[]>([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dirty, setDirty] = useState(false)
  const [section, setSection] = useState<'criterios' | 'cabecera' | 'asignacion' | 'prueba'>('criterios')

  const [meta, setMeta] = useState({ name: '', code: '', version: '01', description: '', subjectLabel: '', numberedItems: false, areaId: '' })
  const [headerFields, setHeaderFields] = useState<ChecklistField[]>([])
  const [subjectFields, setSubjectFields] = useState<ChecklistField[]>([])
  const [domains, setDomains] = useState<ChecklistDomain[]>([])

  const metaDirty = useRef(false)

  function hydrate(detail: ChecklistTemplateDetail) {
    setTemplate(detail)
    setMeta({
      name: detail.name, code: detail.code, version: detail.version, description: detail.description,
      subjectLabel: detail.subject_label, numberedItems: detail.numbered_items, areaId: detail.area_id || '',
    })
    setHeaderFields(detail.headerFields)
    setSubjectFields(detail.subjectFields)
    setDomains(detail.domains)
    setDirty(false)
    metaDirty.current = false
  }

  async function load() {
    if (!templateId) return
    try {
      const [detail, areaList] = await Promise.all([checklistsService.detail(templateId), checklistsService.areas()])
      hydrate(detail)
      setAreas(areaList)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar la lista') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [templateId])

  // El constructor NO autoguarda (decision del sistema, igual que en Encuestas): sin este aviso,
  // cerrar la pestaña con cambios pendientes los perderia en silencio.
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

  function touch() { setDirty(true); setSaveState('idle') }
  function patchMeta(patch: Partial<typeof meta>) { setMeta(current => ({ ...current, ...patch })); metaDirty.current = true; touch() }

  async function saveAll() {
    if (!template || !dirty) return
    setSaveState('saving')
    try {
      if (metaDirty.current) {
        await checklistsService.update(template.id, {
          name: meta.name, code: meta.code, version: meta.version, description: meta.description,
          subjectLabel: meta.subjectLabel, numberedItems: meta.numberedItems, areaId: meta.areaId || null,
        })
      }
      const detail = await checklistsService.saveStructure(template.id, {
        headerFields: headerFields.map(field => ({ id: field.id, label: field.label, field_type: field.field_type, options: field.options || [], required: field.required })),
        subjectFields: subjectFields.map(field => ({ id: field.id, label: field.label, field_type: field.field_type, options: field.options || [], required: field.required })),
        domains: domains.map(domain => ({
          id: domain.id, name: domain.name,
          criteria: domain.criteria.map(criterion => ({ id: criterion.id, item_number: criterion.item_number, text: criterion.text, guidance: criterion.guidance })),
        })),
      })
      hydrate(detail)
      setSaveState('saved')
      toast.push('success', 'Cambios guardados')
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar. Tus cambios siguen aquí.')
      setSaveState('error')
    }
  }

  async function changeStatus(status: 'PUBLICADA' | 'BORRADOR') {
    if (!template) return
    if (dirty) await saveAll()
    try {
      await checklistsService.update(template.id, { status })
      await load()
      toast.push('success', status === 'PUBLICADA' ? 'Lista publicada' : 'Lista devuelta a borrador')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cambiar el estado') }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>
  if (!template) return null

  const criteriaCount = domains.reduce((sum, domain) => sum + domain.criteria.length, 0)

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <button className="row-action" style={{ color: identity.color }} onClick={() => navigate('/app/listas-chequeo')}>
        <ArrowLeft size={15} /> Volver a listas
      </button>

      <ModuleHero
        badge={template.code ? `${template.code} · v${template.version}` : 'Lista de chequeo'}
        title={meta.name || 'Lista sin nombre'}
        subtitle={`Audita: ${meta.subjectLabel || 'sujeto'} · Escala fija C / NC / NA`}
        accent={identity.color}
        className="checklists-hero"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="survey-unsaved-dot">Cambios sin guardar</span>}
            <SaveStatusIndicator state={saveState} />
            <Badge tone={template.status === 'PUBLICADA' ? 'info' : 'neutral'}>{template.status === 'PUBLICADA' ? 'Publicada' : template.status === 'ARCHIVADA' ? 'Archivada' : 'Borrador'}</Badge>
            {canManage && <Button identity={identity} onClick={() => void saveAll()} disabled={!dirty || saveState === 'saving'}><Save size={15} /> Guardar</Button>}
            {canManage && (
              <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => void changeStatus(template.status === 'PUBLICADA' ? 'BORRADOR' : 'PUBLICADA')}>
                {template.status === 'PUBLICADA' ? <><RotateCcw size={15} /> Volver a borrador</> : <><Rocket size={15} /> Publicar</>}
              </Button>
            )}
          </div>
        }
      >
        <div className="hero-stat-inline">
          <div><div className="num">{domains.length}</div><div className="lbl">Dominios</div></div>
          <div><div className="num">{criteriaCount}</div><div className="lbl">Criterios</div></div>
        </div>
      </ModuleHero>

      <div className="surface-panel is-header" style={{ ['--ds-accent' as string]: identity.color }}>
        <nav className="ds-tabs" aria-label="Secciones del constructor">
          {(canManage
            ? [['criterios', 'Dominios y criterios'], ['cabecera', 'Cabecera y sujeto'], ['asignacion', 'Asignación'], ['prueba', 'Prueba de cálculo']] as const
            : [['criterios', 'Dominios y criterios'], ['cabecera', 'Cabecera y sujeto'], ['prueba', 'Prueba de cálculo']] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`ds-tabs-item ${section === key ? 'is-active' : ''}`}
              style={section === key ? { color: identity.color, borderBottomColor: identity.color } : undefined}
              onClick={() => setSection(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-5 space-y-5">
          {section === 'criterios' && (
            <DomainsEditor domains={domains} numbered={meta.numberedItems} readOnly={!canManage} onChange={next => { setDomains(next); touch() }} />
          )}

          {section === 'cabecera' && (
            <>
              <Card accent={identity.color} className="p-5">
                <p className="ds-eyebrow">Identificación</p>
                <h2 className="mt-1 text-xl font-black">Datos de la lista</h2>
                <div className="dialog-form mt-4">
                  <Field label="Nombre"><Input value={meta.name} disabled={!canManage} onChange={event => patchMeta({ name: event.target.value })} /></Field>
                  <Field label="Área / servicio">
                    <Select
                      value={meta.areaId || 'NONE'} disabled={!canManage}
                      onChange={value => patchMeta({ areaId: value === 'NONE' ? '' : value })}
                      options={[{ value: 'NONE', label: 'Sin asignar' }, ...areas.map(area => ({ value: area.id, label: area.name }))]}
                    />
                  </Field>
                  <Field label="Código" hint="Ej. GCM-SPA-FO-24"><Input value={meta.code} disabled={!canManage} onChange={event => patchMeta({ code: event.target.value })} /></Field>
                  <Field label="Versión"><Input value={meta.version} disabled={!canManage} onChange={event => patchMeta({ version: event.target.value })} /></Field>
                  <Field label="¿Qué audita?" hint="Paciente, Colaborador, Consultorio…"><Input value={meta.subjectLabel} disabled={!canManage} onChange={event => patchMeta({ subjectLabel: event.target.value })} /></Field>
                  <Field label="Numerar criterios" hint="Algunos formatos numeran los ítems; otros no">
                    <Select
                      value={meta.numberedItems ? 'yes' : 'no'} disabled={!canManage}
                      onChange={value => patchMeta({ numberedItems: value === 'yes' })}
                      options={[{ value: 'no', label: 'Sin numerar' }, { value: 'yes', label: 'Numerados' }]}
                    />
                  </Field>
                  <div className="full"><Field label="Descripción"><Textarea rows={2} value={meta.description} disabled={!canManage} onChange={event => patchMeta({ description: event.target.value })} /></Field></div>
                </div>
              </Card>

              <FieldsEditor
                title="Campos de la cabecera"
                eyebrow="Datos generales"
                hint="Se diligencian una vez al inicio de la auditoría (fecha, responsable, personal de turno…)."
                fields={headerFields} readOnly={!canManage}
                onChange={next => { setHeaderFields(next); touch() }}
              />

              <FieldsEditor
                title={`Atributos de cada ${meta.subjectLabel.toLowerCase() || 'sujeto'}`}
                eyebrow="Sujeto auditado"
                hint="Describen a cada sujeto de la ronda (cama, documento, cargo, servicio…)."
                fields={subjectFields} readOnly={!canManage}
                onChange={next => { setSubjectFields(next); touch() }}
              />
            </>
          )}

          {section === 'asignacion' && canManage && <AssignmentPanel templateId={template.id} published={template.status === 'PUBLICADA'} />}

          {section === 'prueba' && <SimulationPanel templateId={template.id} domains={domains} dirty={dirty} />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DomainsEditor({ domains, numbered, readOnly, onChange }: {
  domains: ChecklistDomain[]
  numbered: boolean
  readOnly: boolean
  onChange(next: ChecklistDomain[]): void
}) {
  function addDomain() {
    onChange([...domains, { id: newId('dom'), template_id: '', name: `Dominio ${domains.length + 1}`, order_index: domains.length, criteria: [] }])
  }
  function patchDomain(index: number, patch: Partial<ChecklistDomain>) {
    onChange(domains.map((domain, i) => i === index ? { ...domain, ...patch } : domain))
  }
  function addCriterion(index: number) {
    const domain = domains[index]
    patchDomain(index, {
      criteria: [...domain.criteria, {
        id: newId('cri'), domain_id: domain.id, item_number: numbered ? String(domain.criteria.length + 1) : '',
        text: '', guidance: '', order_index: domain.criteria.length, active: true,
      }],
    })
  }

  if (!domains.length) {
    return (
      <Card accent={identity.color} className="p-5">
        <EmptyState icon={Plus} title="Esta lista aún no tiene dominios" description="Un dominio agrupa criterios (ej. «Identificar correctamente al paciente»). Crea el primero para empezar." />
        {!readOnly && <div className="mt-4 flex justify-center"><Button identity={identity} onClick={addDomain}><Plus size={16} /> Agregar dominio</Button></div>}
      </Card>
    )
  }

  return (
    <>
      {domains.map((domain, domainIndex) => (
        <Card key={domain.id} accent={identity.color} className="p-5">
          <div className="checklist-domain-head">
            <div className="min-w-0 flex-1">
              <p className="ds-eyebrow">Dominio {domainIndex + 1}</p>
              <Input value={domain.name} disabled={readOnly} placeholder="Nombre del dominio" onChange={event => patchDomain(domainIndex, { name: event.target.value })} />
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1">
                <button className="survey-icon-button" title="Subir" disabled={domainIndex === 0} onClick={() => onChange(moved(domains, domainIndex, domainIndex - 1))}><ChevronUp size={14} /></button>
                <button className="survey-icon-button" title="Bajar" disabled={domainIndex === domains.length - 1} onClick={() => onChange(moved(domains, domainIndex, domainIndex + 1))}><ChevronDown size={14} /></button>
                <button className="survey-icon-button is-danger" title="Eliminar dominio" onClick={() => onChange(domains.filter((_, i) => i !== domainIndex))}><Trash2 size={14} /></button>
              </div>
            )}
          </div>

          <div className="checklist-criteria mt-4">
            {domain.criteria.map((criterion, criterionIndex) => (
              <div key={criterion.id} className="checklist-criterion">
                <div className="checklist-criterion-top">
                  {numbered && (
                    <div className="w-[64px]">
                      <Input
                        value={criterion.item_number} disabled={readOnly} placeholder="N.º"
                        onChange={event => patchDomain(domainIndex, { criteria: domain.criteria.map((item, i) => i === criterionIndex ? { ...item, item_number: event.target.value } : item) })}
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Textarea
                      rows={2} value={criterion.text} disabled={readOnly} placeholder="Criterio verificable. Ej. «Paciente con manilla de identificación, datos correctos y legibles»"
                      onChange={event => patchDomain(domainIndex, { criteria: domain.criteria.map((item, i) => i === criterionIndex ? { ...item, text: event.target.value } : item) })}
                    />
                  </div>
                  {!readOnly && (
                    <div className="flex flex-col gap-1">
                      <button className="survey-icon-button" title="Subir" disabled={criterionIndex === 0} onClick={() => patchDomain(domainIndex, { criteria: moved(domain.criteria, criterionIndex, criterionIndex - 1) })}><ChevronUp size={14} /></button>
                      <button className="survey-icon-button" title="Bajar" disabled={criterionIndex === domain.criteria.length - 1} onClick={() => patchDomain(domainIndex, { criteria: moved(domain.criteria, criterionIndex, criterionIndex + 1) })}><ChevronDown size={14} /></button>
                      <button className="survey-icon-button is-danger" title="Eliminar criterio" onClick={() => patchDomain(domainIndex, { criteria: domain.criteria.filter((_, i) => i !== criterionIndex) })}><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <Textarea
                  rows={2} value={criterion.guidance} disabled={readOnly}
                  placeholder="Instructivo (opcional): cuándo marcar C, NC o NA. Este texto se le muestra al auditor mientras diligencia."
                  onChange={event => patchDomain(domainIndex, { criteria: domain.criteria.map((item, i) => i === criterionIndex ? { ...item, guidance: event.target.value } : item) })}
                />
              </div>
            ))}
            {!domain.criteria.length && <p className="survey-config-empty">Sin criterios todavía.</p>}
          </div>

          {!readOnly && (
            <div className="mt-3 flex items-center justify-between">
              <button className="survey-config-add" onClick={() => addCriterion(domainIndex)}><Plus size={13} /> Criterio</button>
              {domainIndex === domains.length - 1 && (
                <Button variant="secondary" onClick={addDomain}><Plus size={15} /> Agregar dominio</Button>
              )}
            </div>
          )}
        </Card>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------

function FieldsEditor({ title, eyebrow, hint, fields, readOnly, onChange }: {
  title: string
  eyebrow: string
  hint: string
  fields: ChecklistField[]
  readOnly: boolean
  onChange(next: ChecklistField[]): void
}) {
  function patch(index: number, patchValue: Partial<ChecklistField>) {
    onChange(fields.map((field, i) => i === index ? { ...field, ...patchValue } : field))
  }
  return (
    <Card accent={identity.color} className="p-5">
      <p className="ds-eyebrow">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black">{title}</h2>
      <p className="survey-config-hint mt-2">{hint}</p>

      <div className="checklist-fields mt-4">
        {fields.map((field, index) => (
          <div key={field.id} className="checklist-field-row">
            <div className="min-w-0 flex-1"><Field label="Etiqueta"><Input value={field.label} disabled={readOnly} onChange={event => patch(index, { label: event.target.value })} /></Field></div>
            <div className="w-[160px]">
              <Field label="Tipo">
                <Select value={field.field_type} disabled={readOnly} onChange={value => patch(index, { field_type: value as ChecklistFieldType })} options={FIELD_TYPE_OPTIONS} />
              </Field>
            </div>
            {field.field_type === 'SELECT' && (
              <div className="w-[220px]">
                <Field label="Opciones" hint="Separadas por coma">
                  <Input value={(field.options || []).join(', ')} disabled={readOnly} onChange={event => patch(index, { options: event.target.value.split(',').map(option => option.trim()).filter(Boolean) })} />
                </Field>
              </div>
            )}
            <div className="w-[130px]">
              <Field label="Obligatorio">
                <Select value={field.required ? 'yes' : 'no'} disabled={readOnly} onChange={value => patch(index, { required: value === 'yes' })} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Sí' }]} />
              </Field>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1 pb-1">
                <button className="survey-icon-button" title="Subir" disabled={index === 0} onClick={() => onChange(moved(fields, index, index - 1))}><ChevronUp size={14} /></button>
                <button className="survey-icon-button" title="Bajar" disabled={index === fields.length - 1} onClick={() => onChange(moved(fields, index, index + 1))}><ChevronDown size={14} /></button>
                <button className="survey-icon-button is-danger" title="Eliminar" onClick={() => onChange(fields.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
        {!fields.length && <p className="survey-config-empty">Sin campos configurados.</p>}
      </div>

      {!readOnly && (
        <button className="survey-config-add mt-3" onClick={() => onChange([...fields, { id: newId('fld'), label: '', field_type: 'TEXT', options: [], required: false, order_index: fields.length }])}>
          <Plus size={13} /> Campo
        </button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Asignacion: quien puede diligenciar esta lista. Guarda solo (no forma parte del buffer del
// constructor) porque es una decision administrativa independiente de la estructura.

function AssignmentPanel({ templateId, published }: { templateId: string; published: boolean }) {
  const toast = useToast()
  const [memberships, setMemberships] = useState<ChecklistMembership[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([checklistsService.memberships(), checklistsService.assignments(templateId)])
      .then(([people, assigned]) => { setMemberships(people); setSelected(new Set(assigned.map(String))) })
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar las asignaciones'))
      .finally(() => setLoading(false))
  }, [templateId])

  async function save() {
    setBusy(true)
    try {
      await checklistsService.saveAssignments(templateId, [...selected])
      toast.push('success', 'Asignaciones guardadas')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar') }
    finally { setBusy(false) }
  }

  if (loading) return <Card accent={identity.color} className="p-5"><div className="flex justify-center"><Loader2 className="animate-spin" size={20} /></div></Card>

  return (
    <Card accent={identity.color} className="p-5">
      <p className="ds-eyebrow">Quién audita</p>
      <h2 className="mt-1 text-xl font-black">Profesionales asignados</h2>
      <p className="survey-config-hint mt-2">
        Solo quienes marques aquí verán esta lista en «Nueva auditoría».
        {!published && <> La lista está en <strong>borrador</strong>: publícala para que puedan usarla.</>}
      </p>

      <div className="checklist-assign-grid mt-4">
        {memberships.map(person => {
          const checked = selected.has(String(person.id))
          return (
            <label key={person.id} className={`checklist-assign-row ${checked ? 'is-selected' : ''}`}>
              <input
                type="checkbox" checked={checked}
                onChange={() => setSelected(current => {
                  const next = new Set(current)
                  if (next.has(String(person.id))) next.delete(String(person.id))
                  else next.add(String(person.id))
                  return next
                })}
              />
              <div className="min-w-0">
                <strong>{person.full_name}</strong>
                <small>{person.role_name} · {person.email}</small>
              </div>
            </label>
          )
        })}
        {!memberships.length && <p className="survey-config-empty">No hay usuarios activos en la entidad.</p>}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button identity={identity} onClick={() => void save()} disabled={busy}><Save size={15} /> Guardar asignaciones</Button>
        <span className="survey-config-hint">{selected.size} seleccionado{selected.size === 1 ? '' : 's'}</span>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Prueba de calculo: deja verificar la adherencia con la estructura REAL de la lista antes de
// que exista el entorno de diligenciamiento. El calculo lo hace el servidor con el mismo motor
// que usara la fase 2, no una copia en el cliente.

const SUBJECT_COUNT = 3

function SimulationPanel({ templateId, domains, dirty }: { templateId: string; domains: ChecklistDomain[]; dirty: boolean }) {
  const toast = useToast()
  const [answers, setAnswers] = useState<Record<string, ChecklistValue>>({})
  const [result, setResult] = useState<AdherenceResult | null>(null)
  const [busy, setBusy] = useState(false)

  const subjects = Array.from({ length: SUBJECT_COUNT }, (_, index) => ({ id: `sim_${index + 1}` }))
  const criteria = domains.flatMap(domain => domain.criteria.map(criterion => ({ ...criterion, domainName: domain.name })))
  const savedCriteria = criteria.filter(criterion => /^\d+$/.test(criterion.id))

  async function run() {
    setBusy(true)
    try {
      const payload = Object.entries(answers).map(([key, value]) => {
        const [subjectId, criterionId] = key.split('|')
        return { subject_id: subjectId, criterion_id: criterionId, value }
      })
      setResult(await checklistsService.simulate(templateId, subjects, payload))
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible calcular') }
    finally { setBusy(false) }
  }

  if (!savedCriteria.length) {
    return (
      <Card accent={identity.color} className="p-5">
        <EmptyState
          icon={Save}
          title="Guarda la lista para probar el cálculo"
          description={dirty
            ? 'Tienes criterios sin guardar. Guarda los cambios y vuelve a esta pestaña para simular la adherencia.'
            : 'Agrega dominios y criterios, guárdalos y aquí podrás simular una auditoría y ver la adherencia resultante.'}
        />
      </Card>
    )
  }

  return (
    <>
      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Verificación</p>
        <h2 className="mt-1 text-xl font-black">Prueba de cálculo</h2>
        <p className="survey-config-hint mt-2">
          Marca algunos criterios como si estuvieras auditando {SUBJECT_COUNT} sujetos y calcula. Sirve para
          confirmar la estructura antes de publicar. <strong>NA no penaliza</strong>: se excluye del denominador.
        </p>

        <div className="checklist-sim-wrap mt-4">
          <table className="checklist-sim-grid">
            <thead>
              <tr>
                <th className="sim-criterion">Criterio</th>
                {subjects.map((subject, index) => <th key={subject.id}>Sujeto {index + 1}</th>)}
              </tr>
            </thead>
            <tbody>
              {domains.map(domain => (
                <Fragment key={domain.id}>
                  <tr className="sim-domain-row">
                    <td colSpan={SUBJECT_COUNT + 1}>{domain.name}</td>
                  </tr>
                  {domain.criteria.filter(criterion => /^\d+$/.test(criterion.id)).map(criterion => (
                    <tr key={criterion.id}>
                      <td className="sim-criterion">{criterion.item_number ? `${criterion.item_number}. ` : ''}{criterion.text}</td>
                      {subjects.map(subject => {
                        const key = `${subject.id}|${criterion.id}`
                        return (
                          <td key={subject.id}>
                            <div className="sim-value-group">
                              {VALUES.map(value => (
                                <button
                                  key={value}
                                  type="button"
                                  title={CHECKLIST_VALUE_LABELS[value]}
                                  className={`sim-value sim-value--${value.toLowerCase()} ${answers[key] === value ? 'is-active' : ''}`}
                                  onClick={() => setAnswers(current => {
                                    const next = { ...current }
                                    if (next[key] === value) delete next[key]
                                    else next[key] = value
                                    return next
                                  })}
                                >
                                  {value}
                                </button>
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

        <div className="mt-4 flex items-center gap-3">
          <Button identity={identity} onClick={() => void run()} disabled={busy}>Calcular adherencia</Button>
          <button className="survey-config-add" onClick={() => { setAnswers({}); setResult(null) }}>Limpiar</button>
        </div>
      </Card>

      {result && <SimulationResult result={result} domains={domains} />}
    </>
  )
}

function formatPercent(percent: number | null) {
  return percent === null ? 'Sin dato' : `${percent.toFixed(1)}%`
}

function SimulationResult({ result, domains }: { result: AdherenceResult; domains: ChecklistDomain[] }) {
  const domainName = (domainId: string) => domains.find(domain => String(domain.id) === String(domainId))?.name || 'Dominio'
  return (
    <Card accent={identity.color} className="p-5">
      <p className="ds-eyebrow">Resultado</p>
      <h2 className="mt-1 text-xl font-black">Adherencia calculada</h2>

      <div className="checklist-result-strip mt-4">
        <div className="checklist-result-main">
          <span className="num" style={{ color: semaphoreColor(result.overall.percent) }}>{formatPercent(result.overall.percent)}</span>
          <span className="lbl">Adherencia general</span>
        </div>
        <div className="checklist-result-tallies">
          <div><strong>{result.overall.c}</strong><span>Cumple</span></div>
          <div><strong>{result.overall.nc}</strong><span>No cumple</span></div>
          <div><strong>{result.overall.na}</strong><span>No aplica</span></div>
          <div><strong>{result.pending}</strong><span>Sin responder</span></div>
        </div>
      </div>

      {result.overall.percent === null && (
        <p className="survey-config-hint mt-3">
          Todo lo marcado quedó en <strong>NA</strong>: no hay nada aplicable que medir, por eso el resultado es
          «sin dato» y no 0 %.
        </p>
      )}
      {result.pending > 0 && (
        <p className="survey-config-hint mt-1">
          Quedan {result.pending} respuestas sin marcar. En una auditoría real esto impediría cerrarla.
        </p>
      )}

      <h3 className="mt-5 mb-2 text-sm font-bold">Por dominio</h3>
      <div className="checklist-domain-results">
        {result.byDomain.map(domain => (
          <div key={domain.domainId} className="checklist-domain-result">
            <span className="name">{domainName(domain.domainId)}</span>
            <span className="value" style={{ color: semaphoreColor(domain.percent) }}>{formatPercent(domain.percent)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
