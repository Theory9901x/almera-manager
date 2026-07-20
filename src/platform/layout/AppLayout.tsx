import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Archive, BarChart3, Blocks, Building2, CheckSquare, ChevronDown, ClipboardCheck, ClipboardList,
  FileBarChart2, Headphones, LayoutDashboard, Leaf, LogOut, Menu, Search, Settings,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/platform/auth/AuthContext'
import { BrandMark } from '@/shared/ui'
import { Badge, moduleIdentity } from '@/design-system'

const icons = {
  'layout-dashboard': LayoutDashboard,
  'clipboard-check': ClipboardCheck,
  'clipboard-list': ClipboardList,
  'check-square': CheckSquare,
  headphones: Headphones,
  archive: Archive,
  'file-bar-chart': FileBarChart2,
  'shield-check': ShieldCheck,
  'bar-chart': BarChart3,
  leaf: Leaf,
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

  const activeModuleKey = location.pathname.startsWith('/app/adherencia/') ? 'adherence-matrix'
    : location.pathname.startsWith('/app/administracion') ? 'admin'
    : currentModule?.key

  const operationalKeys = ['technical-assistances', 'internal-audits', 'audits', 'almera']
  const operationalModules = session.modules.filter(module => operationalKeys.includes(module.key))
  const adherenceModule = session.modules.find(module => module.key === 'adherence-matrix')
  const otherModules = session.modules.filter(module => !operationalKeys.includes(module.key) && module.key !== 'adherence-matrix' && module.key !== 'admin' && module.key !== 'dashboard')
  const adminModules = session.modules.filter(module => module.key === 'admin')
  const operationalRoute = operationalKeys.map(key => operationalModules.find(module => module.key === key)?.route).find(Boolean)
  const adherenceRoute = adherenceModule && (
    session.permissions.includes('adherence_matrix.manage') ? '/app/adherencia/configuracion'
    : (session.permissions.includes('adherence_matrix.evaluate')) ? '/app/adherencia/operacion'
    : session.permissions.includes('adherence_matrix.own_plan') ? '/app/adherencia/mis-planes'
    : null
  )

  const adherenceLinks = adherenceModule ? [
    session.permissions.includes('adherence_matrix.manage') && { to: '/app/adherencia/configuracion', label: 'Configuración' },
    (session.permissions.includes('adherence_matrix.evaluate') || session.permissions.includes('adherence_matrix.manage')) && { to: '/app/adherencia/operacion', label: 'Operación' },
    session.permissions.includes('adherence_matrix.own_plan') && { to: '/app/adherencia/mis-planes', label: 'Mis planes' },
  ].filter(Boolean) as { to: string; label: string }[] : []

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

        <nav className="relative flex-1 overflow-y-auto px-3 py-4">
          <div className="sidebar-section">
            <p className="sidebar-section-header">Principal</p>
            <NavLink to="/app" end onClick={() => setOpen(false)} className={({ isActive }) => `sidebar-item ${isActive ? 'is-active' : ''}`}>
              <LayoutDashboard className="item-icon" size={20} />
              <span className="min-w-0 flex-1 truncate">Inicio</span>
            </NavLink>
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-header">Módulos</p>
            {operationalRoute && (() => {
              const identity = moduleIdentity('almera')
              return (
                <NavLink
                  to={operationalRoute}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'is-active' : ''}`}
                >
                  <ClipboardCheck className="item-icon" size={20} style={{ color: identity.color }} />
                  <span className="min-w-0 flex-1 truncate">Asistencias Técnicas</span>
                </NavLink>
              )
            })()}
            {adherenceModule && adherenceRoute && (() => {
              const identity = moduleIdentity('adherence-matrix')
              const isAdherenceActive = activeModuleKey === 'adherence-matrix'
              return (
                <>
                  <NavLink
                    to={adherenceRoute}
                    onClick={() => setOpen(false)}
                    className={`sidebar-item ${isAdherenceActive ? 'is-active' : ''}`}
                  >
                    <ClipboardCheck className="item-icon" size={20} style={{ color: identity.color }} />
                    <span className="min-w-0 flex-1 truncate">Matrices de Adherencia</span>
                  </NavLink>
                  {isAdherenceActive && adherenceLinks.map(link => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) => `sidebar-subitem ${isActive ? 'is-active' : ''}`}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </>
              )
            })()}
            {otherModules.map(module => {
              const Icon = icons[module.icon as keyof typeof icons] || Blocks
              const identity = moduleIdentity(module.key)
              return (
                <NavLink
                  key={module.id}
                  to={module.route}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'is-active' : ''}`}
                >
                  <Icon className="item-icon" size={20} style={{ color: identity.color }} />
                  <span className="min-w-0 flex-1 truncate">{module.name}</span>
                </NavLink>
              )
            })}
          </div>

          {adminModules.length > 0 && (
            <div className="sidebar-section">
              <p className="sidebar-section-header">Administración</p>
              {adminModules.map(module => {
                const Icon = icons[module.icon as keyof typeof icons] || Blocks
                const identity = moduleIdentity(module.key)
                return (
                  <NavLink
                    key={module.id}
                    to={module.route}
                    end
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `sidebar-item ${isActive ? 'is-active' : ''}`}
                  >
                    <Icon className="item-icon" size={20} style={{ color: identity.color }} />
                    <span className="min-w-0 flex-1 truncate">{module.name}</span>
                  </NavLink>
                )
              })}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <Link to="/app/mi-cuenta" className="sidebar-user" onClick={() => setOpen(false)}>
            <div className="sidebar-avatar">{initials}</div>
            <div className="min-w-0 flex-1">
              <p>{session.user.fullName}</p>
              <span>{session.position?.name || session.user.email}</span>
            </div>
            <ChevronDown size={14} />
          </Link>
          <button onClick={endSession} className="sidebar-logout"><LogOut size={15} /> Cerrar sesión</button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <button aria-label="Abrir menú" className="mobile-menu lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: moduleIdentity(activeModuleKey).color }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="topbar-title">{currentModule?.name || 'Panel administrativo'}</p>
              <p className="topbar-description">{currentModule?.description || 'Gestión de usuarios, roles, permisos y entidad activa'}</p>
            </div>
          </div>
          <div className="topbar-actions hidden md:flex">
            <button className="topbar-search" type="button"><Search size={15} /> Buscar</button>
            <span className="topbar-system"><Sparkles size={14} /> SGIMR</span>
            <Badge tone="info">Operativo</Badge>
            <Link to="/app/mi-cuenta" className="topbar-profile" title="Gestión de usuario">
              <div className="topbar-avatar">{initials}</div>
              <span className="topbar-profile-info">
                <strong>{session.user.fullName}</strong>
                <small>{session.position?.name || session.role.name}</small>
              </span>
            </Link>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
