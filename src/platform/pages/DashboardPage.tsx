import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Radar,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/platform/auth/AuthContext'
import { recentActivities } from '@/shared/services/activityService'
import { Badge, StatusBadge } from '@/shared/ui'

const executiveMetrics = [
  ['Usuarios activos', '18', 'Acceso RBAC controlado', 'success'],
  ['ALMERA mes', '24', 'Solicitudes documentales', 'accent'],
  ['Pendientes', '7', 'Requieren revision', 'warning'],
  ['Cerradas', '9', 'Con evidencia registrada', 'info'],
] as const

const operatingRoute = [
  ['01', 'Registrar', 'Solicitud documental, proceso y responsable'],
  ['02', 'Evidenciar', 'Soportes, observaciones y actividad realizada'],
  ['03', 'Validar', 'Revision administrativa y trazabilidad'],
  ['04', 'Cerrar', 'Informe y control institucional'],
]

export default function DashboardPage() {
  const { session } = useAuth()
  if (!session) return null

  const workModules = session.modules.filter(module => !['dashboard'].includes(module.key))
  const canAdmin = session.permissions.includes('admin.view') || session.modules.some(module => module.key === 'admin')

  return (
    <div className="cyber-dashboard mx-auto max-w-7xl">
      <section className="cyber-hero">
        <div className="cyber-scanline" />
        <div className="cyber-hero-copy">
          <div className="cyber-kicker"><Radar size={14} /> {session.organization.name}</div>
          <h1>Centro de mando SGIMR</h1>
          <p>
            Panel administrativo rojo/negro para controlar Gestion ALMERA, usuarios,
            roles, evidencias y seguimiento operativo sin saturar la pantalla.
          </p>
          <div className="cyber-actions">
            <Link to="/app/modulos/almera" className="cyber-button cyber-button-primary">
              Abrir ALMERA <ArrowUpRight size={16} />
            </Link>
            {canAdmin && (
              <Link to="/app/administracion/users" className="cyber-button cyber-button-secondary">
                Usuarios y roles <Users size={16} />
              </Link>
            )}
          </div>
        </div>

        <div className="cyber-hero-status">
          <div className="cyber-status-core">
            <ShieldCheck size={34} />
            <span>Online</span>
            <strong>SGIMR</strong>
          </div>
          <div className="cyber-status-grid">
            <span>Rol</span>
            <strong>{session.role.name}</strong>
            <span>Modulos</span>
            <strong>{workModules.length}</strong>
            <span>Permisos</span>
            <strong>{session.permissions.length}</strong>
          </div>
        </div>
      </section>

      <section className="cyber-metrics">
        {executiveMetrics.map(([label, value, detail, tone]) => (
          <article key={label} className={`cyber-metric tone-${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <section className="cyber-grid">
        <article className="cyber-panel cyber-panel-large">
          <div className="cyber-panel-head">
            <div>
              <p className="eyebrow">Resumen principal</p>
              <h2>Gestion institucional activa</h2>
            </div>
            <Badge tone="success">Sistema operativo</Badge>
          </div>

          <div className="cyber-summary">
            <div>
              <span>Solicitudes documentales</span>
              <strong>12</strong>
              <p>4 en revision administrativa</p>
            </div>
            <div>
              <span>Evidencias registradas</span>
              <strong>38</strong>
              <p>9 pendientes por validar</p>
            </div>
            <div>
              <span>Informes generados</span>
              <strong>3</strong>
              <p>Seguimiento inicial disponible</p>
            </div>
          </div>

          <div className="cyber-route">
            {operatingRoute.map(([index, title, text]) => (
              <article key={index}>
                <span>{index}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
                <CheckCircle2 size={17} />
              </article>
            ))}
          </div>
        </article>

        <article className="cyber-panel">
          <div className="cyber-panel-head">
            <div>
              <p className="eyebrow">Gestion ALMERA</p>
              <h2>Estado operativo</h2>
            </div>
            <Activity className="cyber-panel-icon" size={22} />
          </div>

          <div className="cyber-almera-state">
            <div>
              <span>Flujo documental</span>
              <strong>Activo</strong>
            </div>
            <div>
              <span>Trazabilidad</span>
              <strong>Preparada</strong>
            </div>
            <div>
              <span>Riesgo</span>
              <strong>Bajo</strong>
            </div>
          </div>

          <Link to="/app/modulos/almera" className="cyber-button cyber-button-wide cyber-button-primary">
            Gestionar solicitudes <Zap size={16} />
          </Link>
        </article>
      </section>

      <section className="cyber-grid cyber-grid-bottom">
        <article className="cyber-panel">
          <div className="cyber-panel-head">
            <div>
              <p className="eyebrow">Accesos rapidos</p>
              <h2>Rutas clave</h2>
            </div>
            <Sparkles className="cyber-panel-icon" size={22} />
          </div>
          <div className="cyber-link-list">
            <QuickLink to="/app/modulos/almera" icon={<FileText size={18} />} title="Gestion ALMERA" text="Solicitudes, estados, evidencias y soportes" />
            {canAdmin && <QuickLink to="/app/administracion/users" icon={<LockKeyhole size={18} />} title="Usuarios y permisos" text="Roles, accesos y entidad activa" />}
            <QuickLink to="/app/modulos/reports" icon={<Route size={18} />} title="Informes" text="Seguimiento ejecutivo y trazabilidad" />
          </div>
        </article>

        <article className="cyber-panel cyber-panel-large">
          <div className="cyber-panel-head">
            <div>
              <p className="eyebrow">Bitacora reciente</p>
              <h2>Ultimas actividades</h2>
            </div>
            <Badge tone="info">{recentActivities.length} eventos</Badge>
          </div>

          <div className="cyber-activity-list">
            {recentActivities.map(activity => (
              <article key={activity.id}>
                <div>
                  <strong>{activity.action}</strong>
                  <p>{activity.description}</p>
                  <span>{activity.module} / {activity.user}</span>
                </div>
                <StatusBadge status={activity.status} />
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}

function QuickLink({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="cyber-quick-link">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <ArrowUpRight size={16} />
    </Link>
  )
}
