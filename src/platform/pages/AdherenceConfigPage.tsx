import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Briefcase, CheckCircle2, Layers3, Link2, ListChecks, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react'
import { Badge, Button, Card, Field, ModuleHero, SearchBox, Select, Table, moduleIdentity } from '@/design-system'
import { adherenceService } from '@/modules/adherence/services/adherenceService'
import type { Area, Auditor, Position, Professional, ProfessionalStatus } from '@/modules/adherence/types'
import AuditorsPanel from '@/modules/adherence/pages/AuditorsPanel'

type Section = 'areas' | 'professionals' | 'positions' | 'auditors'

const sections: [Section, string][] = [
  ['areas', 'Áreas y matrices'],
  ['professionals', 'Profesionales'],
  ['positions', 'Cargos'],
  ['auditors', 'Auditores'],
]

const statusLabels: Record<ProfessionalStatus, string> = {
  ACTIVE_INDEFINITE: 'Activo - indefinido',
  ACTIVE_ADAPTATION: 'Activo - periodo de adaptación',
  WITHDRAWN: 'Retirado',
}

const identity = moduleIdentity('adherence-matrix')

interface EditorCriterion { _key: string; id?: string; text: string; weight: string }
interface EditorScope { _key: string; id?: string; name: string; criteria: EditorCriterion[] }

function makeKey() { return Math.random().toString(36).slice(2) }
function newProfessionalForm() { return { fullName: '', documentId: '', specialty: '', areaId: '', positionId: '', status: 'ACTIVE_INDEFINITE' as ProfessionalStatus } }
function newEditingProfessionalForm() { return { fullName: '', documentId: '', specialty: '', areaId: '', positionId: '', status: 'ACTIVE_INDEFINITE' as ProfessionalStatus, membershipId: '' } }

