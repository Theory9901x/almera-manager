import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Building2, Calendar, CheckCircle2, ClipboardCheck, ClipboardList, FileCheck2, FilePlus2, Gauge, Headphones,
  LayoutDashboard, PieChart, ShieldCheck, Upload, Users,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { api } from '@/platform/api'
import { listAlmeraRecords } from '@/modules/almera/services/almeraService'
import type { AlmeraRecord } from '@/modules/almera/types'
import { adherenceService } from '@/modules/adherence/services/adherenceService'
import type { EvaluationSummary, ImprovementPlan } from '@/modules/adherence/types'
import { PlanStatusBadge } from '@/modules/adherence/design/PlanStatusBadge'
import {
  BarChart, Card, DonutChart, EmptyState, LineChart, ModuleHero, ProgressRing, SEMAPHORE_COLORS, SemaphoreBadge, StatCard,
  fadeSlideUp, moduleIdentity, semaphoreLevel, staggerContainer,
} from '@/design-system'

function greetingMessage(name: string) {
  const hour = new Date().getHours()
  const salute = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  return `${salute}, ${name.split(' ')[0]}`
}

const rawDateLabel = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
const dateLabel = rawDateLabel.charAt(0).toUpperCase() + rawDateLabel.slice(1)

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
      <ModuleHero
        badge={session.organization.name}
        title={greetingMessage(session.user.fullName)}
        subtitle="Resumen ejecutivo del sistema y accesos estratégicos"
        accent={identity.color}
      >
        <div className="hero-chip-row">
          <div className="hero-chip">
            <span className="ic"><Calendar size={14} /></span>
            <span><span className="lbl block">Hoy es</span><span className="val">{dateLabel}</span></span>
          </div>
          <div className="hero-chip">
            <span className="ic"><Building2 size={14} /></span>
            <span><span className="lbl block">Entidad activa</span><span className="val">{session.organization.name}</span></span>
          </div>
          <div className="hero-chip">
            <span className="ic"><ShieldCheck size={14} /></span>
            <span><span className="lbl block">Tu rol</span><span className="val">{session.role.name}{session.position ? ` · ${session.position.name}` : ''}</span></span>
          </div>
        </div>
      </ModuleHero>

      <motion.div variants={staggerContainer()} initial="hidden" animate="visible" className="space-y-6">
        {/* Admin-tier hereda TODOS los permisos automaticamente (§3 CLAUDE.md), asi que
            `isProfesional`/`isAuditor` tambien darian true para el — pero su vista es AdminHome,
            no las personales. Sin el `!isAdminTier` aqui, un superadmin veia su propio bloque de
            auditor (casi siempre vacio, porque no es evaluador de nadie) apilado ENCIMA del
            resumen de la entidad: dos tarjetas de "cumplimiento promedio auditado" a la vez. */}
        {isProfesional && !isAdminTier && <motion.div variants={fadeSlideUp}><ProfesionalHome /></motion.div>}
        {isAuditor && !isAdminTier && <motion.div variants={fadeSlideUp}><AuditorHome membershipId={session.membershipId} /></motion.div>}
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

