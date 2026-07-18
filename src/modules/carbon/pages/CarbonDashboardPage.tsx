import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, FileDown, Leaf, Minus, Settings, Sparkles, Telescope } from 'lucide-react'
import { BarChart, Button, Card, DatePicker, EmptyState, Field, Input, LineChart, ModuleHero, RadialGauge, Select, ToastProvider, fadeSlideUp, moduleIdentity, staggerContainer, useCountUp, useToast } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { carbonService } from '../services/carbonService'
import { QuarterlyAnalysisPanel } from '../components/QuarterlyAnalysisPanel'
import type { CarbonStats } from '../types'

const SCOPE_COLOR = { SCOPE_1: '#2563eb', SCOPE_2: '#d97706', SCOPE_3: '#7c3aed' }
const SCOPE_COLOR_LIGHT = { SCOPE_1: '#60a5fa', SCOPE_2: '#fbbf24', SCOPE_3: '#a78bfa' }
const SCOPE_NAME = { SCOPE_1: 'Emisiones directas', SCOPE_2: 'Energía comprada', SCOPE_3: 'Cadena de valor' }
const identity = moduleIdentity('carbon-footprint')

const MONTH_OPTIONS = [
  '01 · Enero', '02 · Febrero', '03 · Marzo', '04 · Abril', '05 · Mayo', '06 · Junio',
  '07 · Julio', '08 · Agosto', '09 · Septiembre', '10 · Octubre', '11 · Noviembre', '12 · Diciembre',
].map((label, index) => ({ value: String(index + 1), label }))
const QUARTER_OPTIONS = [1, 2, 3, 4].map(n => ({ value: String(n), label: `Trimestre ${n}` }))
const SEMESTER_OPTIONS = [1, 2].map(n => ({ value: String(n), label: `Semestre ${n}` }))

type PeriodPreset = 'custom' | 'month' | 'quarter' | 'semester' | 'year'

function pad(value: number) { return String(value).padStart(2, '0') }
function lastDayOf(year: number, month: number) { return new Date(year, month, 0).getDate() }

