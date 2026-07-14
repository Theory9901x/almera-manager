import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Briefcase, CheckCircle2, ClipboardList, LayoutDashboard, Layers3, Pencil, Plus, Save, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, Button, Card, Field, PageHeader, SearchBox } from '@/shared/ui'
import { adherenceService } from '../services/adherenceService'
import type { Area, Position, Professional, ProfessionalStatus } from '../types'
import EvaluationsPanel from './EvaluationsPanel'
import DashboardPanel from './DashboardPanel'
import AuditorsPanel from './AuditorsPanel'

type Tab = 'dashboard' | 'areas' | 'evaluations' | 'professionals' | 'positions' | 'auditors'

const tabs = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['areas', 'Áreas y matrices', Layers3],
  ['evaluations', 'Evaluaciones', ClipboardList],
  ['professionals', 'Profesionales', Users],
  ['positions', 'Cargos', Briefcase],
  ['auditors', 'Auditores', ShieldCheck],
] as const

const statusLabels: Record<ProfessionalStatus, string> = {
  ACTIVE_INDEFINITE: 'Activo - indefinido',
  ACTIVE_ADAPTATION: 'Activo - periodo de adaptación',
  WITHDRAWN: 'Retirado',
}

interface EditorCriterion { _key: string; id?: string; text: string; weight: string }
interface EditorScope { _key: string; id?: string; name: string; criteria: EditorCriterion[] }

function makeKey() { return Math.random().toString(36).slice(2) }
function newProfessionalForm() { return { fullName: '', documentId: '', specialty: '', areaId: '', positionId: '', status: 'ACTIVE_INDEFINITE' as ProfessionalStatus } }