function QuickAccessCard({ to, icon: Icon, label, detail, identity }: { to: string; icon: typeof Headphones; label: string; detail: string; identity: ReturnType<typeof moduleIdentity> }) {
  return (
    <Link to={to} className="ds-card flex items-center gap-3 transition hover:-translate-y-0.5" style={{ padding: '14px 16px' }}>
      <span className="action-icon" style={{ ['--module-color' as string]: identity.color }}><Icon size={18} /></span>
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
          <Link to="/app/adherencia/mis-planes" className="text-xs font-bold" style={{ color: identity.color }}>Ver todos →</Link>
        </div>
        {activePlans.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {activePlans.map(plan => (
              <Link key={plan.id} to="/app/adherencia/mis-planes" className="ds-card flex items-center gap-3" style={{ padding: '14px 16px' }}>
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
          <Link to="/app/adherencia/operacion" className="text-xs font-bold ds-accent-link" style={{ ['--row-accent' as string]: identity.color }}>Ir a Operación →</Link>
        </div>
        {drafts.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {drafts.map(evaluation => (
              <Link key={evaluation.id} to="/app/adherencia/operacion" className="ds-card flex items-center justify-between gap-3" style={{ padding: '14px 16px' }}>
                <span className="min-w-0">
                  <span className="dashboard-card-category" style={{ ['--card-category-color' as string]: identity.color }}>{evaluation.area_name}</span>
                  <strong className="block truncate text-sm">{evaluation.professional_name}</strong>
                  <span className="block truncate text-xs text-[var(--muted)]">{evaluation.month_reported}</span>
                </span>
                <ClipboardList size={16} style={{ color: identity.color }} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3"><EmptyState icon={CheckCircle2} title="No tienes evaluaciones en borrador" description="Todas tus evaluaciones están cerradas." /></div>
        )}
      </Card>

      {/* Cumplimiento promedio es la metrica que resume el desempeno del mes — protagonista en
          highlight-box, "evaluaciones cerradas" queda secundaria. */}
      <div className="ds-bento-split">
        <div className="ds-bento-item ds-bento-hero highlight-box" style={{ ['--highlight-accent' as string]: identity.color }}>
          <StatCard icon={ClipboardCheck} label="Cumplimiento promedio auditado" value={averageCompliance === null ? '—' : `${averageCompliance.toFixed(1)}%`} identity={identity} />
        </div>
        <div className="ds-bento-secondary-grid">
          <StatCard icon={Gauge} label="Evaluaciones cerradas este mes" value={closedThisMonth.length} identity={identity} />
        </div>
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

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function AdminHome() {
  const identity = moduleIdentity('admin')
  const almeraIdentity = moduleIdentity('almera')
  const matrixIdentity = moduleIdentity('adherence-matrix')
  const [userCount, setUserCount] = useState<number | null>(null)
  const [records, setRecords] = useState<AlmeraRecord[] | null>(null)
  const [evaluations, setEvaluations] = useState<EvaluationSummary[] | null>(null)

  useEffect(() => {
    api.adminOverview().then(overview => setUserCount(overview.users.filter(user => user.active).length)).catch(() => {})
    listAlmeraRecords().then(setRecords).catch(() => {})
    adherenceService.evaluations().then(setEvaluations).catch(() => setEvaluations([]))
  }, [])

  const almeraTotal = records?.length ?? 0
  const almeraInReview = records?.filter(record => record.status === 'IN_REVIEW').length ?? 0
  const almeraClosed = records?.filter(record => record.status === 'CLOSED' || record.status === 'APPROVED').length ?? 0

  const now = new Date()
  const drafts = evaluations?.filter(item => item.status === 'DRAFT') ?? []
  const closed = evaluations?.filter(item => item.status === 'CLOSED') ?? []
  const closedThisMonth = closed.filter(item => new Date(item.evaluation_date).getMonth() === now.getMonth() && new Date(item.evaluation_date).getFullYear() === now.getFullYear())
  const withCompliance = closed.filter(item => item.overall_compliance !== null)
  const averageCompliance = withCompliance.length ? withCompliance.reduce((sum, item) => sum + Number(item.overall_compliance), 0) / withCompliance.length : null

  // Recorrido unico sobre `closed`: se reparten en los 4 baldes del semaforo (§5.1), nunca el
  // color de identidad del modulo — un 92% se ve del mismo verde en cualquier parte del sistema.
  const levelCounts: Record<string, number> = { OPTIMO: 0, ACEPTABLE: 0, DEFICIENTE: 0, MUY_DEFICIENTE: 0 }
  withCompliance.forEach(item => { const level = semaphoreLevel(Number(item.overall_compliance)); if (level) levelCounts[level] += 1 })
  const levelDonutData = [
    { label: 'Óptimo', value: levelCounts.OPTIMO, color: SEMAPHORE_COLORS.OPTIMO },
    { label: 'Aceptable', value: levelCounts.ACEPTABLE, color: SEMAPHORE_COLORS.ACEPTABLE },
    { label: 'Deficiente', value: levelCounts.DEFICIENTE, color: SEMAPHORE_COLORS.DEFICIENTE },
    { label: 'Muy deficiente', value: levelCounts.MUY_DEFICIENTE, color: SEMAPHORE_COLORS.MUY_DEFICIENTE },
  ].filter(item => item.value > 0)

  // Carga por area: cuantos borradores (trabajo sin cerrar) tiene cada area, de mayor a menor.
  // Es el dato que responde "¿donde hay que empujar para que se cierren evaluaciones?".
  const byArea = new Map<string, number>()
  drafts.forEach(item => byArea.set(item.area_name, (byArea.get(item.area_name) || 0) + 1))
  const areaBarData = [...byArea.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }))

  // Evolucion mensual: cerradas por mes, ultimos 6 meses — una sola serie, que es lo que soporta
  // el LineChart compartido (no hay componente de multi-serie en el sistema, y no se improvisa uno).
  const monthlyLine = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    const count = closed.filter(item => {
      const d = new Date(item.evaluation_date)
      return d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear()
    }).length
    return { label: MONTH_LABELS[date.getMonth()], value: count }
  })

  const recentDrafts = [...drafts]
    .sort((a, b) => new Date(b.evaluation_date).getTime() - new Date(a.evaluation_date).getTime())
    .slice(0, 4)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard icon={ClipboardList} label="Evaluaciones en borrador" value={evaluations ? drafts.length : '—'} identity={matrixIdentity} />
        <StatCard icon={ClipboardCheck} label="Cumplimiento promedio auditado" value={averageCompliance === null ? '—' : `${averageCompliance.toFixed(0)}%`} identity={matrixIdentity} />
        <StatCard icon={ClipboardList} label="Pendientes por revisar" value={almeraInReview} identity={almeraIdentity} />
        <StatCard icon={Gauge} label="Evaluaciones cerradas este mes" value={evaluations ? closedThisMonth.length : '—'} identity={matrixIdentity} />
        <StatCard icon={Users} label="Usuarios activos" value={userCount ?? '—'} identity={identity} />
        <StatCard icon={Headphones} label="Solicitudes ALMERA" value={almeraTotal} identity={almeraIdentity} />
        <StatCard icon={CheckCircle2} label="Trazabilidad cerrada" value={almeraClosed} identity={almeraIdentity} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <Card accent={matrixIdentity.color}>
          <div className="flex items-center justify-between">
            <div>
              <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: matrixIdentity.color }}>Matrices de adherencia</p>
              <h2 className="mt-1 text-lg font-black">Actividad reciente</h2>
            </div>
            <Link to="/app/adherencia/operacion" className="text-xs font-bold ds-accent-link" style={{ ['--row-accent' as string]: matrixIdentity.color }}>Ver todas →</Link>
          </div>
          {recentDrafts.length ? (
            <div className="mt-4 space-y-2">
              {recentDrafts.map(evaluation => (
                <div key={evaluation.id} className="ds-card flex items-center justify-between gap-3" style={{ padding: '12px 16px' }}>
                  <span className="min-w-0">
                    <span className="dashboard-card-category" style={{ ['--card-category-color' as string]: matrixIdentity.color }}>{evaluation.area_name}</span>
                    <strong className="block truncate text-sm">{evaluation.professional_name}</strong>
                    <span className="block truncate text-xs text-[var(--muted)]">{evaluation.month_reported}</span>
                  </span>
                  <Link to="/app/adherencia/operacion" className="row-action" style={{ ['--row-accent' as string]: matrixIdentity.color }}>Continuar →</Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3"><EmptyState icon={CheckCircle2} title="Sin evaluaciones en borrador" description="Toda la entidad tiene sus evaluaciones cerradas." /></div>
          )}
        </Card>

        <Card>
          <p className="ds-eyebrow">Accesos rápidos</p>
          <h2 className="mt-1 text-lg font-black">Ir directo a...</h2>
          <div className="mt-4 grid gap-3">
            <QuickAccessCard to="/app/adherencia/operacion" icon={FilePlus2} label="Nueva evaluación" detail="Calificar historia clínica" identity={matrixIdentity} />
            <QuickAccessCard to="/app/adherencia/operacion?tab=dashboard" icon={LayoutDashboard} label="Dashboard por ámbito" detail="Cumplimiento y métricas" identity={matrixIdentity} />
            <QuickAccessCard to="/app/modulos/almera" icon={FilePlus2} label="Nuevo registro ALMERA" detail="Gestión operativa" identity={almeraIdentity} />
            <QuickAccessCard to="/app/adherencia/configuracion" icon={Upload} label="Matrices de adherencia" detail="Áreas, matrices, auditores" identity={matrixIdentity} />
            <QuickAccessCard to="/app/administracion/users" icon={Users} label="Usuarios y roles" detail="Accesos y permisos" identity={identity} />
            <QuickAccessCard to="/app/administracion/settings" icon={ClipboardList} label="Configuración" detail="Parámetros del sistema" identity={identity} />
          </div>
        </Card>
      </div>

      <div>
        <div className="dashboard-section-header">
          <span className="dashboard-section-dot" style={{ ['--pill-color' as string]: matrixIdentity.color }} aria-hidden="true" />
          <h2 className="dashboard-section-title">Panorama operativo</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <p className="ds-eyebrow">Cumplimiento por nivel</p>
            <h3 className="mt-1 text-sm font-bold">Evaluaciones cerradas y calificadas</h3>
            {levelDonutData.length ? (
              <div className="mt-3"><DonutChart data={levelDonutData} centerLabel="cerradas" height={200} /></div>
            ) : <div className="mt-3"><EmptyState icon={PieChart} title="Sin datos suficientes" /></div>}
          </Card>
          <Card>
            <p className="ds-eyebrow">Evolución mensual</p>
            <h3 className="mt-1 text-sm font-bold">Evaluaciones cerradas por mes</h3>
            <div className="mt-3"><LineChart data={monthlyLine} color={matrixIdentity.color} height={200} /></div>
          </Card>
          <Card>
            <p className="ds-eyebrow">Carga de trabajo</p>
            <h3 className="mt-1 text-sm font-bold">Borradores pendientes por área</h3>
            {areaBarData.length ? (
              <div className="mt-3"><BarChart data={areaBarData} orientation="horizontal" color={matrixIdentity.color} height={200} /></div>
            ) : <div className="mt-3"><EmptyState icon={ClipboardList} title="Sin borradores pendientes" /></div>}
          </Card>
        </div>
      </div>
    </div>
  )
}
