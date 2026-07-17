import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, FileDown, Leaf, Minus, Settings, Sparkles, Telescope } from 'lucide-react'
import { Button, Card, EmptyState, Field, Input, PageHeader, ProgressRing, ToastProvider, fadeSlideUp, moduleIdentity, staggerContainer, useCountUp, useToast } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { carbonService } from '../services/carbonService'
import { QuarterlyAnalysisPanel } from '../components/QuarterlyAnalysisPanel'
import type { CarbonStats } from '../types'

const SCOPE_COLOR = { SCOPE_1: '#2563eb', SCOPE_2: '#d97706', SCOPE_3: '#7c3aed' }
const identity = moduleIdentity('carbon-footprint')

function CountUpNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const animated = useCountUp(value, 1400)
  return <>{animated.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="carbon-tooltip">
      <p className="carbon-tooltip-label">{label}</p>
      <p className="carbon-tooltip-value" style={{ color: payload[0].color }}>{Number(payload[0].value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg CO2e</p>
    </div>
  )
}

export default function CarbonDashboardPage() {
  return <ToastProvider><CarbonDashboardContent /></ToastProvider>
}

function CarbonDashboardContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const [stats, setStats] = useState<CarbonStats | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  async function load() {
    setLoading(true)
    try { setStats(await carbonService.stats({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el dashboard') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [dateFrom, dateTo])

  async function handleExportPdf() {
    setExportingPdf(true)
    try { await carbonService.exportPdf({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible exportar el informe') }
    finally { setExportingPdf(false) }
  }

  const scopeTotal = useMemo(() => stats ? stats.byScope.SCOPE_1 + stats.byScope.SCOPE_2 + stats.byScope.SCOPE_3 : 0, [stats])
  const scopePercent = (value: number) => scopeTotal ? Math.round((value / scopeTotal) * 100) : null

  if (loading && !stats) return <div className="carbon-module flex h-64 items-center justify-center"><div className="carbon-skeleton-spinner" /></div>
  if (!stats) return null

  const trendTone = stats.trendPercent == null ? 'flat' : stats.trendPercent < 0 ? 'down' : stats.trendPercent > 0 ? 'up' : 'flat'

  return (
    <div className="carbon-module">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Ambiental"
          title="Huella de Carbono"
          description="Medición de emisiones GEI según GHG Protocol — Herramienta de Monitoreo del Impacto Climático (Salud sin Daño / MinSalud, 2023)"
          identity={identity}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/app/huella-carbono/captura')}><Sparkles size={15} /> Registrar medición</Button>
              <Button variant="secondary" onClick={() => setShowAnalysis(true)}><Telescope size={15} /> Análisis trimestral</Button>
              <Button variant="secondary" disabled={exportingPdf} onClick={handleExportPdf}><FileDown size={15} /> {exportingPdf ? 'Generando...' : 'Informe PDF'}</Button>
              <Button variant="secondary" onClick={() => navigate('/app/huella-carbono/configuracion')}><Settings size={15} /> Configuración</Button>
            </div>
          }
        />

        <Card accent={identity.color} className="carbon-period-bar flex flex-wrap items-end gap-3 p-4">
          <Field label="Desde"><Input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} /></Field>
          {stats.lastUpdated && (
            <span className="carbon-period-badge">
              <Leaf size={13} /> Última actualización: {new Date(stats.lastUpdated).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          )}
        </Card>

        {!stats.total ? (
          <Card accent={identity.color}>
            <EmptyState icon={Leaf} title="Aún no hay mediciones registradas" description="Registra la primera medición de combustión, energía o residuos para ver el dashboard." />
          </Card>
        ) : (
          <motion.div variants={staggerContainer(80)} initial="hidden" animate="visible" className="carbon-bento-grid">
            <motion.div variants={fadeSlideUp} className="carbon-kpi-card bento-item--total">
              <p className="carbon-metric-label">Huella total del período</p>
              <p className="carbon-metric-value"><CountUpNumber value={stats.total} decimals={1} /><span className="carbon-metric-unit">kg CO2e</span></p>
              <span className={`carbon-trend-badge carbon-trend-badge--${trendTone}`}>
                {trendTone === 'down' && <ArrowDown size={14} />}
                {trendTone === 'up' && <ArrowUp size={14} />}
                {trendTone === 'flat' && <Minus size={14} />}
                {stats.trendPercent == null ? 'Sin período anterior para comparar' : `${Math.abs(stats.trendPercent)}% vs. período anterior`}
              </span>
            </motion.div>

            {(['SCOPE_1', 'SCOPE_2', 'SCOPE_3'] as const).map((scope, index) => (
              <motion.div key={scope} variants={fadeSlideUp} className="carbon-kpi-card bento-item--scope">
                <p className="carbon-metric-label">Alcance {index + 1}</p>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressRing percent={scopePercent(stats.byScope[scope])} color={SCOPE_COLOR[scope]} size={56} strokeWidth={7} />
                  <div>
                    <p className="carbon-scope-value" style={{ color: SCOPE_COLOR[scope] }}><CountUpNumber value={stats.byScope[scope]} decimals={1} /></p>
                    <p className="carbon-metric-unit">kg CO2e</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {stats.byBlock.length > 0 && (
          <Card accent={identity.color} className="p-5">
            <h3 className="mb-3 text-base font-bold">Desglose por variable</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byBlock.map(item => ({ name: item.name, kgco2e: item.kgco2e }))} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="carbon-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={identity.gradientFrom} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={identity.gradientTo} stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" opacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} interval={0} angle={-18} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(15,92,63,.05)' }} />
                  <Bar dataKey="kgco2e" fill="url(#carbon-bar-gradient)" radius={[8, 8, 0, 0]} isAnimationActive animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {stats.timeline.length > 1 && (
          <Card accent={identity.color} className="p-5">
            <h3 className="mb-3 text-base font-bold">Evolución en el tiempo</h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.timeline} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" opacity={0.6} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="kgco2e" stroke={identity.color} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive animationDuration={900} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card accent={identity.color} className="p-5">
            <h3 className="mb-2 text-sm font-bold">Indicadores normalizados</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>kg CO2e por paciente atendido</span><strong>{stats.normalized.perPatient ?? 'Dato no disponible'}</strong></div>
              <div className="flex items-center justify-between"><span>kg CO2e por cama ocupada</span><strong>{stats.normalized.perBed ?? 'Dato no disponible'}</strong></div>
              <p className="text-xs text-[var(--muted)]">{stats.normalized.note}</p>
            </div>
          </Card>

          {stats.target && (
            <Card accent={identity.color} className="p-5">
              <h3 className="mb-2 text-sm font-bold">Meta de reducción {stats.target.targetYear}</h3>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between"><span>Línea base ({stats.target.baseYear})</span><strong>{stats.target.baseValue.toLocaleString('es-CO')} kg CO2e</strong></div>
                <div className="flex items-center justify-between"><span>Meta ({stats.target.targetReductionPercent}% de reducción)</span><strong>{Math.round(stats.target.expectedValue).toLocaleString('es-CO')} kg CO2e</strong></div>
                <div className="flex items-center justify-between"><span>Actual</span><strong style={{ color: stats.target.onTrack ? '#0ca678' : '#dc2626' }}>{Math.round(stats.target.currentValue).toLocaleString('es-CO')} kg CO2e</strong></div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {showAnalysis && <QuarterlyAnalysisPanel canManage={Boolean(session?.permissions.includes('carbon.manage'))} onClose={() => setShowAnalysis(false)} />}
    </div>
  )
}
