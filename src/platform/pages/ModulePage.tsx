import { BarChart3, Download, FileBarChart2, Layers3 } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, Button, Card, PageHeader, StatCard, Table, moduleIdentity } from '@/design-system'
import GestionAlmeraWorkspace from '@/platform/pages/GestionAlmeraWorkspace'

const gestionAlmeraKeys = ['almera', 'technical-assistances', 'internal-audits', 'audits']

export default function ModulePage() {
  const { moduleKey } = useParams()
  const { session } = useAuth()
  const module = session?.modules.find(item => item.key === moduleKey)
  if (!module) return <Navigate to="/app" replace />
  if (module.key === 'adherence-matrix') {
    const permissions = session?.permissions || []
    if (permissions.includes('adherence_matrix.manage')) return <Navigate to="/app/adherencia/configuracion" replace />
    if (permissions.includes('adherence_matrix.evaluate')) return <Navigate to="/app/adherencia/operacion" replace />
    if (permissions.includes('adherence_matrix.own_plan')) return <Navigate to="/app/adherencia/mis-planes" replace />
    return <Navigate to="/app" replace />
  }
  if (gestionAlmeraKeys.includes(module.key)) return <GestionAlmeraWorkspace />
  if (module.key === 'reports') return <ReportsPage />
  return <GenericModule module={module} />
}

function GenericModule({ module }: { module: { name: string; description: string; key: string } }) {
  const identity = moduleIdentity(module.key)
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader eyebrow="Modulo preparado" title={module.name} description={module.description} actions={<Badge tone="info">Fase inicial</Badge>} identity={identity} />
      <Card accent={identity.color} className="p-8">
        <h2 className="text-xl font-black">Estructura lista para crecimiento gradual</h2>
        <p className="mt-3 max-w-3xl text-[var(--muted)]">Este espacio queda conectado a navegacion, permisos y catalogo modular. La siguiente fase puede agregar tablas, formularios y servicios propios sin reescribir la base administrativa.</p>
      </Card>
    </div>
  )
}

function ReportsPage() {
  const identity = moduleIdentity('reports')
  const reports = [
    ['INF-2026-07', 'Seguimiento mensual ALMERA', 'Julio 2026', 'Borrador', '86%'],
    ['INF-2026-06', 'Solicitudes documentales cerradas', 'Junio 2026', 'Listo', '100%'],
    ['INF-2026-Q2', 'Resumen institucional de evidencias', 'Trimestre II', 'En armado', '61%'],
  ]
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Informes basicos"
        title="Seguimiento e informes"
        description="Vista inicial para consolidar actividades ALMERA, estados de gestion, evidencias e indicadores basicos."
        actions={<Button identity={identity}><Download size={16} /> Generar informe</Button>}
        identity={identity}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Borradores" value="2" detail="Pendientes de revision" identity={identity} />
        <StatCard label="Listos" value="5" detail="Disponibles para consulta" identity={identity} />
        <StatCard label="Indicador ALMERA" value="86%" detail="Avance mensual" identity={identity} />
        <StatCard label="Evidencias" value="38" detail="Registradas este mes" identity={identity} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card accent={identity.color} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] p-5">
            <div>
              <p className="ds-eyebrow">Consolidado</p>
              <h2 className="mt-1 text-xl font-black">Bandeja de informes</h2>
            </div>
            <Badge tone="info">{reports.length} registros</Badge>
          </div>
          <Table>
            <thead><tr><th>Codigo</th><th>Informe</th><th>Periodo</th><th>Estado</th><th>Avance</th></tr></thead>
            <tbody>{reports.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 3 ? <Badge tone={cell === 'Listo' ? 'info' : 'neutral'}>{cell}</Badge> : cell}</td>)}</tr>)}</tbody>
          </Table>
        </Card>

        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Lectura ejecutiva</p>
          <div className="mt-5 space-y-3">
            {[
              ['Solicitudes en revision', '4', FileBarChart2],
              ['Pendientes de evidencia', '9', Layers3],
              ['Cierre documental', '75%', BarChart3],
            ].map(([label, value, Icon]) => (
              <article key={label as string} className="ds-card flex items-center gap-3" style={{ padding: '14px 16px' }}>
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl text-white" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block">{value as string}</strong>
                  <small className="text-[var(--muted)]">{label as string}</small>
                </span>
              </article>
            ))}
          </div>
        </Card>
      </section>
    </div>
  )
}
