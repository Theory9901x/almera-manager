import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Archive, BarChart3, Blocks, Building2, CheckSquare, ChevronDown, ClipboardCheck,
  FileBarChart2, Headphones, HeartPulse, LayoutDashboard, LogOut, Menu, Settings,
  ShieldCheck, Signal, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge } from '@/shared/ui'

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

  async function endSession() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell lg:flex">
      {open && <button aria-label="Cerrar menu" className="fixed inset-0 z-30 bg-slate-950/55 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`shell-sidebar fixed inset-y-0 left-0 z-40 flex w-80 flex-col overflow-hidden transition-transform lg:sticky lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(179,38,58,.22),transparent_30%),radial-gradient(circle_at_100%_55%,rgba(86,214,201,.12),transparent_34%)]" />
        <div className="relative flex h-24 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#8B1E2D] text-white shadow-lg shadow-black/30"><HeartPulse size={22} /></div>
          <div>
            <p className="text-sm font-black uppercase tracking-[.25em]">SGIMR</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">ALMERA command</p>
          </div>
          <button className="ml-auto text-slate-400 lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>

        <div className="relative mx-4 mt-5 rounded-2xl border border-white/10 bg-[#070B10]/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#56D6C9]"><Building2 size={13} /> Entidad activa</div>
          <p className="mt-2 truncate text-sm font-black">{session.organization.name}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{session.role.name}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <span className="rounded-lg border border-white/10 bg-white/[.035] px-2 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-slate-400">RBAC activo</span>
            <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-2 font-mono text-[10px] font-black uppercase tracking-wider text-emerald-200">Online</span>
          </div>
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-4 py-5">
          <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Navegacion operativa</p>
          {session.modules.map(module => {
            const Icon = icons[module.icon as keyof typeof icons] || Blocks
            return (
              <NavLink key={module.id} to={module.route} end={module.key === 'dashboard'} onClick={() => setOpen(false)} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${isActive ? 'border-[#B3263A]/70 bg-[#B3263A] text-white font-black shadow-lg shadow-black/25' : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[.06] hover:text-white'}`
              }>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.06] text-[#56D6C9] transition group-hover:bg-[#56D6C9] group-hover:text-slate-950"><Icon size={17} /></span>
                <span className="min-w-0 flex-1 truncate">{module.name}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="relative border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/6 px-3 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-[#131D26] text-xs font-black text-[#56D6C9] ring-1 ring-white/10">{session.user.fullName.split(' ').slice(0, 2).map(x => x[0]).join('')}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{session.user.fullName}</p>
              <p className="truncate text-[11px] text-slate-500">{session.user.email}</p>
            </div>
            <ChevronDown size={14} className="text-slate-500" />
          </div>
          <button onClick={endSession} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"><LogOut size={15} /> Cerrar sesion</button>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-header sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <button className="mr-3 rounded-xl p-2 text-slate-300 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-[.22em] text-[#56D6C9]">{currentModule?.name || 'Panel administrativo'}</p>
            <p className="truncate text-sm text-slate-400">{currentModule?.description || 'Gestion de usuarios, roles, permisos y entidad activa'}</p>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-wider text-slate-300"><Signal size={13} /> SGIMR</span>
            <Badge tone="success">Sistema operativo</Badge>
            <Badge tone="accent">{session.role.name}</Badge>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
