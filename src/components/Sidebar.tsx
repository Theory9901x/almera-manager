import { NavLink } from 'react-router-dom'
import { useAppStore }  from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import {
  LayoutDashboard, ClipboardList, Shield, BarChart3,
  FileText, ChevronLeft, ChevronRight,
  Calendar, LogOut, Search, Bell, Lock, Home,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard',  color: 'from-blue-500 to-blue-600' },
  { to: '/gestion',   icon: ClipboardList,   label: 'Gestión',    color: 'from-violet-500 to-violet-600' },
  { to: '/informes',  icon: FileText,        label: 'Informes',   color: 'from-amber-500 to-amber-600' },
  { to: '/consulta',  icon: Search,          label: 'Consulta',   color: 'from-sky-500 to-sky-600' },
]

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const USER_COLORS: Record<number, string> = {
  1: 'from-indigo-500 to-indigo-700',
  2: 'from-sky-500 to-sky-700',
  3: 'from-emerald-500 to-emerald-700',
}
const USER_INITIALS: Record<number, string> = {
  1: 'KR', 2: 'JG', 3: 'RG',
}

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, periodoActivo, setPeriodoActivo, notifCount, appMode, setAppMode } = useAppStore()
  const { usuario, logout } = useAuthStore()

  const isGCI = appMode === 'gci'

  function volverAlMenu() {
    if (isGCI) logout()
    setAppMode(null)
    setPeriodoActivo(null)
  }

  return (
    <aside className={`flex flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-60'}`}>

      {/* ── Logo / Branding ── */}
      <div className={`flex items-center border-b border-white/10 py-4 ${sidebarCollapsed ? 'px-3 justify-center' : 'px-4 gap-3'}`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${
          isGCI
            ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
            : 'bg-gradient-to-br from-almera-500 to-almera-700'
        }`}>
          {isGCI
            ? <Shield size={15} className="text-white"/>
            : <BarChart3 size={15} className="text-white"/>
          }
        </div>
        {!sidebarCollapsed && (
          <div>
            <p className="text-white font-bold text-sm leading-tight">
              {isGCI ? 'GCI' : 'Almera'}
            </p>
            <p className="text-white/40 text-[10px] leading-tight">
              {isGCI ? 'Gestión de Calidad' : 'Manager'}
            </p>
          </div>
        )}
        {!sidebarCollapsed && (
          <button onClick={toggleSidebar} className="ml-auto p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
            <ChevronLeft size={14} />
          </button>
        )}
      </div>

      {sidebarCollapsed && (
        <button onClick={toggleSidebar} className="flex justify-center py-2 hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
          <ChevronRight size={14} />
        </button>
      )}

      {/* ── Usuario activo (solo GCI) ── */}
      {isGCI && usuario && !sidebarCollapsed && (
        <div className="mx-3 mt-4 p-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${USER_COLORS[usuario.id] ?? 'from-slate-500 to-slate-700'} flex items-center justify-center flex-shrink-0 text-white text-xs font-black shadow`}>
              {USER_INITIALS[usuario.id] ?? usuario.nombre.slice(0,2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-xs leading-tight truncate">{usuario.nombre}</p>
              <p className="text-white/40 text-[10px] leading-tight truncate">{usuario.cargo}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Período activo ── */}
      {periodoActivo && !sidebarCollapsed && (
        <div className="mx-3 mt-2 p-3 rounded-2xl bg-white/5 border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={12} className={isGCI ? 'text-emerald-400' : 'text-almera-400'} />
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">Período activo</p>
          </div>
          <p className="text-white font-bold text-sm">{MESES[periodoActivo.mes]} {periodoActivo.anio}</p>
          <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
            periodoActivo.estado === 'activo'
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-slate-500/20 text-slate-400'
          }`}>
            {periodoActivo.estado}
          </span>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map(({ to, icon: Icon, label, color }) => (
          <NavLink key={to} to={to} className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
              isActive
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            }`
          }>
            {({ isActive }) => (
              <>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                  isActive ? `bg-gradient-to-br ${color} shadow-md` : 'bg-white/10 group-hover:bg-white/15'
                }`}>
                  <Icon size={14} className="text-white" />
                </div>
                {!sidebarCollapsed && <span>{label}</span>}
                {!sidebarCollapsed && isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Notificaciones ── */}
      <div className="px-2 pt-2">
        <button className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:bg-white/10 hover:text-white/80 transition-all group relative ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-lg bg-white/10 group-hover:bg-white/15 flex items-center justify-center flex-shrink-0 relative">
            <Bell size={14} className="text-white" />
            {notifCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </div>
          {!sidebarCollapsed && (
            <>
              <span>Notificaciones</span>
              {notifCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {notifCount}
                </span>
              )}
            </>
          )}
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="px-2 pb-4 space-y-1 border-t border-white/10 pt-3">

        {/* Cambiar período */}
        <button
          onClick={() => setPeriodoActivo(null)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white/70 transition-all group ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          <div className="w-7 h-7 rounded-lg bg-white/10 group-hover:bg-white/15 flex items-center justify-center flex-shrink-0 transition-all">
            <Calendar size={14} className="text-white/50 group-hover:text-white/80" />
          </div>
          {!sidebarCollapsed && <span>Cambiar período</span>}
        </button>

        {/* GCI: cerrar sesión · Almera: solo volver al menú */}
        {isGCI && (
          <button
            onClick={() => { logout(); setAppMode(null); setPeriodoActivo(null) }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:bg-red-500/10 hover:text-red-400 transition-all group ${sidebarCollapsed ? 'justify-center' : ''}`}
          >
            <div className="w-7 h-7 rounded-lg bg-white/10 group-hover:bg-red-500/20 flex items-center justify-center flex-shrink-0 transition-all">
              <LogOut size={14} className="text-white/50 group-hover:text-red-400" />
            </div>
            {!sidebarCollapsed && <span>Cerrar sesión</span>}
          </button>
        )}

        {/* Volver al menú principal */}
        <button
          onClick={volverAlMenu}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/30 hover:bg-white/5 hover:text-white/60 transition-all group ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          <div className="w-7 h-7 rounded-lg bg-white/5 group-hover:bg-white/10 flex items-center justify-center flex-shrink-0 transition-all">
            <Home size={14} className="text-white/30 group-hover:text-white/60" />
          </div>
          {!sidebarCollapsed && <span>Menú principal</span>}
        </button>

        {!sidebarCollapsed && (
          <p className="text-[10px] text-white/20 px-3 pt-1 flex items-center gap-1">
            <Lock size={8}/> v2.0 · {isGCI ? 'GCI Salud Yopal' : 'Almera Manager'}
          </p>
        )}
      </div>
    </aside>
  )
}