export default function AdherenceMatrixPage() {
  const { session } = useAuth()
  const canManage = (session?.permissions || []).includes('adherence_matrix.manage')
  const visibleTabs = tabs.filter(([key]) => key !== 'auditors' || canManage)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [versionNumber, setVersionNumber] = useState(1)
  const [editorScopes, setEditorScopes] = useState<EditorScope[]>([])

  const [newAreaName, setNewAreaName] = useState('')
  const [newPositionName, setNewPositionName] = useState('')
  const [professionalForm, setProfessionalForm] = useState(newProfessionalForm)
  const [professionalSearch, setProfessionalSearch] = useState('')
  const [editingProfessionalId, setEditingProfessionalId] = useState<string | null>(null)
  const [editingProfessional, setEditingProfessional] = useState(newProfessionalForm)

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  const loadAreas = () => adherenceService.areas().then(setAreas).catch(caught => fail(caught, 'No fue posible cargar las áreas'))
  const loadPositions = () => adherenceService.positions().then(setPositions).catch(caught => fail(caught, 'No fue posible cargar los cargos'))
  const loadProfessionals = () => adherenceService.professionals({ q: professionalSearch }).then(setProfessionals).catch(caught => fail(caught, 'No fue posible cargar los profesionales'))

  useEffect(() => { void loadAreas(); void loadPositions() }, [])
  useEffect(() => { void loadProfessionals() }, [professionalSearch])

  const weightTotal = useMemo(
    () => editorScopes.flatMap(scope => scope.criteria).reduce((sum, criterion) => sum + (Number(criterion.weight) || 0), 0),
    [editorScopes],
  )

  const openArea = async (areaId: string) => {
    setError('')
    try {
      const matrix = await adherenceService.matrix(areaId)
      setVersionNumber(matrix.versionNumber)
      setEditorScopes(matrix.scopes.map(scope => ({
        _key: scope.id,
        id: scope.id,
        name: scope.name,
        criteria: matrix.criteria
          .filter(criterion => criterion.scope_id === scope.id)
          .map(criterion => ({ _key: criterion.id, id: criterion.id, text: criterion.text, weight: String(criterion.weight) })),
      })))
      setSelectedAreaId(areaId)
    } catch (caught) { fail(caught, 'No fue posible abrir la matriz del área') }
  }

  const addCriterion = (scopeKey: string) => setEditorScopes(current => current.map(scope => scope._key === scopeKey ? { ...scope, criteria: [...scope.criteria, { _key: makeKey(), text: '', weight: '' }] } : scope))
  const removeCriterion = (scopeKey: string, key: string) => setEditorScopes(current => current.map(scope => scope._key === scopeKey ? { ...scope, criteria: scope.criteria.filter(criterion => criterion._key !== key) } : scope))
  const updateCriterion = (scopeKey: string, key: string, patch: Partial<EditorCriterion>) => setEditorScopes(current => current.map(scope => scope._key === scopeKey ? { ...scope, criteria: scope.criteria.map(criterion => criterion._key === key ? { ...criterion, ...patch } : criterion) } : scope))

  const saveMatrix = async () => {
    if (!selectedAreaId) return
    setBusy(true); setError('')
    try {
      const criteria = editorScopes.flatMap((scope, scopeIndex) => scope.criteria.map((criterion, index) => ({
        id: criterion.id, scopeIndex, text: criterion.text.trim(), weight: Number(criterion.weight), orderIndex: index,
      })))
      const result = await adherenceService.saveMatrix(selectedAreaId, { criteria })
      setVersionNumber(result.versionNumber)
      notify('Matriz guardada correctamente')
      await loadAreas()
    } catch (caught) { fail(caught, 'No fue posible guardar la matriz') } finally { setBusy(false) }
  }

  const createArea = async () => {
    if (!newAreaName.trim()) return
    setBusy(true); setError('')
    try { await adherenceService.createArea(newAreaName.trim()); setNewAreaName(''); await loadAreas(); notify('Área creada') }
    catch (caught) { fail(caught, 'No fue posible crear el área') } finally { setBusy(false) }
  }

  const toggleAreaActive = async (area: Area) => {
    try { await adherenceService.updateArea(area.id, { active: !area.active }); await loadAreas() }
    catch (caught) { fail(caught, 'No fue posible actualizar el área') }
  }

  const createPosition = async () => {
    if (!newPositionName.trim()) return
    setBusy(true); setError('')
    try { await adherenceService.createPosition(newPositionName.trim()); setNewPositionName(''); await loadPositions(); notify('Cargo creado') }
    catch (caught) { fail(caught, 'No fue posible crear el cargo') } finally { setBusy(false) }
  }

  const togglePositionActive = async (position: Position) => {
    try { await adherenceService.updatePosition(position.id, { active: !position.active }); await loadPositions() }
    catch (caught) { fail(caught, 'No fue posible actualizar el cargo') }
  }

  const createProfessional = async () => {
    if (!professionalForm.fullName.trim() || !professionalForm.documentId.trim() || !professionalForm.areaId || !professionalForm.positionId) {
      setError('Nombre, documento, área y cargo son obligatorios'); return
    }
    setBusy(true); setError('')
    try {
      await adherenceService.createProfessional(professionalForm)
      setProfessionalForm(newProfessionalForm())
      await loadProfessionals(); notify('Profesional registrado')
    } catch (caught) { fail(caught, 'No fue posible registrar el profesional') } finally { setBusy(false) }
  }

  const startEditProfessional = (professional: Professional) => {
    setEditingProfessionalId(professional.id)
    setEditingProfessional({
      fullName: professional.full_name, documentId: professional.document_id, specialty: professional.specialty,
      areaId: professional.area_id, positionId: professional.position_id, status: professional.status,
    })
  }

  const saveEditProfessional = async () => {
    if (!editingProfessionalId) return
    setBusy(true); setError('')
    try {
      await adherenceService.updateProfessional(editingProfessionalId, editingProfessional)
      setEditingProfessionalId(null); await loadProfessionals(); notify('Profesional actualizado')
    } catch (caught) { fail(caught, 'No fue posible actualizar el profesional') } finally { setBusy(false) }
  }

  return (
    <div className="almera-shell mission-module mx-auto max-w-[1500px] space-y-5">
      <PageHeader
        eyebrow="Control operativo"
        title="Matrices de Adherencia"
        description="Administra áreas, ámbitos, criterios ponderados, cargos y profesionales para la evaluación de adherencia a historia clínica."
      />

      <nav className="almera-nav adherence-nav" aria-label="Secciones de matrices de adherencia">
        {visibleTabs.map(([key, label, Icon]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setSelectedAreaId(null) }}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="almera-notice"><CheckCircle2 size={17} />{notice}</div>}

      {tab === 'areas' && !selectedAreaId && (
        <div className="space-y-5">
          {canManage && (
            <Card className="p-5">
              <p className="eyebrow">Registro</p>
              <h2 className="mt-1 text-xl font-black">Nueva área</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1"><Field label="Nombre del área"><input value={newAreaName} onChange={event => setNewAreaName(event.target.value)} placeholder="Ej. Urgencias" /></Field></div>
                <Button onClick={() => void createArea()} disabled={busy}><Plus size={16} />Crear área</Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="table-toolbar">
              <div className="almera-panel-title"><span><Layers3 size={19} /></span><div><h2>Áreas</h2><p>{areas.length} áreas registradas</p></div></div>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[820px]">
                <thead><tr><th>Área</th><th>Versión</th><th>Ámbitos</th><th>Criterios</th><th>Peso total</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {areas.map(area => (
                    <tr key={area.id}>
                      <td><strong>{area.name}</strong></td>
                      <td>v{area.version_number ?? 1}</td>
                      <td>{area.scope_count}</td>
                      <td>{area.criteria_count}</td>
                      <td><Badge tone={Number(area.weight_total) === 100 ? 'success' : 'warning'}>{Number(area.weight_total).toFixed(0)} / 100</Badge></td>
                      <td><Badge tone={area.active ? 'success' : 'neutral'}>{area.active ? 'Activa' : 'Inactiva'}</Badge></td>
                      <td>
                        {canManage && (
                          <div className="flex justify-end gap-3">
                            <button className="row-action" onClick={() => void openArea(area.id)}><Pencil size={14} />Editar matriz</button>
                            <button className="row-action" onClick={() => void toggleAreaActive(area)}>{area.active ? 'Desactivar' : 'Activar'}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!areas.length && <tr><td colSpan={7}><div className="almera-empty"><Layers3 size={30} /><p>Aún no hay áreas registradas.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'areas' && selectedAreaId && (
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button className="row-action" onClick={() => setSelectedAreaId(null)}><ArrowLeft size={15} />Volver a áreas</button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--muted)]">Versión vigente: v{versionNumber}</span>
              <Badge tone={Math.abs(weightTotal - 100) < 0.01 ? 'success' : 'danger'}>Peso total: {weightTotal.toFixed(2)} / 100</Badge>
            </div>
          </div>

          <p className="mb-3 text-xs text-[var(--muted)]">Los ámbitos son fijos para todas las áreas. Solo se editan los criterios y sus pesos (deben sumar 100 en total).</p>
          <div className="grid gap-4">
            {editorScopes.map(scope => (
              <div key={scope._key} className="scope-editor">
                <strong>{scope.name}</strong>
                <div className="grid gap-2">
                  {scope.criteria.map(criterion => (
                    <div key={criterion._key} className="criteria-row">
                      <input value={criterion.text} onChange={event => updateCriterion(scope._key, criterion._key, { text: event.target.value })} placeholder="Texto del criterio" />
                      <input type="number" step="0.01" min="0" value={criterion.weight} onChange={event => updateCriterion(scope._key, criterion._key, { weight: event.target.value })} placeholder="Peso %" />
                      <button className="row-action" onClick={() => removeCriterion(scope._key, criterion._key)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <button className="row-action" onClick={() => addCriterion(scope._key)}><Plus size={14} />Agregar criterio</button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end">
            <Button onClick={() => void saveMatrix()} disabled={busy}><Save size={16} />Guardar matriz</Button>
          </div>
        </Card>
      )}

      {tab === 'dashboard' && <DashboardPanel areas={areas} positions={positions} professionals={professionals} />}

      {tab === 'auditors' && canManage && <AuditorsPanel areas={areas} />}

      {tab === 'evaluations' && <EvaluationsPanel areas={areas} professionals={professionals} />}

      {tab === 'professionals' && (
        <div className="space-y-5">
          {canManage && (
            <Card className="p-5">
              <p className="eyebrow">Registro</p>
              <h2 className="mt-1 text-xl font-black">Nuevo profesional</h2>
              <div className="dialog-form mt-4">
                <Field label="Nombre completo"><input value={professionalForm.fullName} onChange={event => setProfessionalForm({ ...professionalForm, fullName: event.target.value })} /></Field>
                <Field label="No. documento"><input value={professionalForm.documentId} onChange={event => setProfessionalForm({ ...professionalForm, documentId: event.target.value })} /></Field>
                <Field label="Área"><select value={professionalForm.areaId} onChange={event => setProfessionalForm({ ...professionalForm, areaId: event.target.value })}><option value="">Selecciona un área</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></Field>
                <Field label="Cargo"><select value={professionalForm.positionId} onChange={event => setProfessionalForm({ ...professionalForm, positionId: event.target.value })}><option value="">Selecciona un cargo</option>{positions.map(position => <option key={position.id} value={position.id}>{position.name}</option>)}</select></Field>
                <Field label="Especialidad"><input value={professionalForm.specialty} onChange={event => setProfessionalForm({ ...professionalForm, specialty: event.target.value })} /></Field>
                <Field label="Estado"><select value={professionalForm.status} onChange={event => setProfessionalForm({ ...professionalForm, status: event.target.value as ProfessionalStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <div className="full"><Button onClick={() => void createProfessional()} disabled={busy}><Plus size={16} />Registrar profesional</Button></div>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="table-toolbar">
              <div className="almera-panel-title"><span><Users size={19} /></span><div><h2>Profesionales</h2><p>{professionals.length} registrados</p></div></div>
              <SearchBox value={professionalSearch} onChange={setProfessionalSearch} placeholder="Buscar por nombre o documento" />
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[960px]">
                <thead><tr><th>Profesional</th><th>Área</th><th>Cargo</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {professionals.map(professional => editingProfessionalId === professional.id ? (
                    <tr key={professional.id}>
                      <td colSpan={5}>
                        <div className="dialog-form">
                          <Field label="Nombre"><input value={editingProfessional.fullName} onChange={event => setEditingProfessional({ ...editingProfessional, fullName: event.target.value })} /></Field>
                          <Field label="Documento"><input value={editingProfessional.documentId} onChange={event => setEditingProfessional({ ...editingProfessional, documentId: event.target.value })} /></Field>
                          <Field label="Área"><select value={editingProfessional.areaId} onChange={event => setEditingProfessional({ ...editingProfessional, areaId: event.target.value })}>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></Field>
                          <Field label="Cargo"><select value={editingProfessional.positionId} onChange={event => setEditingProfessional({ ...editingProfessional, positionId: event.target.value })}>{positions.map(position => <option key={position.id} value={position.id}>{position.name}</option>)}</select></Field>
                          <Field label="Especialidad"><input value={editingProfessional.specialty} onChange={event => setEditingProfessional({ ...editingProfessional, specialty: event.target.value })} /></Field>
                          <Field label="Estado"><select value={editingProfessional.status} onChange={event => setEditingProfessional({ ...editingProfessional, status: event.target.value as ProfessionalStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                          <div className="full flex gap-2">
                            <Button onClick={() => void saveEditProfessional()} disabled={busy}>Guardar</Button>
                            <Button variant="secondary" onClick={() => setEditingProfessionalId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={professional.id}>
                      <td><strong>{professional.full_name}</strong><small>{professional.document_id}</small></td>
                      <td>{professional.area_name}</td>
                      <td>{professional.position_name}</td>
                      <td><Badge tone={professional.active ? 'success' : 'neutral'}>{statusLabels[professional.status]}</Badge></td>
                      <td>{canManage && <button className="row-action" onClick={() => startEditProfessional(professional)}><Pencil size={14} />Editar</button>}</td>
                    </tr>
                  ))}
                  {!professionals.length && <tr><td colSpan={5}><div className="almera-empty"><Users size={30} /><p>No hay profesionales registrados.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'positions' && (
        <div className="space-y-5">
          {canManage && (
            <Card className="p-5">
              <p className="eyebrow">Registro</p>
              <h2 className="mt-1 text-xl font-black">Nuevo cargo</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1"><Field label="Nombre del cargo"><input value={newPositionName} onChange={event => setNewPositionName(event.target.value)} placeholder="Ej. Médico General" /></Field></div>
                <Button onClick={() => void createPosition()} disabled={busy}><Plus size={16} />Crear cargo</Button>
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="table-toolbar">
              <div className="almera-panel-title"><span><Briefcase size={19} /></span><div><h2>Cargos</h2><p>{positions.length} cargos registrados</p></div></div>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[520px]">
                <thead><tr><th>Cargo</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {positions.map(position => (
                    <tr key={position.id}>
                      <td><strong>{position.name}</strong></td>
                      <td><Badge tone={position.active ? 'success' : 'neutral'}>{position.active ? 'Activo' : 'Inactivo'}</Badge></td>
                      <td>{canManage && <button className="row-action" onClick={() => void togglePositionActive(position)}>{position.active ? 'Desactivar' : 'Activar'}</button>}</td>
                    </tr>
                  ))}
                  {!positions.length && <tr><td colSpan={3}><div className="almera-empty"><Briefcase size={30} /><p>No hay cargos registrados.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
