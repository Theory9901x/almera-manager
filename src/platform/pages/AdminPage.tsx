import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, KeyRound, Loader2, Plus, Settings, ToggleLeft, ToggleRight, UserPlus, Users, X } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/platform/api'
import { useAuth } from '@/platform/auth/AuthContext'
import type { AdminOverview, AdminUser, Position, UserModuleGrant } from '@/platform/types'
import { adherenceService } from '@/modules/adherence/services/adherenceService'
import type { Area } from '@/modules/adherence/types'
import { Badge, Button, Card, Field, PageHeader, SearchBox, Select, Table, moduleIdentity } from '@/design-system'

type Tab = 'users' | 'modules' | 'entity' | 'settings'
const tabKeys: Tab[] = ['users', 'modules', 'entity', 'settings']
const identity = moduleIdentity('admin')

export default function AdminPage() {
  const { session, refresh: refreshSession } = useAuth()
  const { section } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const routeTab = tabKeys.includes(section as Tab) ? section as Tab : 'users'
  const canUsers = Boolean(session?.permissions.some(item => ['users.view', 'users.create', 'users.edit', 'users.disable', 'users.manage'].includes(item)))
  const canModules = Boolean(session?.permissions.some(item => ['settings.edit', 'modules.manage', 'organization.manage'].includes(item)))
  const availableTabs = useMemo(() => [
    canUsers && { id: 'users' as Tab, Icon: Users, label: 'Usuarios' },
    canModules && { id: 'modules' as Tab, Icon: Settings, label: 'Modulos' },
    canModules && { id: 'entity' as Tab, Icon: KeyRound, label: 'Entidad activa' },
    canModules && { id: 'settings' as Tab, Icon: Settings, label: 'Configuracion' },
  ].filter(Boolean) as Array<{ id: Tab; Icon: typeof Users; label: string }>, [canUsers, canModules])
  const canAdmin = session?.modules.some(module => module.key === 'admin') && availableTabs.length > 0
  const tab = availableTabs.some(item => item.id === routeTab) ? routeTab : availableTabs[0]?.id

  async function load() {
    try { setError(''); setData(await api.adminOverview()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar la administracion') }
  }
  useEffect(() => { if (canAdmin) void load() }, [canAdmin])
  useEffect(() => {
    if (availableTabs[0] && (!section || !availableTabs.some(item => item.id === routeTab))) {
      navigate(`/app/administracion/${availableTabs[0].id}`, { replace: true })
    }
  }, [availableTabs, navigate, routeTab, section])
  function done(message: string) { setNotice(message); setTimeout(() => setNotice(''), 2800) }

  if (!canAdmin) return <Navigate to="/app" replace />
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Control central"
        title="Gobierno administrativo"
        description="Directorio de usuarios, modulos y entidad activa bajo una misma consola de control."
        actions={<Badge tone="info">{session?.organization.name}</Badge>}
        identity={identity}
      />
      <nav className="ds-tabs" aria-label="Secciones de administracion">
        {availableTabs.map(({ id, Icon, label }) => (
          <button
            key={id}
            onClick={() => navigate(`/app/administracion/${id}`)}
            className={`ds-tabs-item inline-flex items-center gap-2 ${tab === id ? 'is-active' : ''}`}
            style={tab === id ? { color: identity.color, borderBottomColor: identity.color } : undefined}
          >
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>
      {notice && <div className="flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-sm text-[#087A54]"><Check size={16} />{notice}</div>}
      {error && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">{error}</div>}
      {!data ? <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin" style={{ color: identity.color }} /></div> : <>
        {tab === 'users' && canUsers && <UsersPanel data={data} reload={load} done={done} />}
        {tab === 'modules' && canModules && <ModulesPanel data={data} reload={async () => { await load(); await refreshSession() }} done={done} />}
        {tab === 'entity' && canModules && <EntityPanel data={data} />}
        {tab === 'settings' && canModules && <SettingsPanel data={data} />}
      </>}
    </div>
  )
}

function UsersPanel({ data, reload, done }: PanelProps) {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('ALL')
  const [active, setActive] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const users = data.users.filter(user => {
    const matchesText = `${user.full_name} ${user.email} ${user.role_name}`.toLowerCase().includes(query.toLowerCase())
    const matchesRole = role === 'ALL' || String(user.role_id) === role
    const matchesActive = active === 'ALL' || String(user.membership_active) === active
    return matchesText && matchesRole && matchesActive
  })
  const selectedUser = users.find(user => user.membership_id === selectedId) || data.users.find(user => user.membership_id === selectedId) || null

  return (
    <div className="space-y-5">
      <Card accent={identity.color} className="overflow-hidden">
        <div className="border-b border-[var(--border-hairline)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="ds-eyebrow">Base de datos</p>
              <h2 className="mt-1 text-xl font-black">Usuarios de la entidad</h2>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="info">{users.length} usuarios</Badge>
              <Button identity={identity} onClick={() => setShowCreate(true)}><UserPlus size={16} /> Nuevo usuario</Button>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px]">
            <SearchBox value={query} onChange={setQuery} placeholder="Buscar usuario, correo o rol" />
            <Select value={role} onChange={setRole} options={[{ value: 'ALL', label: 'Todos los roles' }, ...data.roles.map(item => ({ value: String(item.id), label: item.name }))]} />
            <Select value={active} onChange={setActive} options={[{ value: 'ALL', label: 'Todos' }, { value: 'true', label: 'Activos' }, { value: 'false', label: 'Inactivos' }]} />
          </div>
        </div>
        <Table>
          <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Cargo</th><th>Estado</th><th>Ultimo acceso</th><th></th></tr></thead>
          <tbody>{users.map(user => {
            const userInitials = user.full_name.split(' ').slice(0, 2).map(part => part[0]).join('')
            return (
              <tr key={user.membership_id} className="cursor-pointer" onClick={() => setSelectedId(user.membership_id)}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 flex-none place-items-center rounded-full text-[10px] font-black text-white" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}>{userInitials}</div>
                    <strong>{user.full_name}</strong>
                  </div>
                </td>
                <td className="text-sm text-[var(--muted)]">{user.email}</td>
                <td><Badge tone={user.role_key === 'SUPERADMIN' || user.role_key === 'ADMIN' ? 'info' : 'neutral'}>{user.role_name}</Badge></td>
                <td className="text-sm text-[var(--muted)]">{user.position_name || '—'}</td>
                <td><Badge tone={user.membership_active ? 'info' : 'neutral'}>{user.membership_active ? 'Activo' : 'Inactivo'}</Badge></td>
                <td><span className="font-mono text-xs text-[var(--muted)]">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Sin registro'}</span></td>
                <td><span className="row-action" style={{ color: identity.color }}>Ver <ChevronRight size={14} /></span></td>
              </tr>
            )
          })}</tbody>
        </Table>
      </Card>

      {showCreate && <CreateUserModal data={data} close={() => setShowCreate(false)} reload={reload} done={done} />}
      {selectedUser && <UserDetailModal user={selectedUser} data={data} close={() => setSelectedId(null)} reload={reload} done={done} />}
    </div>
  )
}

function CreateUserModal({ data, close, reload, done }: { data: AdminOverview; close(): void; reload(): Promise<void>; done(message: string): void }) {
  const usuarioRole = data.roles.find(r => r.key === 'USUARIO')
  const [form, setForm] = useState({ fullName: '', email: '', password: '', roleId: usuarioRole?.id || data.roles[0]?.id || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try { await api.createUser(form); await reload(); done('Usuario creado y rol asignado'); close() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible crear el usuario') }
    finally { setSaving(false) }
  }

  return (
    <div className="almera-modal" onClick={close}>
      <div className="ds-card almera-dialog" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
        <div className="dialog-head"><div><p className="ds-eyebrow">Alta de usuario</p><h2>Nuevo usuario</h2></div><button aria-label="Cerrar" onClick={close}><X /></button></div>
        <form onSubmit={create} className="dialog-form">
          <div className="full"><Field label="Nombre completo"><input className="ds-input" required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></Field></div>
          <div className="full"><Field label="Correo"><input className="ds-input" required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field></div>
          <Field label="Contrasena inicial (min. 10 caracteres)"><input className="ds-input" required minLength={10} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Rol"><Select value={String(form.roleId)} onChange={value => setForm({ ...form, roleId: value })} options={data.roles.map(role => ({ value: String(role.id), label: role.name }))} /></Field>
          {error && <div className="full"><p className="text-sm text-[#B91C1C]">{error}</p></div>}
          <div className="dialog-actions">
            <Button variant="secondary" type="button" onClick={close}>Cancelar</Button>
            <Button identity={identity} disabled={saving}>{saving ? 'Creando...' : <><Plus size={16} /> Crear usuario</>}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserDetailModal({ user, data, close, reload, done }: { user: AdminUser; data: AdminOverview; close(): void; reload(): Promise<void>; done(message: string): void }) {
  const initials = user.full_name.split(' ').slice(0, 2).map(part => part[0]).join('')
  const [positions, setPositions] = useState<Position[]>([])
  const [positionId, setPositionId] = useState(user.position_id || '')
  const [newPositionName, setNewPositionName] = useState('')
  const [savingPosition, setSavingPosition] = useState(false)

  useEffect(() => { void api.positions().then(setPositions) }, [])
  useEffect(() => { setPositionId(user.position_id || '') }, [user.position_id])

  async function changeRole(roleId: string) {
    await api.updateUser(user.membership_id, { roleId, active: user.membership_active })
    await reload(); done('Rol actualizado')
  }
  async function toggleActive() {
    await api.updateUser(user.membership_id, { roleId: String(user.role_id), active: !user.membership_active })
    await reload(); done(user.membership_active ? 'Usuario desactivado' : 'Usuario activado')
  }
  async function saveCargo() {
    setSavingPosition(true)
    try {
      let finalId = positionId
      if (!finalId && newPositionName.trim()) {
        const created = await api.createPosition(newPositionName.trim())
        finalId = created.id
      }
      await api.updateUser(user.membership_id, { roleId: String(user.role_id), active: user.membership_active, positionId: finalId || null })
      setNewPositionName('')
      await reload(); done('Cargo actualizado')
    } finally { setSavingPosition(false) }
  }
  return (
    <div className="almera-modal detail-modal" onClick={close}>
      <div className="ds-card almera-dialog user-detail" onClick={(event: React.MouseEvent) => event.stopPropagation()}>
        <div className="dialog-head"><div><p className="ds-eyebrow">Ficha de usuario</p><h2>{user.full_name}</h2></div><button aria-label="Cerrar" onClick={close}><X /></button></div>

        <div className="detail-summary">
          <div className="grid h-11 w-11 flex-none place-items-center rounded-full text-sm font-black text-white" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}>{initials}</div>
          <span>{user.email}</span>
          <Badge tone={user.membership_active ? 'info' : 'neutral'}>{user.membership_active ? 'Activo' : 'Inactivo'}</Badge>
        </div>

        <div className="detail-block">
          <h3>Datos de la cuenta</h3>
          <dl>
            <div><dt>Rol</dt><dd>
              <Select value={String(user.role_id)} onChange={value => void changeRole(value)} options={data.roles.map(role => ({ value: String(role.id), label: role.name }))} />
            </dd></div>
            <div><dt>Ultimo acceso</dt><dd>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Sin registro'}</dd></div>
            <div><dt>Estado</dt><dd><Button variant="secondary" onClick={() => void toggleActive()}>{user.membership_active ? 'Inactivar' : 'Activar'}</Button></dd></div>
          </dl>
        </div>

        <div className="detail-block">
          <h3>Cargo</h3>
          <p className="text-xs text-[var(--muted)]">El cargo lo asigna el administrador; se muestra junto al nombre del usuario en todo el sistema.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Select
              value={positionId || 'NONE'}
              onChange={value => { setPositionId(value === 'NONE' ? '' : value); setNewPositionName('') }}
              placeholder="Sin asignar"
              options={[{ value: 'NONE', label: 'Sin asignar' }, ...positions.map(position => ({ value: position.id, label: position.name }))]}
            />
            <input className="ds-input" placeholder="O escribe un cargo nuevo" value={newPositionName} onChange={e => { setNewPositionName(e.target.value); setPositionId('') }} />
          </div>
          <Button className="mt-3" variant="secondary" disabled={savingPosition} onClick={() => void saveCargo()}>Guardar cargo</Button>
        </div>

        {user.role_key === 'USUARIO' && (
          <div className="detail-block">
            <h3>Modulos y area</h3>
            <UserModulesPanel user={user} data={data} done={done} reload={reload} />
          </div>
        )}
      </div>
    </div>
  )
}

function UserModulesPanel({ user, data, done, reload }: { user: AdminUser; data: AdminOverview; done(message: string): void; reload(): Promise<void> }) {
  const [grants, setGrants] = useState<UserModuleGrant[] | null>(null)
  const [error, setError] = useState('')
  const [areas, setAreas] = useState<Area[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [matrixForm, setMatrixForm] = useState<{ function: 'AUDITOR' | 'PROFESIONAL' | ''; areaId: string; documentId: string; positionId: string }>({ function: '', areaId: '', documentId: '', positionId: '' })

  const load = () => api.userModules(user.membership_id).then(setGrants).catch(cause => setError(cause instanceof Error ? cause.message : 'No fue posible cargar los modulos'))
  useEffect(() => { void load() }, [user.membership_id])
  useEffect(() => { void adherenceService.areas().then(setAreas); void api.positions().then(setPositions) }, [])

  if (!grants) return <div className="p-5 text-sm text-[var(--muted)]">Cargando modulos...</div>
  const grantedKeys = new Set(grants.map(item => item.module_key))
  const enabledModules = data.modules.filter(module => module.enabled)

  async function toggle(moduleKey: string) {
    setBusyKey(moduleKey); setError('')
    try {
      if (grantedKeys.has(moduleKey)) {
        await api.revokeUserModule(user.membership_id, moduleKey)
        await load(); await reload()
        done('Modulo retirado')
      } else if (moduleKey !== 'adherence-matrix') {
        await api.grantUserModule(user.membership_id, moduleKey)
        await load(); await reload()
        done('Modulo habilitado')
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible actualizar el modulo') }
    finally { setBusyKey(null) }
  }

  async function grantMatrix() {
    if (!matrixForm.function) return
    setBusyKey('adherence-matrix'); setError('')
    try {
      await api.grantUserModule(user.membership_id, 'adherence-matrix', {
        function: matrixForm.function,
        areaId: matrixForm.areaId,
        documentId: matrixForm.documentId,
        positionId: matrixForm.positionId || undefined,
      })
      setMatrixForm({ function: '', areaId: '', documentId: '', positionId: '' })
      await load(); await reload()
      done('Matrices de Adherencia habilitado')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible habilitar el modulo') }
    finally { setBusyKey(null) }
  }

  const matrixGrant = grants.find(item => item.module_key === 'adherence-matrix')

  return (
    <div className="space-y-4 p-5">
      {error && <div className="flex items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#B91C1C]"><AlertTriangle size={14} />{error}<button onClick={() => setError('')}><X size={12} /></button></div>}
      <div className="grid gap-2 md:grid-cols-2">
        {enabledModules.map(module => {
          const granted = grantedKeys.has(module.key)
          const isMatrix = module.key === 'adherence-matrix'
          return (
            <div key={module.id} className="rounded-xl border border-[var(--border-hairline)] p-3">
              <button
                type="button"
                disabled={busyKey === module.key || (isMatrix && !granted)}
                onClick={() => void toggle(module.key)}
                className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-bold">{module.name}</span>
                  {isMatrix && granted && matrixGrant?.function_key && (
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {matrixGrant.function_key === 'AUDITOR' ? 'Auditor' : 'Profesional'}
                      {matrixGrant.function_key === 'PROFESIONAL' && matrixGrant.area_name ? ` · ${matrixGrant.area_name}` : ''}
                      {matrixGrant.function_key === 'AUDITOR' && matrixGrant.auditor_areas.length > 0 ? ` · ${matrixGrant.auditor_areas.map(a => a.name).join(', ')}` : ''}
                    </span>
                  )}
                </span>
                {granted ? <ToggleRight style={{ color: identity.color }} size={26} /> : <ToggleLeft className="text-[var(--muted)]" size={26} />}
              </button>
              {isMatrix && !granted && (
                <div className="mt-3 space-y-2 border-t border-[var(--border-hairline)] pt-3">
                  <Select
                    value={matrixForm.function}
                    onChange={value => setMatrixForm({ ...matrixForm, function: value as 'AUDITOR' | 'PROFESIONAL' | '' })}
                    placeholder="Función..."
                    options={[
                      { value: 'AUDITOR', label: 'Auditor (evalúa y ve el dashboard)' },
                      { value: 'PROFESIONAL', label: 'Profesional (ve su propio plan)' },
                    ]}
                  />
                  {matrixForm.function && (
                    <>
                      <Select
                        value={matrixForm.areaId}
                        onChange={value => setMatrixForm({ ...matrixForm, areaId: value })}
                        placeholder="Area..."
                        options={areas.map(area => ({ value: area.id, label: area.name }))}
                      />
                      {matrixForm.function === 'PROFESIONAL' && (
                        <>
                          <input className="ds-input" placeholder="No. de documento" value={matrixForm.documentId} onChange={e => setMatrixForm({ ...matrixForm, documentId: e.target.value })} />
                          {!user.position_name && (
                            <Select
                              value={matrixForm.positionId}
                              onChange={value => setMatrixForm({ ...matrixForm, positionId: value })}
                              placeholder="Cargo..."
                              options={positions.map(position => ({ value: position.id, label: position.name }))}
                            />
                          )}
                        </>
                      )}
                      <Button
                        identity={identity}
                        className="w-full"
                        disabled={
                          busyKey === 'adherence-matrix' || !matrixForm.areaId ||
                          (matrixForm.function === 'PROFESIONAL' && (!matrixForm.documentId || (!user.position_name && !matrixForm.positionId)))
                        }
                        onClick={() => void grantMatrix()}
                      >
                        Habilitar
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ModulesPanel({ data, reload, done }: PanelProps) {
  return (
    <Card accent={identity.color} className="overflow-hidden">
      <div className="border-b border-[var(--border-hairline)] p-6">
        <h2 className="font-black">Catalogo operativo de modulos</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Un modulo habilitado para la entidad puede asignarse a usuarios. Deshabilitarlo lo retira para todos.</p>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {data.modules.map(module => {
          const moduleColor = moduleIdentity(module.key).color
          return (
            <article key={module.id} className="rounded-xl border p-5" style={{ borderColor: module.enabled ? `${moduleColor}40` : 'var(--border-hairline)', background: module.enabled ? `${moduleColor}0d` : 'var(--color-surface-soft)', opacity: module.enabled ? 1 : 0.75 }}>
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 flex-none place-items-center rounded-xl text-white" style={{ backgroundImage: module.enabled ? `linear-gradient(135deg, ${moduleIdentity(module.key).gradientFrom}, ${moduleIdentity(module.key).gradientTo})` : undefined, background: module.enabled ? undefined : 'var(--color-surface-card)', color: module.enabled ? undefined : 'var(--muted)' }}>
                  <Settings size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-black">{module.name}</h3>
                    <button
                      disabled={module.key === 'admin'}
                      aria-label={`Cambiar estado de ${module.name}`}
                      onClick={async () => { await api.updateModule(String(module.id), !module.enabled); await reload(); done(`Modulo ${module.enabled ? 'deshabilitado' : 'habilitado'}`) }}
                      className="disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {module.enabled ? <ToggleRight style={{ color: moduleColor }} size={30} /> : <ToggleLeft className="text-[var(--muted)]" size={30} />}
                    </button>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{module.description}</p>
                  <p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">{module.key === 'admin' ? 'Esencial' : module.enabled ? 'Habilitado' : 'Deshabilitado'}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </Card>
  )
}

function EntityPanel({ data }: { data: AdminOverview }) {
  const activeModules = data.modules.filter(module => module.enabled)
  return (
    <Card accent={identity.color} className="p-6">
      <p className="ds-eyebrow">Entidad activa</p>
      <h2 className="mt-1 text-2xl font-black">ESE Salud Yopal</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[['Tipo de entidad', 'ESE'], ['Administrador', 'Superadministrador'], ['Estado', 'Activa'], ['Modulos activos', String(activeModules.length)]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--border-hairline)] p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
            <strong className="mt-2 block">{value}</strong>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">{activeModules.map(module => <Badge key={module.id} tone="info">{module.name}</Badge>)}</div>
    </Card>
  )
}

function SettingsPanel({ data }: { data: AdminOverview }) {
  const adminPermissions = data.permissions.filter(permission => permission.key.includes('admin') || permission.key.includes('settings') || permission.key.includes('roles'))
  return (
    <div className="grid gap-6 xl:grid-cols-[.95fr_1.05fr]">
      <Card accent={identity.color} className="p-6">
        <p className="ds-eyebrow">Configuracion base</p>
        <h2 className="mt-1 text-2xl font-black">Parametros institucionales</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Esta seccion deja preparado el punto de control para informacion de entidad, modulos activos, permisos sensibles y futuras integraciones de ALMERA.</p>
        <div className="mt-6 grid gap-3">
          {[
            ['Entidad', 'ESE Salud Yopal'],
            ['Origen', 'sgimr.cloud'],
            ['Sesion', 'Cookie HttpOnly'],
            ['Modo', 'Produccion VPS'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-[var(--border-hairline)] p-4">
              <span className="font-mono text-[11px] font-black uppercase tracking-wider text-[var(--muted)]">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <Link to="/app/design-system" className="mt-4 inline-flex items-center gap-2 text-sm font-bold" style={{ color: identity.color }}>Galería del design system (revisión) →</Link>
      </Card>

      <Card accent={identity.color} className="p-6">
        <p className="ds-eyebrow">Permisos sensibles</p>
        <h2 className="mt-1 text-xl font-black">Controles administrativos</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {adminPermissions.map(permission => (
            <div key={permission.id} className="rounded-xl border border-[var(--border-hairline)] p-4">
              <Badge tone="info">{permission.key}</Badge>
              <p className="mt-3 text-sm text-[var(--muted)]">{permission.description || permission.name}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

interface PanelProps { data: AdminOverview; reload(): Promise<void>; done(message: string): void }
