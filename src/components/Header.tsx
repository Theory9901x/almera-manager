import { useLocation } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'

const TITLES: Record<string, { titulo: string; sub: string }> = {
  '/dashboard':      { titulo: 'Dashboard',        sub: 'Resumen del período' },
  '/gestion':        { titulo: 'Gestión',           sub: 'Asistencias, capacitaciones e indicadores' },
  '/tareas':         { titulo: 'Tareas y pendientes', sub: 'Seguimiento de compromisos' },
  '/notificaciones': { titulo: 'Notificaciones',    sub: 'Alertas y avisos' },
}

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function Header() {
  const { pathname } = useLocation()
  const { periodoActivo } = useAppStore()
  const info = TITLES[pathname] ?? { titulo: 'Almera Manager', sub: '' }

  return (
    <header className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{info.titulo}</h1>
        <p className="text-xs text-slate-400 mt-0.5">{info.sub}</p>
      </div>
      <div className="flex items-center gap-3">
        {periodoActivo && (
          <span className="text-xs bg-almera-50 text-almera-700 px-3 py-1.5 rounded-full font-semibold border border-almera-100">
            {MESES[periodoActivo.mes]} {periodoActivo.anio}
          </span>
        )}
        <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-medium">
          Administrador
        </span>
      </div>
    </header>
  )
}