function presetRange(preset: PeriodPreset, year: number, index: number): { from: string; to: string } | null {
  if (preset === 'month') return { from: `${year}-${pad(index)}-01`, to: `${year}-${pad(index)}-${pad(lastDayOf(year, index))}` }
  if (preset === 'quarter') {
    const startMonth = (index - 1) * 3 + 1
    const endMonth = startMonth + 2
    return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDayOf(year, endMonth))}` }
  }
  if (preset === 'semester') {
    const startMonth = (index - 1) * 6 + 1
    const endMonth = startMonth + 5
    return { from: `${year}-${pad(startMonth)}-01`, to: `${year}-${pad(endMonth)}-${pad(lastDayOf(year, endMonth))}` }
  }
  if (preset === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
  return null
}

function CountUpNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const animated = useCountUp(value, 1400)
  return <>{animated.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>
}

function ScopeRadialCard({ label, name, percent, kg, color, colorLight }: { label: string; name: string; percent: number | null; kg: number; color: string; colorLight: string }) {
  return (
    <motion.div variants={fadeSlideUp} className="carbon-kpi-card bento-item--scope carbon-scope-card">
      <p className="carbon-metric-label">{label}</p>
      <div className="carbon-radial-wrap">
        <RadialGauge percent={percent ?? 0} color={color} gradientTo={colorLight} size={104} />
      </div>
      <p className="carbon-scope-value" style={{ color }}><CountUpNumber value={kg} decimals={1} /><span className="carbon-metric-unit">kg CO2e</span></p>
      <p className="carbon-scope-name">{name}</p>
    </motion.div>
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
  const [preset, setPreset] = useState<PeriodPreset>('custom')
  const [presetYear, setPresetYear] = useState(new Date().getFullYear())
  const [presetIndex, setPresetIndex] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)

  // El preset (mensual/trimestral/semestral/anual) calcula el rango automaticamente — la fecha de
  // cada medicion es lo que permite agrupar por estos periodos, por eso es el primer dato que pide
  // el formulario de captura.
  useEffect(() => {
    if (preset === 'custom') return
    const range = presetRange(preset, presetYear, presetIndex)
    if (range) { setDateFrom(range.from); setDateTo(range.to) }
  }, [preset, presetYear, presetIndex])

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
        <ModuleHero
          badge="Ambiental"
          title="Huella de Carbono"
          subtitle="Medición de emisiones GEI según GHG Protocol — Herramienta de Monitoreo del Impacto Climático (Salud sin Daño / MinSalud, 2023)"
          accent={identity.color}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button identity={identity} onClick={() => navigate('/app/huella-carbono/captura')}><Sparkles size={15} /> Registrar medición</Button>
              <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => setShowAnalysis(true)}><Telescope size={15} /> Análisis trimestral</Button>
              <Button variant="secondary" className="btn-on-hero-secondary" disabled={exportingPdf} onClick={handleExportPdf}><FileDown size={15} /> {exportingPdf ? 'Generando...' : 'Informe PDF'}</Button>
              <Button variant="secondary" className="btn-on-hero-secondary" onClick={() => navigate('/app/huella-carbono/configuracion')}><Settings size={15} /> Configuración</Button>
            </div>
          }
        />

        <Card accent={identity.color} className="carbon-period-bar flex flex-wrap items-end gap-3 p-4">
          <Field label="Período">
            <Select
              value={preset}
              onChange={value => { setPreset(value as PeriodPreset); setPresetIndex(1) }}
              options={[
                { value: 'custom', label: 'Personalizado' }, { value: 'month', label: 'Mensual' },
                { value: 'quarter', label: 'Trimestral' }, { value: 'semester', label: 'Semestral' }, { value: 'year', label: 'Anual' },
              ]}
            />
          </Field>
          {preset !== 'custom' && (
            <>
              <Field label="Año"><Input type="number" value={presetYear} onChange={event => setPresetYear(Number(event.target.value))} /></Field>
              {preset !== 'year' && (
                <Field label={preset === 'month' ? 'Mes' : preset === 'quarter' ? 'Trimestre' : 'Semestre'}>
                  <Select
                    value={String(presetIndex)} onChange={value => setPresetIndex(Number(value))}
                    options={preset === 'month' ? MONTH_OPTIONS : preset === 'quarter' ? QUARTER_OPTIONS : SEMESTER_OPTIONS}
                  />
                </Field>
              )}
            </>
          )}
          {preset === 'custom' && (
            <>
              <Field label="Desde"><DatePicker value={dateFrom} onChange={setDateFrom} /></Field>
              <Field label="Hasta"><DatePicker value={dateTo} onChange={setDateTo} /></Field>
            </>
          )}
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
              <div>
                <p className="carbon-metric-label">Huella total del período</p>
                <p className="carbon-metric-value"><CountUpNumber value={stats.total} decimals={1} /><span className="carbon-metric-unit">kg CO2e</span></p>
              </div>
              <div className="carbon-total-footer">
                <div className="carbon-scope-breakdown">
                  {(['SCOPE_1', 'SCOPE_2', 'SCOPE_3'] as const).map(scope => (
                    <span key={scope} className="carbon-scope-chip">
                      <i style={{ background: SCOPE_COLOR[scope] }} />Alcance {scope.slice(-1)}: {scopePercent(stats.byScope[scope]) ?? 0}%
                    </span>
                  ))}
                </div>
                <span className={`carbon-trend-badge carbon-trend-badge--${trendTone}`}>
                  {trendTone === 'down' && <ArrowDown size={14} />}
                  {trendTone === 'up' && <ArrowUp size={14} />}
                  {trendTone === 'flat' && <Minus size={14} />}
                  {stats.trendPercent == null ? 'Sin período anterior para comparar' : `${Math.abs(stats.trendPercent)}% vs. período anterior`}
                </span>
              </div>
            </motion.div>

            <ScopeRadialCard label="Alcance 1" name={SCOPE_NAME.SCOPE_1} percent={scopePercent(stats.byScope.SCOPE_1)} kg={stats.byScope.SCOPE_1} color={SCOPE_COLOR.SCOPE_1} colorLight={SCOPE_COLOR_LIGHT.SCOPE_1} />
            <ScopeRadialCard label="Alcance 2" name={SCOPE_NAME.SCOPE_2} percent={scopePercent(stats.byScope.SCOPE_2)} kg={stats.byScope.SCOPE_2} color={SCOPE_COLOR.SCOPE_2} colorLight={SCOPE_COLOR_LIGHT.SCOPE_2} />
            <ScopeRadialCard label="Alcance 3" name={SCOPE_NAME.SCOPE_3} percent={scopePercent(stats.byScope.SCOPE_3)} kg={stats.byScope.SCOPE_3} color={SCOPE_COLOR.SCOPE_3} colorLight={SCOPE_COLOR_LIGHT.SCOPE_3} />
          </motion.div>
        )}

        {stats.byBlock.length > 0 && (
          <Card accent={identity.color} className="p-5">
            <h3 className="mb-3 text-base font-bold">Desglose por variable</h3>
            <BarChart
              height={280}
              color={identity.color}
              valueSuffix=" kg CO2e"
              data={stats.byBlock.map(item => ({ label: item.name, value: item.kgco2e }))}
            />
          </Card>
        )}

        {stats.timeline.length > 1 && (
          <Card accent={identity.color} className="p-5">
            <h3 className="mb-3 text-base font-bold">Evolución en el tiempo</h3>
            <LineChart
              height={260}
              color={identity.color}
              valueSuffix=" kg CO2e"
              data={stats.timeline.map(point => ({ label: point.period, value: point.kgco2e }))}
            />
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
