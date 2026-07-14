import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Archive, BarChart3, Blocks, Building2, CheckSquare, ChevronDown, ClipboardCheck,
  FileBarChart2, Headphones, LayoutDashboard, LogOut, Menu, Search, Settings,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, BrandMark } from '@/shared/ui'

const icons = {
  'layout-dashboard': LayoutDashboard,
  'clipboard-check': ClipboardCheck,
  'check-square': CheckSquare,
  headphones: Headphones,
  archive: Archive,
  'file-bar-chart': FileBarChart2,
  'shield-check': ShieldCheck,
  'bar-chart': BarChart3,
  settings: Settings,
  users: Users,
  building: Building2,
}

export default function AppLayout() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  if (!session) return null

  const currentModule = session.modules
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find(module => location.pathname === module.route || location.pathname.startsWith(`${module.route}/`))

  const operationalKeys = ['technical-assistances', 'adherence-matrix', 'internal-audits', 'almera']
  const operationalModules = session.modules.filter(module => operationalKeys.includes(module.key))
  const otherModules = session.modules.filter(module => !operationalKeys.includes(module.key))
  const operationalRoute = operationalKeys.map(key => operationalModules.find(module => module.key === key)?.route).find(Boolean)

  async function endSession() {
    await logout()
    navigate('/login', { replace: true })
  }

  const initials = session.user.fullName.split(' ').slice(0, 2).map(part => part[0]).join('')

  return (
    <div className="app-shell lg:flex">
      {open && <button aria-label="Cerrar menú" className="sidebar-overlay lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`shell-sidebar fixed inset-y-0 left-0 z-40 flex w-[286px] flex-col overflow-hidden transition-transform lg:sticky lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="sidebar-brand">
          <BrandMark compact />
          <div>
            <p>SGIMR</p>
            <span>Gestión integral modular</span>
          </div>
          <button aria-label="Cerrar menú" className="sidebar-close lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>

        <div className="sidebar-entity">
          <div><Building2 size={13} /> Entidad activa</div>
          <p>{session.organization.name}</p>
          <span>{session.role.name}</span>
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="sidebar-label">Espacio de trabajo</p>
          {operationalRoute && (
            <NavLink
              to={operationalRoute}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `sidebar-link group ${isActive ? 'is-active' : ''}`}
            >
              <span className="sidebar-link-icon"><ClipboardCheck size={17} /></span>
              <span className="min-w-0 flex-1 truncate">Gestión ALMERA</span>
            </NavLink>
          )}
          {otherModules.map(module => {
            const Icon = icons[module.icon as keyof typeof icons] || Blocks
            return (
              <NavLink
                key={module.id}
                to={module.route}
                end={['dashboard', 'admin'].includes(module.key)}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `sidebar-link group ${isActive ? 'is-active' : ''}`}
              >
                <span className="sidebar-link-icon"><Icon size={17} /></span>
                <span className="min-w-0 flex-1 truncate">{module.name}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="min-w-0 flex-1">
              <p>{session.user.fullName}</p>
              <span>{session.user.email}</span>
            </div>
            <ChevronDown size={14} />
          </div>
          <button onClick={endSession} className="sidebar-logout"><LogOut size={15} /> Cerrar sesión</button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <button aria-label="Abrir menú" className="mobile-menu lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="min-w-0">
            <p className="topbar-title">{currentModule?.name || 'Panel administrativo'}</p>
            <p className="topbar-description">{currentModule?.description || 'Gestión de usuarios, roles, permisos y entidad activa'}</p>
          </div>
          <div className="topbar-actions hidden md:flex">
            <button className="topbar-search" type="button"><Search size={15} /> Buscar</button>
            <span className="topbar-system"><Sparkles size={14} /> SGIMR</span>
            <Badge tone="success">Operativo</Badge>
            <div className="topbar-avatar" title={session.user.fullName}>{initials}</div>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
