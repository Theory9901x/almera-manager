import { ArrowUpRight, CheckCircle2, FileText, Route, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/platform/auth/AuthContext'
import { recentActivities } from '@/shared/services/activityService'
import { Badge, Card, PageHeader, StatusBadge } from '@/shared/ui'

const executiveMetrics = [
  ['Usuarios activos', '18', 'Roles y consulta controlados', 'success'],
  ['Modulos activos', '7', 'Base inicial habilitada', 'info'],
  ['ALMERA mes', '24', 'Actividades registradas', 'accent'],
  ['Pendientes', '7', 'Requieren revision', 'warning'],
] as const

const operatingRoute = [
  ['01', 'Registrar solicitud', 'Ingreso de necesidad documental, proceso y responsable'],
  ['02', 'Gestionar evidencia', 'Carga de soporte, observaciones y estado operativo'],
  ['03', 'Revisar cierre', 'Validacion administrativa y cierre con trazabilidad'],
  ['04', 'Generar informe', 'Salida basica para seguimiento institucional'],
]

export default function DashboardPage() {
  const { session } = useAuth()
  if (!session) return null
  const workModules = session.modules.filter(module => !['dashboard'].includes(module.key))
  const canAdmin = session.permissions.includes('admin.view') || session.modules.some(module => module.key === 'admin')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={session.organization.name}
        title="Centro de mando SGIMR"
        description="Control administrativo, accesos, gestion ALMERA y trazabilidad operativa en una sola vista."
        actions={<><Badge tone="success">Sistema operativo</Badge><Badge tone="accent">{session.role.name}</Badge></>}
      />

      <section className="metric-strip">
        {executiveMetrics.map(([label, value, detail, tone]) => (
          <article key={label} className={`stat-card tone-${tone}`}>
            <p>{label}</p>
            <strong>{label === 'Modulos activos' ? workModules.length : value}</strong>
            <span>{detail}</span>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <Card className="p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Estado general</p>
              <h2 className="mt-1 text-2xl font-black">Gestion institucional activa</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">La consola concentra usuarios, modulos habilitados, solicitudes ALMERA, evidencias, pendientes e informes basicos.</p>
            </div>
            <ShieldCheck className="text-[#56D6C9]" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Solicitudes documentales', '12', '4 en revision'],
              ['Cerradas', '9', '75% con evidencia'],
              ['Informes generados', '3', 'Seguimiento basico'],
              ['Evidencias registradas', '38', '9 por validar'],
              ['Estado sistema', 'Estable', 'Sin alertas criticas'],
              ['Ruta operativa', '4 fases', 'Registro a informe'],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4">
                <p className="font-mono text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
                <strong className="mt-3 block text-2xl font-black">{value}</strong>
                <span className="mt-1 block text-sm text-slate-400">{detail}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">Ruta operativa</p>
          <div className="route-line mt-5">
            {operatingRoute.map(([index, title, text]) => (
              <article key={index}>
                <span className="route-index">{index}</span>
                <span>
                  <strong className="block">{title}</strong>
                  <small className="text-slate-400">{text}</small>
                </span>
                <CheckCircle2 className="text-[#56D6C9]" size={18} />
              </article>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="eyebrow">Accesos rapidos</p>
            <ArrowUpRight className="text-slate-500" size={18} />
          </div>
          <div className="grid gap-3">
            <QuickLink to="/app/modulos/almera" icon={<FileText size={18} />} title="Gestion ALMERA" text="Solicitudes, documentos, estados y evidencias" />
            {canAdmin && <QuickLink to="/app/administracion" icon={<Users size={18} />} title="Usuarios, roles y permisos" text="Control de acceso y entidad activa" />}
            <QuickLink to="/app/modulos/reports" icon={<Route size={18} />} title="Informes basicos" text="Seguimiento inicial y trazabilidad" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">Bitacora</p>
              <h2 className="mt-1 text-xl font-black">Ultimas actividades</h2>
            </div>
            <Badge tone="info">{recentActivities.length} eventos</Badge>
          </div>
          <div className="space-y-3">
            {recentActivities.map(activity => (
              <article key={activity.id} className="rounded-xl border border-white/10 bg-[#070B10]/55 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{activity.action}</strong>
                  <StatusBadge status={activity.status} />
                </div>
                <p className="mt-2 text-sm text-slate-400">{activity.description}</p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-slate-500">{activity.module} / {activity.user}</p>
              </article>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}

function QuickLink({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] p-4 transition hover:border-[#B3263A]/50 hover:bg-[#B3263A]/10">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#56D6C9]/10 text-[#56D6C9]">{icon}</span>
      <span className="min-w-0 flex-1">
        <strong className="block">{title}</strong>
        <span className="block truncate text-sm text-slate-400">{text}</span>
      </span>
      <ArrowUpRight className="text-slate-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#56D6C9]" size={17} />
    </Link>
  )
}
