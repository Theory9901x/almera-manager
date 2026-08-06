import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Building2, Car, FileBarChart2, Flame, Plus, RefreshCw, Zap } from 'lucide-react'
import { Button, Card, DonutChart, EmptyState, LineChart, Select, ToastProvider, useToast } from '@/design-system'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { KpiCard, type KpiStatus } from '../components/KpiCard'
import { ResultsBreakdownTable } from '../components/ResultsBreakdownTable'
import { carbonService } from '../services/carbonService'
import type { DashboardData } from '../types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const SOURCE_COLOR: Record<string, string> = { STATIONARY: '#2385D9', MOBILE: '#7557D3', ELECTRICITY: '#F3A712' }
const SOURCE_ICON: Record<string, typeof Flame> = { STATIONARY: Flame, MOBILE: Car, ELECTRICITY: Zap }

export default function CarbonDashboardPage() {
  return <ToastProvider><CarbonDashboardContent /></ToastProvider>
}

function CarbonDashboardContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const now = new Date()
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setData(await carbonService.dashboard({ year: Number(year) })) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el dashboard') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [year])

  const yearOptions = Array.from({ length: 6 }, (_unused, index) => String(now.getUTCFullYear() - 4 + index)).map(value => ({ value, label: value }))

  const total = data?.total.ton ?? null
  const targetStatus: KpiStatus = !data?.target ? 'neutral' : data.target.onTrack ? 'favorable' : 'critical'
  const trendStatus: KpiStatus = data?.trendPercent == null ? 'neutral' : data.trendPercent <= 0 ? 'favorable' : data.trendPercent > 10 ? 'critical' : 'warning'

  return (
    <CarbonShell
      title="Huella de Carbono"
      subtitle={`Combustión estacionaria, combustión móvil y energía eléctrica — Alcance 1 y 2, año ${year}`}
      actions={(
        <>
          <Select value={year} onChange={setYear} options={yearOptions} />
          <Button variant="secondary" onClick={() => void load()}><RefreshCw size={15} /> Actualizar</Button>
          <Button variant="secondary" onClick={() => navigate('/app/huella-carbono/informes')}><FileBarChart2 size={15} /> Generar informe</Button>
          <Button identity={carbonIdentity} onClick={() => navigate('/app/huella-carbono/registro')}><Plus size={15} /> Registrar actividad</Button>
        </>
      )}
    >
      <div className="hc2-kpi-grid">
        <KpiCard icon={Building2} label="Huella total" value={total} unit=" tCO2e" trendPercent={data?.trendPercent} status={trendStatus} loading={loading}
          tooltip="Suma de combustión estacionaria + móvil + energía eléctrica" />
        <KpiCard icon={Flame} label="Alcance 1" value={data ? data.byScope.scope1Ton : null} unit=" tCO2e" status="neutral" loading={loading}
          detail={data ? `${data.byScope.scope1SharePercent.toFixed(1)}% del total` : undefined} />
        <KpiCard icon={Zap} label="Alcance 2" value={data ? data.byScope.scope2Ton : null} unit=" tCO2e" status="neutral" loading={loading}
          detail={data ? `${data.byScope.scope2SharePercent.toFixed(1)}% del total` : undefined} />
        <KpiCard icon={Activity} label="Cumplimiento de meta" value={data?.target ? data.target.progressPercent : null} unit="%" status={targetStatus} loading={loading}
          detail={data?.target ? `Meta ${data.target.targetYear}: ${data.target.expectedValueTon.toFixed(2)} t` : 'Sin meta configurada'} />
      </div>

      <div className="hc2-grid-2">
        <Card accent={carbonIdentity.color} className="p-5">
          <h3 className="hc2-card-title">Alcance 1 vs Alcance 2</h3>
          {loading ? <div className="hc2-skel-block" /> : !total ? (
            <EmptyState icon={Building2} title="Sin registros validados" description="Registra y valida actividad para ver la distribución por alcance." />
          ) : (
            <DonutChart unit="tCO2e" centerLabel="Total tCO2e"
              data={[
                { label: 'Alcance 1 (estacionaria + móvil)', value: Number((data!.byScope.scope1Ton).toFixed(3)), color: '#2385D9' },
                { label: 'Alcance 2 (electricidad)', value: Number((data!.byScope.scope2Ton).toFixed(3)), color: '#F3A712' },
              ]}
            />
          )}
        </Card>

        <Card accent={carbonIdentity.color} className="p-5">
          <h3 className="hc2-card-title">Evolución mensual</h3>
          {loading ? <div className="hc2-skel-block" /> : (
            <LineChart color={carbonIdentity.color} valueSuffix=" t"
              data={(data?.timeline || []).map(point => ({ label: MONTH_LABELS[point.month - 1], value: point.totalTon || null }))}
            />
          )}
        </Card>
      </div>

      <Card accent={carbonIdentity.color} className="p-5">
        <h3 className="hc2-card-title">Lectura automática del periodo</h3>
        <p className="hc2-narrative">{loading ? 'Calculando…' : data?.narrative}</p>
      </Card>

      <Card accent={carbonIdentity.color} className="p-5">
        <h3 className="hc2-card-title">Participación por fuente</h3>
        <div className="hc2-source-list">
          {(data?.bySource || []).map(source => {
            const Icon = SOURCE_ICON[source.source]
            return (
              <div key={source.source} className="hc2-source-row">
                <span className="hc2-source-icon" style={{ background: `${SOURCE_COLOR[source.source]}18`, color: SOURCE_COLOR[source.source] }}><Icon size={16} /></span>
                <span className="hc2-source-label">{source.label}</span>
                <div className="hc2-source-track"><div className="hc2-source-fill" style={{ width: `${Math.max(2, source.sharePercent)}%`, background: SOURCE_COLOR[source.source] }} /></div>
                <span className="hc2-source-value">{source.ton.toFixed(3)} t</span>
                <span className="hc2-source-pct">{source.sharePercent.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card accent={carbonIdentity.color} className="p-5">
        <h3 className="hc2-card-title">Resultados globales por categoría</h3>
        {loading || !data ? <div className="hc2-skel-block" /> : (
          <ResultsBreakdownTable
            totalTon={data.total.ton}
            values={{
              stationaryTon: data.bySource.find(source => source.source === 'STATIONARY')?.ton || 0,
              mobileTon: data.bySource.find(source => source.source === 'MOBILE')?.ton || 0,
              electricityTon: data.bySource.find(source => source.source === 'ELECTRICITY')?.ton || 0,
            }}
          />
        )}
      </Card>

      {!!data?.missingMonths.length && (
        <Card accent="#D64545" className="p-5 hc2-alert-card">
          <h3 className="hc2-card-title"><AlertTriangle size={15} /> Meses sin registros</h3>
          <p className="hc2-narrative">No hay registros validados para: {data.missingMonths.map(month => MONTH_LABELS[month - 1]).join(', ')}. El total del año puede estar subestimado.</p>
        </Card>
      )}

      {data?.normalized && (
        <Card accent={carbonIdentity.color} className="p-5">
          <h3 className="hc2-card-title">Indicadores de intensidad</h3>
          <div className="hc2-intensity-grid">
            <div><span>kgCO2e / paciente</span><strong>{data.normalized.perPatientKg != null ? data.normalized.perPatientKg.toFixed(3) : '—'}</strong></div>
            <div><span>tCO2e / empleado</span><strong>{data.normalized.perEmployeeTon != null ? data.normalized.perEmployeeTon.toFixed(4) : '—'}</strong></div>
            <div><span>tCO2e / cama ocupada</span><strong>{data.normalized.perBedTon != null ? data.normalized.perBedTon.toFixed(4) : '—'}</strong></div>
            <div><span>kgCO2e / m²</span><strong>{data.normalized.perM2Kg != null ? data.normalized.perM2Kg.toFixed(2) : '—'}</strong></div>
          </div>
        </Card>
      )}
    </CarbonShell>
  )
}
