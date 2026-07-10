import { Download, FileText, Plus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/platform/auth/AuthContext'
import { ALMERA_STATUS_LABELS, ALMERA_TYPE_LABELS } from '@/modules/almera/constants'
import { listAlmeraRecords } from '@/modules/almera/services/almeraService'
import type { AlmeraRecord } from '@/modules/almera/types'
import { recentActivities } from '@/shared/services/activityService'
import { Badge, Button, Card, PageHeader, StatusBadge } from '@/shared/ui'

const executiveMetrics = [
  ['Usuarios activos', '18', 'Acceso institucional'],
  ['Solicitudes ALMERA', '24', 'Registradas este mes'],
  ['Pendientes', '7', 'Por revisar'],
  ['Cerradas', '9', 'Con trazabilidad'],
] as const

export default function DashboardPage() {
  const { session } = useAuth()
  const [records, setRecords] = useState<AlmeraRecord[]>([])

  useEffect(() => { void listAlmeraRecords().then(setRecords) }, [])

  const visibleRecords = useMemo(() => records.slice(0, 5), [records])
  if (!session) return null

  const canAdmin = session.permissions.includes('admin.view') || session.modules.some(module => module.key === 'admin')

  return (
    <div className="dashboard-page mx-auto max-w-7xl space-y-5">
      <PageHeader
        eyebrow={session.organization.name}
        title="Inicio"
        description="Resumen operativo de usuarios, Gestion ALMERA, pendientes y actividad reciente."
        actions={<Link to="/app/modulos/almera"><Button><Plus size={16} /> Nuevo registro</Button></Link>}
      />

      <section className="summary-strip">
        <div>
          <span>Entidad activa</span>
          <strong>{session.organization.name}</strong>
        </div>
        <div>
          <span>Estado</span>
          <strong>Sistema operativo</strong>
        </div>
        <div>
          <span>Rol actual</span>
          <strong>{session.role.name}</strong>
        </div>
        <div>
          <span>Usuario</span>
          <strong>{session.user.fullName}</strong>
        </div>
      </section>

      <section className="metric-strip">
        {executiveMetrics.map(([label, value, detail]) => (
          <article key={label} className="stat-card">
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{detail}</span>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <div className="section-toolbar">
            <div>
              <p className="eyebrow">Gestion ALMERA</p>
              <h2>Solicitudes recientes</h2>
            </div>
            <div className="section-actions">
              <Link to="/app/modulos/almera"><Button><Plus size={16} /> Nuevo registro</Button></Link>
              <Button variant="secondary"><Download size={16} /> Exportar</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Solicitud</th>
                  <th>Proceso / documento</th>
                  <th>Tipo</th>
                  <th>Responsable</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map(record => (
                  <tr key={record.id}>
                    <td>
                      <strong className="block">{record.id}</strong>
                      <span className="text-sm text-slate-400">{record.request}</span>
                    </td>
                    <td>
                      <strong className="block">{record.process}</strong>
                      <span className="text-sm text-slate-400">{record.document}</span>
                    </td>
                    <td><Badge tone="accent">{ALMERA_TYPE_LABELS[record.managementType]}</Badge></td>
                    <td>{record.responsible}</td>
                    <td><StatusBadge status={ALMERA_STATUS_LABELS[record.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="section-toolbar compact">
            <div>
              <p className="eyebrow">Actividad</p>
              <h2>Reciente</h2>
            </div>
            <Badge tone="info">{recentActivities.length}</Badge>
          </div>
          <div className="activity-list">
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
        </Card>
      </section>

      <section className="quick-row">
        <Link to="/app/modulos/almera" className="quick-card"><FileText size={18} /><span><strong>Gestion ALMERA</strong><small>Solicitudes y evidencias</small></span></Link>
        {canAdmin && <Link to="/app/administracion/users" className="quick-card"><Users size={18} /><span><strong>Usuarios y roles</strong><small>Acceso y permisos</small></span></Link>}
        <Link to="/app/modulos/reports" className="quick-card"><FileText size={18} /><span><strong>Informes</strong><small>Seguimiento institucional</small></span></Link>
      </section>
    </div>
  )
}
