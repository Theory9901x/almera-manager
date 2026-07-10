import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Archive, BarChart3, Blocks, Building2, CheckSquare, ChevronDown, ClipboardCheck,
  FileBarChart2, Headphones, HeartPulse, LayoutDashboard, LogOut, Menu, Settings,
  Moon, ShieldCheck, Signal, Sun, Users, X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
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
  building: Building2,
}

export default function AppLayout() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [contentTheme, setContentTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('sgimr-content-theme') === 'dark' ? 'dark' : 'light'
  })
  if (!session) return null
  const currentModule = session.modules
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find(module => location.pathname === module.route || location.pathname.startsWith(`${module.route}/`))

  async function endSession() {
    await logout()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    window.localStorage.setItem('sgimr-content-theme', contentTheme)
  }, [contentTheme])

  return (
    <div className="app-shell lg:flex">
      {open && <button aria-label="Cerrar menu" className="fixed inset-0 z-30 bg-slate-950/55 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`shell-sidebar fixed inset-y-0 left-0 z-40 flex w-80 flex-col overflow-hidden transition-transform lg:sticky lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="relative flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#8B1E2D] text-white"><HeartPulse size={20} /></div>
          <div>
            <p className="text-sm font-black uppercase tracking-[.25em]">SGIMR</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Gestion institucional</p>
          </div>
          <button className="ml-auto text-slate-400 lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>

        <div className="relative mx-3 mt-4 rounded-xl border border-white/10 bg-white/[.035] p-3">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"><Building2 size={12} /> Entidad activa</div>
          <p className="mt-2 truncate text-sm font-black">{session.organization.name}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{session.role.name}</p>
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-[.22em] text-slate-500">Navegacion operativa</p>
          {session.modules.map(module => {
            const Icon = icons[module.icon as keyof typeof icons] || Blocks
            return (
              <NavLink key={module.id} to={module.route} end={['dashboard', 'admin'].includes(module.key)} onClick={() => setOpen(false)} className={({ isActive }) =>
                `group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${isActive ? 'border-[#B3263A]/70 bg-[#8B1E2D] text-white font-black' : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[.06] hover:text-white'}`
              }>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-white/[.06] text-slate-300 transition group-hover:text-white"><Icon size={16} /></span>
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

      <div className={`shell-main ${contentTheme === 'light' ? 'content-light' : ''}`}>
        <header className="shell-header sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <button className="mr-3 rounded-xl p-2 text-slate-300 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-[.22em] text-[#56D6C9]">{currentModule?.name || 'Panel administrativo'}</p>
            <p className="truncate text-sm text-slate-400">{currentModule?.description || 'Gestion de usuarios, roles, permisos y entidad activa'}</p>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={() => setContentTheme(contentTheme === 'light' ? 'dark' : 'light')}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-wider text-slate-300 transition hover:bg-white/[.08]"
            >
              {contentTheme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
              {contentTheme === 'light' ? 'Vista oscura' : 'Vista clara'}
            </button>
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