export default function AdherenceConfigPage() {
  const [section, setSection] = useState<Section>('areas')
  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [accounts, setAccounts] = useState<Auditor[]>([])
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
  const [editingProfessional, setEditingProfessional] = useState(newEditingProfessionalForm)

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  const loadAreas = () => adherenceService.areas().then(setAreas).catch(caught => fail(caught, 'No fue posible cargar las áreas'))
  const loadPositions = () => adherenceService.positions().then(setPositions).catch(caught => fail(caught, 'No fue posible cargar los cargos'))
  const loadProfessionals = () => adherenceService.professionals({ q: professionalSearch }).then(setProfessionals).catch(caught => fail(caught, 'No fue posible cargar los profesionales'))
  const loadAccounts = () => adherenceService.auditors().then(setAccounts).catch(caught => fail(caught, 'No fue posible cargar las cuentas con acceso al módulo'))

  useEffect(() => { void loadAreas(); void loadPositions(); void loadAccounts() }, [])
  useEffect(() => { void loadProfessionals() }, [professionalSearch])

  const accountLabel = (membershipId: string | null) => {
    if (!membershipId) return null
    const account = accounts.find(item => item.membership_id === membershipId)
    return account ? `${account.full_name} · ${account.email}` : 'Cuenta vinculada'
  }

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

  const addScope = () => setEditorScopes(current => [...current, { _key: makeKey(), name: '', criteria: [] }])
  const removeScope = (scopeKey: string) => setEditorScopes(current => current.filter(scope => scope._key !== scopeKey))
  const renameScope = (scopeKey: string, name: string) => setEditorScopes(current => current.map(scope => scope._key === scopeKey ? { ...scope, name } : scope))

  const saveMatrix = async () => {
    if (!selectedAreaId) return
    if (editorScopes.some(scope => !scope.name.trim())) { setError('Todos los ámbitos necesitan un nombre'); return }
    setBusy(true); setError('')
    try {
      const scopes = editorScopes.map(scope => ({ name: scope.name.trim() }))
      const criteria = editorScopes.flatMap((scope, scopeIndex) => scope.criteria.map((criterion, index) => ({
        id: criterion.id, scopeIndex, text: criterion.text.trim(), weight: Number(criterion.weight), orderIndex: index,
      })))
      const result = await adherenceService.saveMatrix(selectedAreaId, { scopes, criteria })
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
    try { await adherenceService.updateArea(area.id, { active: !area.active }); await loadAreas(); notify(area.active ? 'Área desactivada' : 'Área activada') }
    catch (caught) { fail(caught, 'No fue posible actualizar el área') }
  }

  const createPosition = async () => {
    if (!newPositionName.trim()) return
    setBusy(true); setError('')
    try { await adherenceService.createPosition(newPositionName.trim()); setNewPositionName(''); await loadPositions(); notify('Cargo creado') }
    catch (caught) { fail(caught, 'No fue posible crear el cargo') } finally { setBusy(false) }
  }

  const togglePositionActive = async (position: Position) => {
    try { await adherenceService.updatePosition(position.id, { active: !position.active }); await loadPositions(); notify(position.active ? 'Cargo desactivado' : 'Cargo activado') }
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
      membershipId: professional.membership_id || '',
    })
  }

  const saveEditProfessional = async () => {
    if (!editingProfessionalId) return
    setBusy(true); setError('')
    try {
      const { membershipId, ...rest } = editingProfessional
      await adherenceService.updateProfessional(editingProfessionalId, { ...rest, membershipId: membershipId || null })
      setEditingProfessionalId(null); await loadProfessionals(); notify('Profesional actualizado')
    } catch (caught) { fail(caught, 'No fue posible actualizar el profesional') } finally { setBusy(false) }
  }

  const completeAreas = areas.filter(area => Number(area.weight_total) === 100).length

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 matrices-page-bg">
      <ModuleHero
        badge="Matrices de adherencia"
        title="Configuración"
        subtitle="Áreas, matrices y criterios ponderados, cargos, profesionales y auditores del módulo."
        accent={identity.color}
        className="matrices-hero"
      >
        <div className="hero-stat-inline">
          <div><div className="num">{areas.length}</div><div className="lbl">Áreas</div></div>
          <div><div className="num">{completeAreas}</div><div className="lbl">Completas (100%)</div></div>
          <div><div className="num">{professionals.length}</div><div className="lbl">Profesionales</div></div>
        </div>
      </ModuleHero>

      <div className="surface-panel is-header" style={{ ['--ds-accent' as string]: identity.color }}>
        <nav className="ds-tabs" aria-label="Secciones de configuración">
          {sections.map(([key, label]) => (
            <button
              key={key}
              className={`ds-tabs-item ${section === key ? 'is-active' : ''}`}
              style={section === key ? { color: identity.color } : undefined}
              onClick={() => { setSection(key); setSelectedAreaId(null) }}
            >
              {label}
              {section === key && <motion.div layoutId="matrices-tab-indicator" className="ds-tabs-indicator" style={{ ['--tab-accent' as string]: identity.color }} />}
            </button>
          ))}
        </nav>

        {error && <div className="almera-alert mt-4"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="almera-notice mt-4"><CheckCircle2 size={17} />{notice}</div>}

        {section === 'areas' && !selectedAreaId && (
          <div className="mt-5 space-y-5">
            <div className="inline-action-bar">
              <div className="min-w-[260px] flex-1"><Field label="Nueva área"><input className="ds-input" value={newAreaName} onChange={event => setNewAreaName(event.target.value)} placeholder="Ej. Urgencias" /></Field></div>
              <Button identity={identity} onClick={() => void createArea()} disabled={busy}><Plus size={16} />Crear área</Button>
            </div>

            {areas.length > 0 ? (
              <motion.div
                className="matrix-card-grid"
                initial="hidden" animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
              >
                {areas.map(area => {
                  const validWeight = Number(area.weight_total) === 100
                  const weightPercent = Math.min(100, Number(area.weight_total) || 0)
                  return (
                    <motion.div
                      key={area.id}
                      className="matrix-card"
                      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                    >
                      <div className="matrix-card-head">
                        <h3 className="matrix-card-name">{area.name}</h3>
                        <span className="matrix-card-version">v{area.version_number ?? 1}</span>
                      </div>

                      <div className="matrix-card-stats">
                        <span className="matrix-card-stat"><Layers3 size={14} />{area.scope_count} ámbito{area.scope_count === 1 ? '' : 's'}</span>
                        <span className="matrix-card-stat"><ListChecks size={14} />{area.criteria_count} criterio{area.criteria_count === 1 ? '' : 's'}</span>
                      </div>

                      {!area.scope_count && <p className="matrix-card-empty-hint">Sin ámbitos configurados todavía — ábrela para agregar el primero.</p>}

                      <div className="weight-bar-label">
                        <span>Peso total</span>
                        <span style={{ color: validWeight ? '#059669' : '#B45309' }}>{Number(area.weight_total).toFixed(0)} / 100</span>
                      </div>
                      <div className="weight-bar"><div className={`weight-bar-fill ${validWeight ? 'weight-bar-fill--complete' : 'weight-bar-fill--incomplete'}`} style={{ width: `${weightPercent}%` }} /></div>

                      <div className="matrix-card-footer">
                        <Badge tone={area.active ? 'info' : 'neutral'}>{area.active ? 'Activa' : 'Inactiva'}</Badge>
                        <div className="flex gap-3">
                          <button className="row-action" style={{ color: identity.color }} onClick={() => void openArea(area.id)}><Pencil size={14} />Editar matriz</button>
                          <button className="row-action" style={{ color: 'var(--muted)' }} onClick={() => void toggleAreaActive(area)}>{area.active ? 'Desactivar' : 'Activar'}</button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </motion.div>
            ) : (
              <Card className="almera-empty"><Layers3 size={30} /><p>Aún no hay áreas registradas.</p></Card>
            )}
          </div>
        )}

        {section === 'areas' && selectedAreaId && (
          <Card accent={identity.color} className="mt-5 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <button className="row-action" style={{ color: identity.color }} onClick={() => setSelectedAreaId(null)}><ArrowLeft size={15} />Volver a áreas</button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--muted)]">Versión vigente: v{versionNumber}</span>
                {Math.abs(weightTotal - 100) < 0.01
                  ? <Badge tone="info">Peso total: {weightTotal.toFixed(2)} / 100</Badge>
                  : <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#B91C1C' }}><AlertTriangle size={12} />Peso total: {weightTotal.toFixed(2)} / 100</span>}
              </div>
            </div>

            <p className="mb-3 text-xs text-[var(--muted)]">Cada área puede tener sus propios ámbitos. Los criterios y sus pesos deben sumar 100 en total.</p>
            <div className="grid gap-4">
              {editorScopes.map(scope => (
                <div key={scope._key} className="scope-editor">
                  <div className="flex items-center gap-2">
                    <input className="ds-input flex-1 font-bold" value={scope.name} onChange={event => renameScope(scope._key, event.target.value)} placeholder="Nombre del ámbito" />
                    <button className="row-action" style={{ color: identity.color }} onClick={() => removeScope(scope._key)}><Trash2 size={14} />Quitar ámbito</button>
                  </div>
                  <div className="grid gap-2">
                    {scope.criteria.length > 0 && (
                      <div className="criteria-row criteria-row-head">
                        <span>Texto del criterio</span>
                        <span>Peso % (importancia del criterio en la matriz, no la calificación)</span>
                        <span></span>
                      </div>
                    )}
                    {scope.criteria.map(criterion => (
                      <div key={criterion._key} className="criteria-row">
                        <input className="ds-input" value={criterion.text} onChange={event => updateCriterion(scope._key, criterion._key, { text: event.target.value })} placeholder="Texto del criterio" />
                        <div className="criteria-weight-input">
                          <input className="ds-input" type="number" step="0.01" min="0" value={criterion.weight} onChange={event => updateCriterion(scope._key, criterion._key, { weight: event.target.value })} placeholder="Peso" />
                          <span>%</span>
                        </div>
                        <button className="row-action" style={{ color: identity.color }} onClick={() => removeCriterion(scope._key, criterion._key)}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <button className="row-action" style={{ color: identity.color }} onClick={() => addCriterion(scope._key)}><Plus size={14} />Agregar criterio</button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" onClick={addScope}><Plus size={16} />Agregar ámbito</Button>
              <Button identity={identity} onClick={() => void saveMatrix()} disabled={busy}><Save size={16} />Guardar matriz</Button>
            </div>
          </Card>
        )}

        {section === 'professionals' && (
          <div className="mt-5 space-y-5">
            <Card accent={identity.color} className="p-5">
              <p className="ds-eyebrow">Registro</p>
              <h2 className="mt-1 text-xl font-black">Nuevo profesional</h2>
              <div className="dialog-form mt-4">
                <Field label="Nombre completo"><input className="ds-input" value={professionalForm.fullName} onChange={event => setProfessionalForm({ ...professionalForm, fullName: event.target.value })} /></Field>
                <Field label="No. documento"><input className="ds-input" value={professionalForm.documentId} onChange={event => setProfessionalForm({ ...professionalForm, documentId: event.target.value })} /></Field>
                <Field label="Área"><Select value={professionalForm.areaId} onChange={value => setProfessionalForm({ ...professionalForm, areaId: value })} placeholder="Selecciona un área" options={areas.map(area => ({ value: area.id, label: area.name }))} /></Field>
                <Field label="Cargo"><Select value={professionalForm.positionId} onChange={value => setProfessionalForm({ ...professionalForm, positionId: value })} placeholder="Selecciona un cargo" options={positions.map(position => ({ value: position.id, label: position.name }))} /></Field>
                <Field label="Especialidad"><input className="ds-input" value={professionalForm.specialty} onChange={event => setProfessionalForm({ ...professionalForm, specialty: event.target.value })} /></Field>
                <Field label="Estado"><Select value={professionalForm.status} onChange={value => setProfessionalForm({ ...professionalForm, status: value as ProfessionalStatus })} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Field>
                <div className="full"><Button identity={identity} onClick={() => void createProfessional()} disabled={busy}><Plus size={16} />Registrar profesional</Button></div>
              </div>
            </Card>

            <Card accent={identity.color} className="overflow-hidden">
              <div className="table-toolbar">
                <div className="almera-panel-title"><span><Users size={19} /></span><div><h2>Profesionales</h2><p>{professionals.length} registrados</p></div></div>
                <SearchBox value={professionalSearch} onChange={setProfessionalSearch} placeholder="Buscar por nombre o documento" />
              </div>
              <Table>
                <thead><tr><th>Profesional</th><th>Área</th><th>Cargo</th><th>Estado</th><th>Cuenta vinculada</th><th></th></tr></thead>
                <tbody>
                  {professionals.map(professional => editingProfessionalId === professional.id ? (
                    <tr key={professional.id}>
                      <td colSpan={6}>
                        <div className="dialog-form">
                          <Field label="Nombre"><input className="ds-input" value={editingProfessional.fullName} onChange={event => setEditingProfessional({ ...editingProfessional, fullName: event.target.value })} /></Field>
                          <Field label="Documento"><input className="ds-input" value={editingProfessional.documentId} onChange={event => setEditingProfessional({ ...editingProfessional, documentId: event.target.value })} /></Field>
                          <Field label="Área"><Select value={editingProfessional.areaId} onChange={value => setEditingProfessional({ ...editingProfessional, areaId: value })} options={areas.map(area => ({ value: area.id, label: area.name }))} /></Field>
                          <Field label="Cargo"><Select value={editingProfessional.positionId} onChange={value => setEditingProfessional({ ...editingProfessional, positionId: value })} options={positions.map(position => ({ value: position.id, label: position.name }))} /></Field>
                          <Field label="Especialidad"><input className="ds-input" value={editingProfessional.specialty} onChange={event => setEditingProfessional({ ...editingProfessional, specialty: event.target.value })} /></Field>
                          <Field label="Estado"><Select value={editingProfessional.status} onChange={value => setEditingProfessional({ ...editingProfessional, status: value as ProfessionalStatus })} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} /></Field>
                          <Field label="Cuenta de usuario vinculada">
                            <Select
                              value={editingProfessional.membershipId || 'NONE'}
                              onChange={value => setEditingProfessional({ ...editingProfessional, membershipId: value === 'NONE' ? '' : value })}
                              options={[{ value: 'NONE', label: 'Sin vincular' }, ...accounts.map(account => ({ value: account.membership_id, label: `${account.full_name} · ${account.email}` }))]}
                            />
                          </Field>
                          <div className="full flex gap-2">
                            <Button identity={identity} onClick={() => void saveEditProfessional()} disabled={busy}>Guardar</Button>
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
                      <td><Badge tone={professional.active ? 'info' : 'neutral'}>{statusLabels[professional.status]}</Badge></td>
                      <td>{accountLabel(professional.membership_id) ? <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]"><Link2 size={12} />{accountLabel(professional.membership_id)}</span> : <span className="text-xs text-[var(--muted)]">Sin vincular</span>}</td>
                      <td><button className="row-action" style={{ color: identity.color }} onClick={() => startEditProfessional(professional)}><Pencil size={14} />Editar</button></td>
                    </tr>
                  ))}
                  {!professionals.length && <tr><td colSpan={6}><div className="almera-empty"><Users size={30} /><p>No hay profesionales registrados.</p></div></td></tr>}
                </tbody>
              </Table>
            </Card>
          </div>
        )}

        {section === 'positions' && (
          <div className="mt-5 space-y-5">
            <Card accent={identity.color} className="p-5">
              <p className="ds-eyebrow">Registro</p>
              <h2 className="mt-1 text-xl font-black">Nuevo cargo</h2>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] flex-1"><Field label="Nombre del cargo"><input className="ds-input" value={newPositionName} onChange={event => setNewPositionName(event.target.value)} placeholder="Ej. Médico General" /></Field></div>
                <Button identity={identity} onClick={() => void createPosition()} disabled={busy}><Plus size={16} />Crear cargo</Button>
              </div>
            </Card>

            <Card accent={identity.color} className="overflow-hidden">
              <div className="table-toolbar">
                <div className="almera-panel-title"><span><Briefcase size={19} /></span><div><h2>Cargos</h2><p>{positions.length} cargos registrados</p></div></div>
              </div>
              <Table>
                <thead><tr><th>Cargo</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {positions.map(position => (
                    <tr key={position.id}>
                      <td><strong>{position.name}</strong></td>
                      <td><Badge tone={position.active ? 'info' : 'neutral'}>{position.active ? 'Activo' : 'Inactivo'}</Badge></td>
                      <td><button className="row-action" style={{ color: identity.color }} onClick={() => void togglePositionActive(position)}>{position.active ? 'Desactivar' : 'Activar'}</button></td>
                    </tr>
                  ))}
                  {!positions.length && <tr><td colSpan={3}><div className="almera-empty"><Briefcase size={30} /><p>No hay cargos registrados.</p></div></td></tr>}
                </tbody>
              </Table>
            </Card>
          </div>
        )}

        {section === 'auditors' && <AuditorsPanel areas={areas} />}
      </div>
    </div>
  )
}
