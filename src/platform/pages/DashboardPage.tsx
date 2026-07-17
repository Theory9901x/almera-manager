import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle2, ClipboardCheck, ClipboardList, FileCheck2, FilePlus2, Gauge, Headphones, LayoutDashboard, Upload, Users,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { api } from '@/platform/api'
import { listAlmeraRecords } from '@/modules/almera/services/almeraService'
import type { AlmeraRecord } from '@/modules/almera/types'
import { adherenceService } from '@/modules/adherence/services/adherenceService'
import type { EvaluationSummary, ImprovementPlan } from '@/modules/adherence/types'
import { PlanStatusBadge } from '@/modules/adherence/design/PlanStatusBadge'
import {
  Card, EmptyState, PageHeader, ProgressRing, SemaphoreBadge, StatCard,
  fadeSlideUp, moduleIdentity, semaphoreLevel, staggerContainer,
} from '@/design-system'

function greetingMessage(name: string) {
  const hour = new Date().getHours()
  const salute = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  return `${salute}, ${name.split(' ')[0]}`
}

const dateLabel = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

export default function DashboardPage() {
  const { session } = useAuth()
  if (!session) return null

  const isAdminTier = session.role.key === 'SUPERADMIN' || session.role.key === 'ADMIN'
  const isProfesional = session.permissions.includes('adherence_matrix.own_plan')
  const isAuditor = session.permissions.includes('adherence_matrix.evaluate')
  const hasAlmera = session.modules.some(module => ['almera', 'technical-assistances'].includes(module.key))
  const hasAudits = session.modules.some(module => ['internal-audits', 'audits'].includes(module.key))
  const hasAnyRoleBlock = isAdminTier || isProfesional || isAuditor

  const identity = moduleIdentity(isAdminTier ? 'admin' : isAuditor ? 'adherence-matrix' : isProfesional ? 'adherence-matrix' : 'almera')

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={session.organization.name}
        title={greetingMessage(session.user.fullName)}
        description={`${session.role.name}${session.position ? ` · ${session.position.name}` : ''} · ${dateLabel}`}
        identity={identity}
      />

      <motion.div variants={staggerContainer()} initial="hidden" animate="visible" className="space-y-6">
        {isProfesional && <motion.div variants={fadeSlideUp}><ProfesionalHome /></motion.div>}
        {isAuditor && <motion.div variants={fadeSlideUp}><AuditorHome membershipId={session.membershipId} /></motion.div>}
        {isAdminTier && <motion.div variants={fadeSlideUp}><AdminHome /></motion.div>}

        {!hasAnyRoleBlock && (
          <motion.div variants={fadeSlideUp}>
            <Card accent={identity.color}>
              <p className="ds-eyebrow">Accesos rápidos</p>
              <h2 className="mt-1 text-lg font-black">Tus módulos</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {hasAlmera && <QuickAccessCard to="/app/modulos/almera" icon={Headphones} label="Gestión ALMERA" detail="Solicitudes y asistencias técnicas" identity={moduleIdentity('almera')} />}
                {hasAudits && <QuickAccessCard to="/app/modulos/internal-audits" icon={ClipboardCheck} label="Auditorías" detail="Planes y hallazgos" identity={moduleIdentity('internal-audits')} />}
                {!hasAlmera && !hasAudits && <EmptyState icon={LayoutDashboard} title="Sin módulos habilitados" description="Pide al administrador que te habilite un módulo desde Usuarios." />}
              </div>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

// Agrupa accesos rapidos por area (operativa / calidad / administracion) con un titulo y una linea
// divisoria — a medida que se agreguen mas modulos (ej. Huella de Carbono), cada uno entra en su
// grupo correspondiente en vez de sumarse a una sola fila larga sin separacion visual.
function DashboardSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dashboard-section">
      <p className="dashboard-section-label">{label}</p>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  )
}

function QuickAccessCard({ to, icon: Icon, label, detail, identity }: { to: string; icon: typeof Headphones; label: string; detail: string; identity: ReturnType<typeof moduleIdentity> }) {
  return (
    <Link to={to} viewTransition className="ds-card flex items-center gap-3 transition hover:-translate-y-0.5" style={{ padding: '14px 16px' }}>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-xl text-white" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}><Icon size={18} /></span>
      <span className="min-w-0">
        <strong className="block text-sm">{label}</strong>
        <span className="block text-xs text-[var(--muted)]">{detail}</span>
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Profesional (auditado)
// ---------------------------------------------------------------------------

function ProfesionalHome() {
  const identity = moduleIdentity('adherence-matrix')
  const [plans, setPlans] = useState<ImprovementPlan[] | null>(null)
  const [evaluations, setEvaluations] = useState<EvaluationSummary[] | null>(null)
  const [notLinked, setNotLinked] = useState(false)

  useEffect(() => {
    adherenceService.myPlans().then(setPlans).catch(caught => {
      if (caught instanceof Error && caught.message.includes('vinculada')) setNotLinked(true)
    })
    adherenceService.myEvaluations().then(setEvaluations).catch(() => {})
  }, [])

  if (notLinked) return null
  if (!plans || !evaluations) return null

  const activePlans = plans.filter(plan => plan.status !== 'TERMINADO').slice(0, 4)
  const recentEvaluations = evaluations.slice(0, 3)

  return (
    <div className="space-y-4">
      <Card accent={identity.color}>
        <div className="flex items-center justify-between">
          <div>
            <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: identity.color }}>Matrices de adherencia</p>
            <h2 className="mt-1 text-lg font-black">Mis planes de mejora</h2>
          </div>
          <Link to="/app/adherencia/mis-planes" viewTransition className="text-xs font-bold" style={{ color: identity.color }}>Ver todos →</Link>
        </div>
        {activePlans.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activePlans.map(plan => (
              <Link key={plan.id} to="/app/adherencia/mis-planes" viewTransition className="ds-card flex items-center gap-3" style={{ padding: '14px 16px' }}>
                <ProgressRing percent={plan.progress_percent} size={38} strokeWidth={4} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{plan.area_name}</strong>
                  <span className="block truncate text-xs text-[var(--muted)]">{plan.month_reported}</span>
                </span>
                <PlanStatusBadge status={plan.status} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3"><EmptyState icon={CheckCircle2} title="No tienes planes de mejora pendientes" description="Cuando un auditor te asigne uno, aparecerá aquí." /></div>
        )}
      </Card>

      <Card>
        <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: identity.color }}>Resultados</p>
        <h2 className="mt-1 text-lg font-black">Mis resultados de auditoría</h2>
        {recentEvaluations.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {recentEvaluations.map(evaluation => (
              <div key={evaluation.id} className="ds-card" style={{ padding: '14px 16px' }}>
                <div className="flex items-center gap-3">
                  <ProgressRing percent={evaluation.overall_compliance} size={34} strokeWidth={4} />
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{evaluation.area_name}</strong>
                    <span className="block truncate text-xs text-[var(--muted)]">{evaluation.month_reported}</span>
                  </div>
                </div>
                <div className="mt-2"><SemaphoreBadge level={semaphoreLevel(evaluation.overall_compliance)} size="sm" /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3"><EmptyState icon={FileCheck2} title="Aún no tienes evaluaciones registradas" /></div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auditor
// ---------------------------------------------------------------------------

function AuditorHome({ membershipId }: { membershipId: string }) {
  const identity = moduleIdentity('adherence-matrix')
  const [evaluations, setEvaluations] = useState<EvaluationSummary[] | null>(null)

  useEffect(() => { adherenceService.evaluations().then(setEvaluations).catch(() => {}) }, [])

  if (!evaluations) return null

  const mine = evaluations.filter(item => item.evaluator_membership_id === membershipId)
  const drafts = mine.filter(item => item.status === 'DRAFT').slice(0, 4)
  const now = new Date()
  const closedThisMonth = mine.filter(item => item.status === 'CLOSED' && new Date(item.evaluation_date).getMonth() === now.getMonth() && new Date(item.evaluation_date).getFullYear() === now.getFullYear())
  const withCompliance = closedThisMonth.filter(item => item.overall_compliance !== null)
  const averageCompliance = withCompliance.length ? withCompliance.reduce((sum, item) => sum + Number(item.overall_compliance), 0) / withCompliance.length : null

  return (
    <div className="space-y-4">
      <Card accent={identity.color}>
        <div className="flex items-center justify-between">
          <div>
            <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: identity.color }}>Matrices de adherencia</p>
            <h2 className="mt-1 text-lg font-black">Mis evaluaciones en borrador</h2>
          </div>
          <Link to="/app/adherencia/operacion" viewTransition className="text-xs font-bold" style={{ color: identity.color }}>Ir a Operación →</Link>
        </div>
        {drafts.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {drafts.map(evaluation => (
              <Link key={evaluation.id} to="/app/adherencia/operacion" viewTransition className="ds-card flex items-center justify-between gap-3" style={{ padding: '14px 16px' }}>
                <span className="min-w-0">
                  <strong className="block truncate text-sm">{evaluation.professional_name}</strong>
                  <span className="block truncate text-xs text-[var(--muted)]">{evaluation.area_name} · {evaluation.month_reported}</span>
                </span>
                <ClipboardList size={16} style={{ color: identity.color }} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3"><EmptyState icon={CheckCircle2} title="No tienes evaluaciones en borrador" description="Todas tus evaluaciones están cerradas." /></div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard icon={Gauge} label="Evaluaciones cerradas este mes" value={closedThisMonth.length} identity={identity} />
        <StatCard icon={ClipboardCheck} label="Cumplimiento promedio auditado" value={averageCompliance === null ? '—' : `${averageCompliance.toFixed(1)}%`} identity={identity} />
      </div>

      <div className="flex flex-wrap gap-3">
        <QuickAccessCard to="/app/adherencia/operacion" icon={FilePlus2} label="Nueva evaluación" detail="Calificar historia clínica" identity={identity} />
        <QuickAccessCard to="/app/adherencia/operacion?tab=dashboard" icon={LayoutDashboard} label="Dashboard" detail="Cumplimiento por ámbito" identity={identity} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Administrador
// ---------------------------------------------------------------------------

function AdminHome() {
  const identity = moduleIdentity('admin')
  const [userCount, setUserCount] = useState<number | null>(null)
  const [records, setRecords] = useState<AlmeraRecord[] | null>(null)

  useEffect(() => {
    api.adminOverview().then(overview => setUserCount(overview.users.filter(user => user.active).length)).catch(() => {})
    listAlmeraRecords().then(setRecords).catch(() => {})
  }, [])

  const total = records?.length ?? 0
  const inReview = records?.filter(record => record.status === 'IN_REVIEW').length ?? 0
  const closed = records?.filter(record => record.status === 'CLOSED' || record.status === 'APPROVED').length ?? 0

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Usuarios activos" value={userCount ?? '—'} identity={identity} />
        <StatCard icon={Headphones} label="Solicitudes ALMERA" value={total} identity={moduleIdentity('almera')} />
        <StatCard icon={ClipboardList} label="Pendientes por revisar" value={inReview} identity={moduleIdentity('almera')} />
        <StatCard icon={CheckCircle2} label="Cerradas con trazabilidad" value={closed} identity={moduleIdentity('almera')} />
      </div>

      <DashboardSection label="Gestión operativa">
        <QuickAccessCard to="/app/modulos/almera" icon={FilePlus2} label="Nuevo registro" detail="Gestión ALMERA" identity={moduleIdentity('almera')} />
      </DashboardSection>

      <DashboardSection label="Calidad y auditoría">
        <QuickAccessCard to="/app/adherencia/configuracion" icon={Upload} label="Matrices de Adherencia" detail="Áreas, matrices, auditores" identity={moduleIdentity('adherence-matrix')} />
      </DashboardSection>

      <DashboardSection label="Administración">
        <QuickAccessCard to="/app/administracion/users" icon={Users} label="Usuarios y roles" detail="Acceso y permisos" identity={identity} />
      </DashboardSection>
    </div>
  )
}
