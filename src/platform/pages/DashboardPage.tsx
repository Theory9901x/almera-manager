import { ArrowUpRight, FileText, Route, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/platform/auth/AuthContext'
import { recentActivities } from '@/shared/services/activityService'
import { Badge, Card, PageHeader, StatCard, StatusBadge } from '@/shared/ui'

export default function DashboardPage() {
  const { session } = useAuth()
  if (!session) return null
  const workModules = session.modules.filter(module => !['dashboard'].includes(module.key))
  const canAdmin = session.permissions.includes('admin.view') || session.modules.some(module => module.key === 'admin')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={session.organization.name}
        title="Panel administrativo ALMERA"
        description="Vista ejecutiva para usuarios, modulos activos, solicitudes documentales, evidencias e informes de seguimiento."
        actions={<Badge tone="success">Base operativa activa</Badge>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuarios activos" value="18" detail="Incluye administradores, gestores y consulta" tone="success" />
        <StatCard label="Modulos activos" value={workModules.length} detail="Asignados segun rol y entidad" tone="info" />
        <StatCard label="Actividades ALMERA" value="24" detail="Registradas durante el mes" tone="accent" />
        <StatCard label="Pendientes" value="7" detail="Solicitudes o evidencias por revisar" tone="warning" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Command center</p>
              <h2 className="mt-1 text-2xl font-black">Estado de gestion</h2>
            </div>
            <Badge tone="info">Julio 2026</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Solicitudes documentales', '12', '4 en revision'],
              ['Cerradas', '9', '75% con evidencia'],
              ['Informes generados', '3', 'Seguimiento basico'],
              ['Evidencias registradas', '38', '9 por validar'],
              ['Estado general', 'Estable', 'Sin alertas criticas'],
              ['Ruta operativa', '6 pasos', 'Registro a informe'],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4">
                <p className="font-mono text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
                <strong className="mt-3 block text-2xl font-black">{value}</strong>
                <span className="mt-1 block text-sm text-slate-400">{detail}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="eyebrow">Accesos rapidos</p>
          <div className="mt-4 space-y-3">
            <QuickLink to="/app/modulos/almera" icon={<FileText size={18} />} title="Gestion ALMERA" text="Solicitudes, estados y evidencias" />
            {canAdmin && <QuickLink to="/app/administracion" icon={<Users size={18} />} title="Usuarios y roles" text="Administracion de accesos" />}
            <QuickLink to="/app/modulos/reports" icon={<Route size={18} />} title="Informes basicos" text="Seguimiento e indicadores iniciales" />
          </div>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="p-5">
          <p className="eyebrow">Modulos asignados</p>
          <div className="mt-4 grid gap-3">
            {workModules.map(module => (
              <Link key={module.id} to={module.route} className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[.035] p-4 transition hover:border-[#56D6C9]/40 hover:bg-white/[.06]">
                <div>
                  <h3 className="font-black">{module.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{module.description}</p>
                </div>
                <ArrowUpRight className="text-slate-500 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#56D6C9]" size={18} />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="eyebrow">Trazabilidad</p>
              <h2 className="mt-1 text-xl font-black">Ultimas actividades</h2>
            </div>
            <ShieldCheck className="text-[#56D6C9]" />
          </div>
          <div className="space-y-3">
            {recentActivities.map(activity => (
              <article key={activity.id} className="rounded-xl border border-white/10 bg-[#070B10]/55 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <strong>{activity.action}</strong>
                  <StatusBadge status={activity.status} />
                </div>
                <p className="mt-2 text-sm text-slate-400">{activity.description}</p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-slate-500">{activity.module} · {activity.user}</p>
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
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] p-4 transition hover:border-[#B3263A]/50 hover:bg-[#B3263A]/10">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#56D6C9]/10 text-[#56D6C9]">{icon}</span>
      <span className="min-w-0">
        <strong className="block">{title}</strong>
        <span className="block truncate text-sm text-slate-400">{text}</span>
      </span>
    </Link>
  )
}
