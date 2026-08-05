import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, BarChart3, ClipboardCheck, ClipboardList, Download, Eye, FileText, LayoutDashboard, ListChecks, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, ModuleHero, Select, Table, ToastProvider,
  moduleIdentity, useToast,
} from '@/design-system'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
import { useAuth } from '@/platform/auth/AuthContext'
import { checklistsService } from '../services/checklistsService'
import { DashboardPanel } from '../components/DashboardPanel'
import { DataCenterPanel } from '../components/DataCenterPanel'
import { RepositoryPanel } from '../components/RepositoryPanel'
import { StartAuditDialog, type StartContext } from '../components/StartAuditDialog'
import type { AssignedTemplate, AuditSummary, ChecklistArea, ChecklistProgram, ChecklistTemplate, SeedTemplate } from '../types'

const identity = moduleIdentity('checklists')

const STATUS_TONE: Record<string, 'info' | 'neutral' | 'warning'> = {
  PUBLICADA: 'info', BORRADOR: 'neutral', ARCHIVADA: 'warning',
}
const STATUS_LABEL: Record<string, string> = {
  PUBLICADA: 'Publicada', BORRADOR: 'Borrador', ARCHIVADA: 'Archivada',
}
const CONCEPT_LABEL: Record<string, string> = {
  OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente',
}

export default function ChecklistsListPage() {
  return <ToastProvider><ChecklistsListContent /></ToastProvider>
}

function ChecklistsListContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const canManage = Boolean(session?.permissions.includes('checklists.manage'))
  const canFill = Boolean(session?.permissions.includes('checklists.fill'))

  const [section, setSection] = useState<'auditorias' | 'dashboard' | 'repositorio' | 'analitica' | 'listas'>('auditorias')
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [areas, setAreas] = useState<ChecklistArea[]>([])
  const [audits, setAudits] = useState<AuditSummary[]>([])
  const [assigned, setAssigned] = useState<AssignedTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', code: '', version: '01' })
  const [newAudit, setNewAudit] = useState({ templateId: '', auditDate: new Date().toISOString().slice(0, 10) })
  const [seeds, setSeeds] = useState<SeedTemplate[]>([])
  const [programs, setPrograms] = useState<ChecklistProgram[]>([])
  // Programa seleccionado en la pestaña de listas. '' = ver todos.
  const [program, setProgram] = useState('')
  // Seleccion para el borrado multiple, y lo que se esta a punto de borrar. `pendingDelete` en
  // null significa que no hay confirmacion abierta: no se borra nada sin pasar por ahi.
  const [selected, setSelected] = useState<string[]>([])
  const [pendingDelete, setPendingDelete] = useState<AuditSummary[] | null>(null)
  // Lista para la que se esta pidiendo el contexto de la ronda. Null = dialogo cerrado.
  const [starting, setStarting] = useState<{ id: string; name: string } | null>(null)

  async function load() {
    try {
      const [auditList, assignedList] = await Promise.all([
        checklistsService.audits(),
        checklistsService.assignedToMe(),
      ])
      setAudits(auditList)
      setAssigned(assignedList)
      // Plantillas y areas se cargan siempre, no solo para quien administra: los filtros de la
      // pestaña de analitica las necesitan y esa pestaña la ve cualquiera con .view.
      const [list, areaList, programList] = await Promise.all([
        checklistsService.list(), checklistsService.areas(), checklistsService.programs(),
      ])
      setTemplates(list)
      setAreas(areaList)
      setPrograms(programList)
      if (canManage) setSeeds(await checklistsService.seedAvailable().catch(() => []))
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el módulo') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function createTemplate() {
    if (!form.name.trim()) { toast.push('error', 'Escribe el nombre de la lista'); return }
    setBusy(true)
    try {
      const created = await checklistsService.create({
        name: form.name.trim(), code: form.code.trim(), version: form.version.trim() || '01',
      })
      toast.push('success', 'Lista creada')
      navigate(`/app/listas-chequeo/${created.id}/constructor`)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible crear la lista') }
    finally { setBusy(false) }
  }

  async function importSeeds() {
    setBusy(true)
    try {
      const { results } = await checklistsService.importSeeds()
      const nuevas = results.filter(row => row.status === 'importada')
      toast.push(nuevas.length ? 'success' : 'info',
        nuevas.length ? `${nuevas.length} lista${nuevas.length === 1 ? '' : 's'} cargada${nuevas.length === 1 ? '' : 's'} en borrador` : 'Ya estaban todas cargadas')
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar las listas') }
    finally { setBusy(false) }
  }

  // Un toque desde la lista abre el contexto de la ronda; la auditoria se crea al confirmarlo.
  // No se crea antes: una ronda sin fecha ni servicio no se puede ubicar despues, y quedaria
  // como basura en el listado si el auditor se arrepiente.
  async function startWithContext(context: StartContext) {
    if (!starting) return
    setBusy(true)
    try {
      const created = await checklistsService.createAudit({
        // El formato puede haberse cambiado dentro del propio dialogo.
        templateId: context.templateId || starting.id,
        auditDate: context.auditDate,
        areaId: context.areaId,
        shift: context.shift || undefined,
      })
      navigate(`/app/listas-chequeo/auditorias/${created.id}`)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible abrir la lista') }
    finally { setBusy(false) }
  }

  function toggleSelected(id: string) {
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      const ids = pendingDelete.map(audit => audit.id)
      if (ids.length === 1) await checklistsService.removeAudit(ids[0])
      else await checklistsService.removeAudits(ids)
      toast.push('success', ids.length === 1 ? 'Auditoria eliminada' : `${ids.length} auditorias eliminadas`)
      setSelected(current => current.filter(id => !ids.includes(id)))
      setPendingDelete(null)
      await load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>

  // Filtrado en el cliente a proposito: son 13 listas, no miles. Ir al servidor por cada toque
  // de pestaña seria un viaje para nada.
  const visibleTemplates = program === ''
    ? templates
    : program === 'SIN'
      ? templates.filter(item => !item.program_id)
      : templates.filter(item => item.program_id === program)

  const closed = audits.filter(audit => audit.status === 'CERRADA')
  const closedPercents = closed.map(audit => Number(audit.adherence_percent)).filter(value => !Number.isNaN(value))
  const avg = closedPercents.length ? closedPercents.reduce((sum, value) => sum + value, 0) / closedPercents.length : null

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 checklists-page-bg">
      <ModuleHero
        badge="Seguridad del paciente"
        title="Listas de Chequeo"
        subtitle="Auditorías por adherencia: construye la lista una vez y aplícala por servicio. Escala C / NC / NA en todas."
        accent={identity.color}
        className="checklists-hero"
      >
        <div className="hero-stat-inline">
          <div><div className="num">{audits.length}</div><div className="lbl">Auditorías</div></div>
          <div><div className="num">{closed.length}</div><div className="lbl">Cerradas</div></div>
          <div>
            <div className="num" style={{ color: avg === null ? undefined : semaphoreColor(avg) }}>{avg === null ? '—' : `${avg.toFixed(0)}%`}</div>
            <div className="lbl">Adherencia media</div>
          </div>
        </div>
      </ModuleHero>

      <StartAuditDialog
        open={starting !== null}
        templateName={starting?.name || ''}
        templateId={starting?.id}
        templates={visibleTemplates.map(item => ({ id: item.id, name: item.name, code: item.code }))}
        areas={areas}
        busy={busy}
        onCancel={() => setStarting(null)}
        onStart={context => void startWithContext(context)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title={pendingDelete && pendingDelete.length > 1
          ? `¿Eliminar ${pendingDelete.length} auditorías?`
          : '¿Eliminar esta auditoría?'}
        confirmLabel={pendingDelete && pendingDelete.length > 1 ? `Sí, eliminar ${pendingDelete.length}` : 'Sí, eliminar'}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        description={pendingDelete && (
          <>
            <p>
              Se borran sus respuestas, sujetos y firmas. <strong>No se puede deshacer.</strong>
              {' '}Queda constancia de quién la eliminó y cuándo.
            </p>
            <ul className="ds-confirm-list">
              {pendingDelete.slice(0, 6).map(audit => (
                <li key={audit.id}>
                  <strong>{audit.template_name}</strong> · {audit.audit_date}
                  {audit.status === 'CERRADA' ? ' · cerrada' : ' · borrador'}
                  {audit.adherence_percent !== null ? ` · ${Number(audit.adherence_percent).toFixed(1)} %` : ''}
                </li>
              ))}
              {pendingDelete.length > 6 && <li>y {pendingDelete.length - 6} más…</li>}
            </ul>
          </>
        )}
      />

      <div className="surface-panel is-header" style={{ ['--ds-accent' as string]: identity.color }}>
        <nav className="ds-tabs" aria-label="Secciones de listas de chequeo">
          <button
            className={`ds-tabs-item ${section === 'auditorias' ? 'is-active' : ''}`}
            style={section === 'auditorias' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('auditorias')}
          >Auditorías</button>
          <button
            className={`ds-tabs-item ${section === 'dashboard' ? 'is-active' : ''}`}
            style={section === 'dashboard' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('dashboard')}
          ><LayoutDashboard size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Dashboard</button>
          <button
            className={`ds-tabs-item ${section === 'repositorio' ? 'is-active' : ''}`}
            style={section === 'repositorio' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('repositorio')}
          ><Archive size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Repositorio</button>
          <button
            className={`ds-tabs-item ${section === 'analitica' ? 'is-active' : ''}`}
            style={section === 'analitica' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('analitica')}
          ><BarChart3 size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Centro de datos</button>
          {/* Es una pagina propia, no una pestaña interna: el colaborador entra a ella directo
              y con enlace profundo por plan. Desde aqui solo se navega. */}
          <button
            className="ds-tabs-item"
            onClick={() => navigate('/app/listas-chequeo/planes')}
          ><ClipboardList size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Planes de mejora</button>
          {canManage && (
            <button
              className={`ds-tabs-item ${section === 'listas' ? 'is-active' : ''}`}
              style={section === 'listas' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
              onClick={() => setSection('listas')}
            >Listas institucionales</button>
          )}
        </nav>

        <div className="mt-5 space-y-5">
          {section === 'auditorias' && (
            <>
              {canFill && (
                <Card accent={identity.color} className="p-5">
                  <p className="ds-eyebrow">Ronda</p>
                  <h2 className="mt-1 text-xl font-black">Nueva auditoría</h2>
                  {assigned.length ? (
                    <div className="inline-action-bar mt-4" style={{ border: 0, boxShadow: 'none', padding: 0, background: 'transparent' }}>
                      <div className="min-w-[320px] flex-1">
                        <Field label="Lista a diligenciar">
                          <Select
                            value={newAudit.templateId || 'NONE'}
                            onChange={value => setNewAudit({ ...newAudit, templateId: value === 'NONE' ? '' : value })}
                            options={[
                              { value: 'NONE', label: 'Selecciona una lista' },
                              ...assigned.map(template => ({ value: template.id, label: `${template.code ? `${template.code} · ` : ''}${template.name}${template.status && template.status !== 'PUBLICADA' ? ' (borrador)' : ''}` })),
                            ]}
                          />
                        </Field>
                      </div>
                      <Button
                        identity={identity}
                        disabled={busy}
                        onClick={() => {
                          const chosen = assigned.find(item => item.id === newAudit.templateId)
                          if (!chosen) { toast.push('error', 'Elige la lista a diligenciar'); return }
                          setStarting({ id: chosen.id, name: chosen.name })
                        }}
                      ><Play size={15} /> Iniciar</Button>
                    </div>
                  ) : (
                    <div className="mt-4">
                      {canManage ? (
                        <EmptyState
                          icon={ClipboardCheck}
                          title={templates.length ? 'Ninguna lista está publicada todavía' : 'Aún no hay listas de chequeo'}
                          description={templates.length
                            ? 'Las listas importadas quedan en borrador para que calidad las revise. Ábrelas y publícalas, o mira cómo se diligencian sin publicarlas con «Ver como auditor».'
                            : 'Carga las listas institucionales o crea una desde cero en la pestaña «Listas institucionales».'}
                          action={<Button variant="secondary" onClick={() => setSection('listas')}><ListChecks size={15} /> Ir a las listas</Button>}
                        />
                      ) : (
                        <EmptyState
                          icon={ClipboardCheck}
                          title="No tienes listas asignadas"
                          description="Pídele al equipo de calidad que te asigne las listas que debes auditar; aparecerán aquí para iniciar la ronda."
                        />
                      )}
                    </div>
                  )}
                </Card>
              )}

              <Card accent={identity.color} className="overflow-hidden">
                <div className="table-toolbar">
                  <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                    <span><ClipboardCheck size={19} /></span>
                    <div><h2>Auditorías</h2><p>{audits.length} registradas</p></div>
                  </div>
                </div>
                {audits.length ? (
                  <div className="checklists-table">
                    {canManage && selected.length > 0 && (
                      <div className="ds-bulk-bar">
                        <span>{selected.length} seleccionada{selected.length === 1 ? '' : 's'}</span>
                        <button className="row-action" onClick={() => setSelected([])}>Quitar selección</button>
                        <span className="spacer" />
                        <Button variant="danger" onClick={() => setPendingDelete(audits.filter(a => selected.includes(a.id)))}>
                          <Trash2 size={15} /> Eliminar seleccionadas
                        </Button>
                      </div>
                    )}
                    <Table>
                      <thead>
                        <tr>
                          {canManage && (
                            <th style={{ width: 36 }}>
                              <input
                                type="checkbox" className="row-check" aria-label="Seleccionar todas"
                                checked={selected.length === audits.length && audits.length > 0}
                                onChange={event => setSelected(event.target.checked ? audits.map(a => a.id) : [])}
                              />
                            </th>
                          )}
                          <th>Lista</th><th>Área</th><th>Fecha</th><th>Turno</th><th>Sujetos</th><th>Adherencia</th><th>Concepto</th><th>Auditor</th><th>Estado</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {audits.map(audit => (
                          <tr key={audit.id} className={selected.includes(audit.id) ? 'is-selected' : ''}>
                            {canManage && (
                              <td>
                                <input
                                  type="checkbox" className="row-check" aria-label={`Seleccionar ${audit.template_name}`}
                                  checked={selected.includes(audit.id)} onChange={() => toggleSelected(audit.id)}
                                />
                              </td>
                            )}
                            <td><strong>{audit.template_name}</strong></td>
                            <td>{audit.area_name || '—'}</td>
                            {/* slice(0,10): la fecha llega como ISO con hora y pegarle T00:00:00
                                entero daba "Invalid Date" en la tabla. */}
                            <td className="tabular-col">{new Date(`${String(audit.audit_date).slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td>{audit.shift || '—'}</td>
                            <td className="tabular-col">{audit.subject_count}</td>
                            <td className="tabular-col">
                              {audit.adherence_percent === null
                                ? <span style={{ color: 'var(--muted)' }}>—</span>
                                : <strong style={{ color: semaphoreColor(Number(audit.adherence_percent)) }}>{Number(audit.adherence_percent).toFixed(1)}%</strong>}
                            </td>
                            <td>{audit.concept ? CONCEPT_LABEL[audit.concept] || audit.concept : '—'}</td>
                            <td>{audit.auditor_name}</td>
                            <td><Badge tone={audit.status === 'CERRADA' ? 'info' : 'neutral'}>{audit.status === 'CERRADA' ? 'Cerrada' : 'Borrador'}</Badge></td>
                            <td>
                              <div className="row-action-group">
                                <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} onClick={() => navigate(`/app/listas-chequeo/auditorias/${audit.id}`)}>
                                  <Pencil size={13} /> {audit.status === 'CERRADA' ? 'Ver y editar' : 'Continuar'}
                                </button>
                                {canManage && (
                                  <button className="row-action is-danger" onClick={() => setPendingDelete([audit])}>
                                    <Trash2 size={13} /> Eliminar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  <div className="p-5">
                    <EmptyState icon={ClipboardCheck} title="Aún no hay auditorías" description="Inicia la primera ronda arriba y ve registrando los criterios sujeto por sujeto." />
                  </div>
                )}
              </Card>
            </>
          )}

          {section === 'dashboard' && <DashboardPanel />}

          {section === 'repositorio' && <RepositoryPanel canManage={canManage} />}

          {section === 'analitica' && <DataCenterPanel />}

          {section === 'listas' && canManage && (
            <>
              {seeds.some(seed => !seed.imported) && (
                <Card accent={identity.color} className="p-5">
                  <p className="ds-eyebrow">Formatos institucionales</p>
                  <h2 className="mt-1 text-xl font-black">Cargar listas de seguridad del paciente</h2>
                  <p className="survey-config-hint mt-2">
                    Se cargan con sus dominios y criterios tal como vienen del formato original, en
                    <strong> borrador</strong>: revísalas y publícalas cuando estén listas.
                  </p>
                  <div className="checklist-seed-grid mt-4">
                    {seeds.map(seed => (
                      <div key={seed.code} className={`checklist-seed-row ${seed.imported ? 'is-done' : ''}`}>
                        <div className="min-w-0">
                          <strong>{seed.name}</strong>
                          <small>{seed.code} v{seed.version} · audita {seed.subjectLabel.toLowerCase()} · {seed.domains} dominios · {seed.criteria} criterios</small>
                        </div>
                        {seed.imported && <Badge tone="info">Ya cargada</Badge>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Button identity={identity} onClick={() => void importSeeds()} disabled={busy}>
                      <Download size={15} /> Cargar las pendientes
                    </Button>
                  </div>
                </Card>
              )}

              <Card accent={identity.color} className="p-5">
                <p className="ds-eyebrow">Registro</p>
                <h2 className="mt-1 text-xl font-black">Nueva lista</h2>
                <div className="inline-action-bar mt-4" style={{ border: 0, boxShadow: 'none', padding: 0, background: 'transparent' }}>
                  <div className="min-w-[280px] flex-1">
                    <Field label="Nombre de la lista">
                      <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ej. Ronda diaria de seguridad del paciente" />
                    </Field>
                  </div>
                  <div className="w-[170px]">
                    <Field label="Código" hint="Ej. GCM-SPA-FO-24">
                      <Input value={form.code} onChange={event => setForm({ ...form, code: event.target.value })} placeholder="Opcional" />
                    </Field>
                  </div>
                  <div className="w-[110px]"><Field label="Versión"><Input value={form.version} onChange={event => setForm({ ...form, version: event.target.value })} /></Field></div>
                  <Button identity={identity} onClick={() => void createTemplate()} disabled={busy}><Plus size={16} /> Crear lista</Button>
                </div>
              </Card>

              <Card accent={identity.color} className="overflow-hidden">
                <div className="table-toolbar">
                  <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                    <span><ListChecks size={19} /></span>
                    <div>
                      <h2>Listas institucionales</h2>
                      <p>{visibleTemplates.length} de {templates.length} · {program ? programs.find(p => p.id === program)?.name : 'todos los programas'}</p>
                    </div>
                  </div>
                  {canFill && (
                    <Button
                      identity={identity}
                      disabled={busy || !visibleTemplates.length}
                      onClick={() => {
                        // Se abre el contexto de la ronda con la primera lista visible ya elegida;
                        // dentro se puede cambiar. Es el camino corto que se pidio: elegir formato
                        // y empezar, sin pasar por la pestaña de auditorias.
                        const first = visibleTemplates[0]
                        setStarting({ id: first.id, name: first.name })
                      }}
                    ><Plus size={16} /> Nueva auditoría</Button>
                  )}
                </div>

                {/* Programas: agrupan las listas por proceso institucional. No es lo mismo que el
                    servicio de la ronda — una lista de Seguridad del Paciente se audita en
                    Urgencias y en Hospitalización sin dejar de ser del mismo programa. */}
                {programs.length > 0 && (
                  <div className="program-tabs">
                    <button
                      className={`program-tab ${program === '' ? 'is-active' : ''}`}
                      onClick={() => setProgram('')}
                    >
                      Todos <span>{templates.length}</span>
                    </button>
                    {programs.map(item => (
                      <button
                        key={item.id}
                        className={`program-tab ${program === item.id ? 'is-active' : ''}`}
                        onClick={() => setProgram(item.id)}
                        title={item.description || undefined}
                      >
                        {item.name} <span>{item.template_count}</span>
                      </button>
                    ))}
                    {templates.some(t => !t.program_id) && (
                      <button
                        className={`program-tab ${program === 'SIN' ? 'is-active' : ''}`}
                        onClick={() => setProgram('SIN')}
                      >
                        Sin programa <span>{templates.filter(t => !t.program_id).length}</span>
                      </button>
                    )}
                  </div>
                )}
                {visibleTemplates.length ? (
                  <div className="checklists-table">
                    <Table>
                      <thead>
                        <tr><th>Lista</th><th>Código</th><th>Programa</th><th>Audita</th><th>Dominios</th><th>Criterios</th><th>Estado</th><th></th></tr>
                      </thead>
                      <tbody>
                        {visibleTemplates.map(template => (
                          <tr key={template.id}>
                            <td>
                              <strong>{template.name}</strong>
                              {template.code ? <small className="repo-code">{template.code} v{template.version}</small> : null}
                            </td>
                            <td className="tabular-col"><span className="code-pill">{template.code || '—'}</span></td>
                            <td>
                              {template.program_name
                                ? <span className="program-pill">{template.program_name}</span>
                                : <span style={{ color: 'var(--muted)' }}>Sin programa</span>}
                            </td>
                            <td>{template.subject_label}</td>
                            <td className="tabular-col">{template.domain_count ?? 0}</td>
                            <td className="tabular-col">{template.criteria_count ?? 0}</td>
                            <td><Badge tone={STATUS_TONE[template.status] || 'neutral'}>{STATUS_LABEL[template.status] || template.status}</Badge></td>
                            <td>
                              <div className="row-action-group">
                                {canFill && (
                                  <button className="row-action is-strong" style={{ ['--row-accent' as string]: identity.color }}
                                          disabled={busy} onClick={() => setStarting({ id: template.id, name: template.name })}>
                                    <Play size={13} /> Auditar en tablet
                                  </button>
                                )}
                                <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} onClick={() => navigate(`/app/listas-chequeo/${template.id}/vista-previa`)}>
                                  <Eye size={13} /> Ver
                                </button>
                                {/* El PDF en blanco es respaldo (cotejar contra el formato impreso, o
                                    contingencia si falla una tablet), no un modo de auditoria: va
                                    apagado para que no compita con "Auditar en tablet". */}
                                <a className="row-action is-muted" title="PDF del formato en blanco — solo respaldo"
                                   href={checklistsService.formatUrl(template.id)} target="_blank" rel="noreferrer">
                                  <FileText size={13} /> PDF
                                </a>
                                <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} onClick={() => navigate(`/app/listas-chequeo/${template.id}/constructor`)}>
                                  <Pencil size={13} /> Editar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  <div className="p-5">
                    {/* Con un programa filtrado, decir "aun no hay listas" seria falso: hay 13,
                        solo que ninguna es de ese programa. */}
                    {templates.length ? (
                      <EmptyState
                        icon={ListChecks}
                        title={program === 'SIN' ? 'Todas las listas tienen programa' : 'Este programa aún no tiene listas'}
                        description={program === 'SIN'
                          ? 'No hay ninguna lista suelta sin asignar a un programa.'
                          : `Hay ${templates.length} listas en otros programas. Puedes crear una aquí, o mover una existente desde su constructor.`}
                        action={<Button variant="secondary" onClick={() => setProgram('')}>Ver todas las listas</Button>}
                      />
                    ) : (
                      <EmptyState icon={ListChecks} title="Aún no hay listas de chequeo" description="Crea la primera lista arriba: defínele sus dominios y criterios, publícala y asígnala a quien deba auditar." />
                    )}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
