import { useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Loader2, Plus, Save, Settings, Shield, ToggleLeft, ToggleRight, UserPlus, Users } from 'lucide-react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '@/platform/api'
import { useAuth } from '@/platform/auth/AuthContext'
import type { AdminOverview, AdminRole } from '@/platform/types'
import { Badge, Button, Card, Field, PageHeader, SearchBox, StatusBadge } from '@/shared/ui'

type Tab = 'users' | 'roles' | 'modules' | 'entity' | 'settings'
const tabKeys: Tab[] = ['users', 'roles', 'modules', 'entity', 'settings']

export default function AdminPage() {
  const { session, refresh: refreshSession } = useAuth()
  const { section } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const routeTab = tabKeys.includes(section as Tab) ? section as Tab : 'users'
  const canUsers = Boolean(session?.permissions.some(item => ['users.view', 'users.create', 'users.edit', 'users.disable', 'users.manage'].includes(item)))
  const canRoles = Boolean(session?.permissions.some(item => ['roles.assign', 'roles.manage'].includes(item)))
  const canModules = Boolean(session?.permissions.some(item => ['settings.edit', 'modules.manage', 'organization.manage'].includes(item)))
  const availableTabs = useMemo(() => [
    canUsers && { id: 'users' as Tab, Icon: Users, label: 'Usuarios' },
    canRoles && { id: 'roles' as Tab, Icon: Shield, label: 'Roles y permisos' },
    canModules && { id: 'modules' as Tab, Icon: Settings, label: 'Modulos' },
    canModules && { id: 'entity' as Tab, Icon: KeyRound, label: 'Entidad activa' },
    canModules && { id: 'settings' as Tab, Icon: Settings, label: 'Configuracion' },
  ].filter(Boolean) as Array<{ id: Tab; Icon: typeof Users; label: string }>, [canUsers, canRoles, canModules])
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
        description="Usuarios, roles, permisos, modulos y entidad activa bajo una misma consola de control."
        actions={<Badge tone="accent">{session?.organization.name}</Badge>}
      />
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[.035] p-1.5">
        {availableTabs.map(({ id, Icon, label }) => <button key={id} onClick={() => navigate(`/app/administracion/${id}`)} className={`flex min-w-fit items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${tab === id ? 'bg-[#B3263A] text-white' : 'text-slate-400 hover:bg-white/[.06] hover:text-white'}`}><Icon size={16} />{label}</button>)}
      </nav>
      {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"><Check size={16} />{notice}</div>}
      {error && <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}
      {!data ? <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-[#56D6C9]" /></div> : <>
        {tab === 'users' && canUsers && <UsersPanel data={data} reload={load} done={done} />}
        {tab === 'roles' && canRoles && <RolesPanel data={data} reload={load} done={done} />}
        {tab === 'modules' && canModules && <ModulesPanel data={data} reload={async () => { await load(); await refreshSession() }} done={done} />}
        {tab === 'entity' && canModules && <EntityPanel data={data} />}
        {tab === 'settings' && canModules && <SettingsPanel data={data} />}
      </>}
    </div>
  )
}

function UsersPanel({ data, reload, done }: PanelProps) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', roleId: data.roles.find(r => !r.system)?.id || data.roles[0]?.id || '' })
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('ALL')
  const [active, setActive] = useState('ALL')
  const users = data.users.filter(user => {
    const matchesText = `${user.full_name} ${user.email} ${user.role_name}`.toLowerCase().includes(query.toLowerCase())
    const matchesRole = role === 'ALL' || String(user.role_id) === role
    const matchesActive = active === 'ALL' || String(user.membership_active) === active
    return matchesText && matchesRole && matchesActive
  })
  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try { await api.createUser(form); setForm({ ...form, fullName: '', email: '', password: '' }); await reload(); done('Usuario creado y rol asignado') }
    finally { setSaving(false) }
  }
  return <div className="grid gap-6 xl:grid-cols-[.78fr_1.22fr]">
    <Card className="h-fit p-6">
      <form onSubmit={create}>
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#56D6C9]/10 text-[#56D6C9]"><UserPlus size={19} /></div><div><h2 className="font-black">Alta de usuario</h2><p className="text-xs text-slate-400">Cuenta, rol inicial y acceso de entidad</p></div></div>
        <div className="mt-6 space-y-4">
          <Field label="Nombre completo"><input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></Field>
          <Field label="Correo"><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Contrasena inicial (min. 10 caracteres)"><input required minLength={10} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Rol"><select required value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></Field>
          <Button disabled={saving} className="w-full">{saving ? 'Creando...' : <><Plus size={16} /> Crear usuario</>}</Button>
        </div>
      </form>
    </Card>
    <Card className="overflow-hidden">
      <div className="border-b border-white/10 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Directorio de acceso</p>
            <h2 className="mt-1 text-xl font-black">Usuarios de la entidad</h2>
          </div>
          <Badge tone="info">{users.length} visibles</Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px]">
          <SearchBox value={query} onChange={setQuery} placeholder="Buscar usuario, correo o rol" />
          <select className="input" value={role} onChange={event => setRole(event.target.value)}><option value="ALL">Todos los roles</option>{data.roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select className="input" value={active} onChange={event => setActive(event.target.value)}><option value="ALL">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[860px]">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Ultimo acceso</th><th>Acciones</th></tr></thead>
          <tbody>{users.map(user => <tr key={user.membership_id}><td><strong className="block">{user.full_name}</strong><span className="text-sm text-slate-400">{user.email}</span></td><td><select className="input" value={String(user.role_id)} onChange={async e => { await api.updateUser(user.membership_id, { roleId: e.target.value, active: user.membership_active }); await reload(); done('Rol actualizado') }}>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td><td><StatusBadge status={user.membership_active ? 'Activo' : 'Inactivo'} /></td><td><span className="font-mono text-xs text-slate-400">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Sin registro'}</span></td><td><Button variant="secondary" onClick={async () => { await api.updateUser(user.membership_id, { roleId: String(user.role_id), active: !user.membership_active }); await reload(); done(user.membership_active ? 'Usuario desactivado' : 'Usuario activado') }}>{user.membership_active ? 'Inactivar' : 'Activar'}</Button></td></tr>)}</tbody>
        </table>
      </div>
    </Card>
  </div>
}

function RolesPanel({ data, reload, done }: PanelProps) {
  const [selectedId, setSelectedId] = useState(data.roles[0]?.id || '')
  const selected = data.roles.find(role => String(role.id) === String(selectedId))
  const [moduleIds, setModuleIds] = useState<string[]>([])
  const [permissionIds, setPermissionIds] = useState<string[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  useEffect(() => { setModuleIds((selected?.module_ids || []).map(String)); setPermissionIds((selected?.permission_ids || []).map(String)) }, [selectedId, data, selected])
  async function create(event: React.FormEvent) { event.preventDefault(); const role = await api.createRole({ name, description }) as AdminRole; setName(''); setDescription(''); await reload(); setSelectedId(String(role.id)); done('Rol creado; ahora configura sus accesos') }
  function toggle(list: string[], value: string, setter: (items: string[]) => void) { setter(list.includes(value) ? list.filter(id => id !== value) : [...list, value]) }
  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <div className="space-y-5">
        <Card className="p-5">
          <form onSubmit={create}>
            <p className="eyebrow">Matriz de autoridad</p>
            <h2 className="mt-1 font-black">Crear rol</h2>
            <div className="mt-4 space-y-3">
              <input required className="input" placeholder="Ej. Coordinador de calidad" value={name} onChange={e => setName(e.target.value)} />
              <textarea className="input min-h-20" placeholder="Responsabilidad del rol" value={description} onChange={e => setDescription(e.target.value)} />
              <Button className="w-full"><Plus size={15} /> Crear rol</Button>
            </div>
          </form>
        </Card>

        <Card className="p-2">
          {data.roles.map(role => (
            <button key={role.id} onClick={() => setSelectedId(String(role.id))} className={`w-full rounded-xl p-3 text-left ${String(selectedId) === String(role.id) ? 'bg-[#B3263A] text-white' : 'hover:bg-white/[.06]'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{role.name}</span>
                {role.system && <KeyRound size={13} className="text-[#56D6C9]" />}
              </div>
              <p className="mt-1 text-xs text-slate-400">{role.user_count} usuarios</p>
            </button>
          ))}
        </Card>
      </div>

      {selected && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Rol / permisos / modulos</p>
              <h2 className="mt-1 text-xl font-black">{selected.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{selected.description || 'Sin descripcion'}</p>
            </div>
            {selected.system && <Badge tone="info">Rol protegido</Badge>}
          </div>

          {selected.system ? (
            <div className="mt-8 rounded-xl border border-white/10 bg-white/[.035] p-5 text-sm text-slate-400">
              El superadministrador conserva todos los modulos y permisos para evitar que la entidad quede sin administracion.
            </div>
          ) : (
            <>
              <AccessGroup title="Modulos visibles" description="Espacios que apareceran en el menu de este rol">
                {data.modules.filter(module => module.enabled).map(module => (
                  <CheckRow key={module.id} checked={moduleIds.includes(String(module.id))} onChange={() => toggle(moduleIds, String(module.id), setModuleIds)} title={module.name} description={module.description} />
                ))}
              </AccessGroup>
              <AccessGroup title="Permisos base" description="Acciones autorizadas para este rol">
                {data.permissions.map(permission => (
                  <CheckRow key={permission.id} checked={permissionIds.includes(String(permission.id))} onChange={() => toggle(permissionIds, String(permission.id), setPermissionIds)} title={permission.key} description={permission.description || permission.name} />
                ))}
              </AccessGroup>
              <Button onClick={async () => { await api.updateRoleAccess(String(selected.id), moduleIds, permissionIds); await reload(); done('Accesos del rol guardados') }} className="mt-6"><Save size={16} /> Guardar accesos</Button>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

function ModulesPanel({ data, reload, done }: PanelProps) {
  return <Card className="overflow-hidden"><div className="border-b border-white/10 p-6"><h2 className="font-black">Catalogo operativo de modulos</h2><p className="mt-1 text-sm text-slate-400">Un modulo habilitado puede asignarse a roles. Deshabilitarlo lo retira de la entidad.</p></div><div className="grid gap-4 p-6 md:grid-cols-2">{data.modules.map(module => <article key={module.id} className={`rounded-xl border p-5 ${module.enabled ? 'border-[#56D6C9]/24 bg-[#56D6C9]/[.055]' : 'border-white/10 bg-white/[.03] opacity-75'}`}><div className="flex items-start gap-4"><div className={`grid h-11 w-11 place-items-center rounded-xl ${module.enabled ? 'bg-[#56D6C9]/10 text-[#56D6C9]' : 'bg-white/[.06] text-slate-500'}`}><Settings size={19} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="font-black">{module.name}</h3><button disabled={module.key === 'admin'} aria-label={`Cambiar estado de ${module.name}`} onClick={async () => { await api.updateModule(String(module.id), !module.enabled); await reload(); done(`Modulo ${module.enabled ? 'deshabilitado' : 'habilitado'}`) }} className="disabled:cursor-not-allowed disabled:opacity-40">{module.enabled ? <ToggleRight className="text-[#56D6C9]" size={30} /> : <ToggleLeft className="text-slate-500" size={30} />}</button></div><p className="mt-2 text-sm leading-relaxed text-slate-400">{module.description}</p><p className="mt-3 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">{module.key === 'admin' ? 'Esencial' : module.enabled ? 'Habilitado' : 'Deshabilitado'}</p></div></div></article>)}</div></Card>
}

function EntityPanel({ data }: { data: AdminOverview }) {
  const activeModules = data.modules.filter(module => module.enabled)
  return <Card className="p-6"><p className="eyebrow">Entidad activa</p><h2 className="mt-1 text-2xl font-black">ESE Salud Yopal</h2><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[['Tipo de entidad', 'ESE'], ['Administrador', 'Superadministrador'], ['Estado', 'Activa'], ['Modulos activos', String(activeModules.length)]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</p><strong className="mt-2 block">{value}</strong></div>)}</div><div className="mt-6 flex flex-wrap gap-2">{activeModules.map(module => <Badge key={module.id} tone="info">{module.name}</Badge>)}</div></Card>
}

function SettingsPanel({ data }: { data: AdminOverview }) {
  const adminPermissions = data.permissions.filter(permission => permission.key.includes('admin') || permission.key.includes('settings') || permission.key.includes('roles'))
  return (
    <div className="grid gap-6 xl:grid-cols-[.95fr_1.05fr]">
      <Card className="p-6">
        <p className="eyebrow">Configuracion base</p>
        <h2 className="mt-1 text-2xl font-black">Parametros institucionales</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">Esta seccion deja preparado el punto de control para informacion de entidad, modulos activos, permisos sensibles y futuras integraciones de ALMERA.</p>
        <div className="mt-6 grid gap-3">
          {[
            ['Entidad', 'ESE Salud Yopal'],
            ['Origen', 'sgimr.cloud'],
            ['Sesion', 'Cookie HttpOnly'],
            ['Modo', 'Produccion VPS'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.035] p-4">
              <span className="font-mono text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <p className="eyebrow">Permisos sensibles</p>
        <h2 className="mt-1 text-xl font-black">Controles administrativos</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {adminPermissions.map(permission => (
            <div key={permission.id} className="rounded-xl border border-white/10 bg-white/[.035] p-4">
              <Badge tone="accent">{permission.key}</Badge>
              <p className="mt-3 text-sm text-slate-400">{permission.description || permission.name}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

interface PanelProps { data: AdminOverview; reload(): Promise<void>; done(message: string): void }
function AccessGroup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="mt-8"><h3 className="font-black">{title}</h3><p className="mb-3 text-xs text-slate-400">{description}</p><div className="grid gap-2 md:grid-cols-2">{children}</div></div> }
function CheckRow({ checked, onChange, title, description }: { checked: boolean; onChange(): void; title: string; description: string }) { return <button type="button" onClick={onChange} className={`flex gap-3 rounded-xl border p-4 text-left transition ${checked ? 'border-[#56D6C9]/50 bg-[#56D6C9]/10' : 'border-white/10 hover:border-white/20'}`}><span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${checked ? 'bg-[#56D6C9] text-slate-950' : 'border border-white/20 bg-transparent'}`}>{checked && <Check size={13} />}</span><span><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span></span></button> }
