import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Droplets, FileBarChart2, Gauge, Plus, RefreshCw, Settings2, Zap } from 'lucide-react'
import { Button, Card, EmptyState, LineChart, RadialGauge, ScatterChart, Select, ToastProvider, useToast } from '@/design-system'
import { EnvironmentalShell, environmentalIdentity } from '../components/EnvironmentalShell'
import { KpiCard, type KpiStatus } from '@/modules/carbon/components/KpiCard'
import { environmentalService } from '../services/environmentalService'
import type { DashboardData, Facility } from '../types'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const ENERGY_COLOR = '#2385D9'
const WATER_COLOR = '#1AA7B8'

function statusFromSemaphore(semaphore: string): KpiStatus {
  if (semaphore === 'verde') return 'favorable'
  if (semaphore === 'amarillo') return 'warning'
  if (semaphore === 'rojo') return 'critical'
  return 'neutral'
}

export default function EnvironmentalDashboardPage() {
  return <ToastProvider><EnvironmentalDashboardContent /></ToastProvider>
}

function EnvironmentalDashboardContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const now = new Date()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState('')
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { void environmentalService.facilities().then(list => { setFacilities(list); if (!facilityId && list[0]) setFacilityId(list[0].id) }) }, [])

  async function load() {
    setLoading(true)
    try { setData(await environmentalService.dashboard({ facilityId: facilityId || undefined, year: Number(year), periodicity: 'ANUAL' })) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el dashboard') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (facilityId) void load() }, [facilityId, year])

  const yearOptions = Array.from({ length: 6 }, (_unused, index) => String(now.getUTCFullYear() - 4 + index)).map(value => ({ value, label: value }))
  const facilityOptions = facilities.map(facility => ({ value: facility.id, label: facility.name }))

  const scatterEnergy = (data?.monthly || []).filter(point => point.energyConsumption != null).map(point => ({ x: point.energyAttentions || 0, y: point.energyConsumption || 0, label: MONTH_LABELS[point.month - 1], isOutlier: point.energyIsOutlier }))
  const scatterWater = (data?.monthly || []).filter(point => point.waterConsumption != null).map(point => ({ x: point.waterAttentions || 0, y: point.waterConsumption || 0, label: MONTH_LABELS[point.month - 1], isOutlier: point.waterIsOutlier }))

  return (
    <EnvironmentalShell
      title="Indicadores Ambientales"
      subtitle={data?.facility ? `${data.facility.name} — año ${year}` : `Año ${year}`}
      actions={(
        <>
          <Select value={facilityId} onChange={setFacilityId} options={facilityOptions} placeholder="Sede" />
          <Select value={year} onChange={setYear} options={yearOptions} />
          <Button variant="secondary" onClick={() => void load()}><RefreshCw size={15} /> Actualizar</Button>
          <Button variant="secondary" onClick={() => navigate('/app/indicadores-ambientales/lineas-base')}><Settings2 size={15} /> Línea base</Button>
          <Button variant="secondary" onClick={() => navigate('/app/indicadores-ambientales/informes')}><FileBarChart2 size={15} /> Generar informe</Button>
          <Button identity={environmentalIdentity} onClick={() => navigate('/app/indicadores-ambientales/registro')}><Plus size={15} /> Registrar consumo</Button>
        </>
      )}
    >
      {!facilities.length && !loading ? (
        <Card className="p-8"><EmptyState title="No hay ninguna sede configurada" description="Crea una sede desde Líneas base y metas para empezar a registrar consumos." /></Card>
      ) : (
        <>
          <div className="hc2-kpi-grid">
            <KpiCard icon={Zap} label="Consumo de energía" value={data ? data.energy.consumptionTotal / 1000 : null} unit=" MWh" status="neutral" loading={loading}
              detail={data ? `${data.energy.attentionTotal.toLocaleString('es-CO')} atenciones` : undefined} />
            <KpiCard icon={Droplets} label="Consumo de agua" value={data ? data.water.consumptionTotal : null} unit=" m³" status="neutral" loading={loading}
              detail={data?.water.hasOutlier ? 'Incluye datos atípicos' : undefined} />
            <KpiCard icon={Gauge} label="Intensidad energética" value={data ? data.energy.intensityValue : null} unit=" kWh/1000at." status="neutral" loading={loading} />
            <KpiCard icon={Gauge} label="Intensidad hídrica" value={data ? data.water.intensityValue : null} unit=" m³/1000at." status="neutral" loading={loading} />
            <KpiCard icon={Zap} label="Índice proporcional energía" value={data ? data.energy.proportionalIndex : null} unit="%" status={data ? statusFromSemaphore(data.energy.semaphore) : 'neutral'} loading={loading}
              tooltip="Consumo real frente al consumo esperado según la línea base — menor a 100% es favorable" />
            <KpiCard icon={Droplets} label="Índice proporcional agua" value={data ? data.water.proportionalIndex : null} unit="%" status={data ? statusFromSemaphore(data.water.semaphore) : 'neutral'} loading={loading}
              tooltip="Consumo real frente al consumo esperado según la línea base — menor a 100% es favorable" />
            <KpiCard icon={Gauge} label="Ahorro / sobreconsumo energía" value={data ? data.energy.normalizedSaving : null} unit="%" status={data && data.energy.normalizedSaving != null ? (data.energy.normalizedSaving >= 0 ? 'favorable' : 'critical') : 'neutral'} loading={loading} />
            <KpiCard icon={Gauge} label="Ahorro / sobreconsumo agua" value={data ? data.water.normalizedSaving : null} unit="%" status={data && data.water.normalizedSaving != null ? (data.water.normalizedSaving >= 0 ? 'favorable' : 'critical') : 'neutral'} loading={loading} />
            <KpiCard icon={AlertTriangle} label="Alertas / datos atípicos" value={data ? data.alertCount : null} decimals={0} status={data && data.alertCount > 0 ? 'warning' : 'favorable'} loading={loading} />
          </div>

          <div className="hc2-grid-2">
            <Card accent={ENERGY_COLOR} className="p-5">
              <h3 className="hc2-card-title">Cumplimiento — Energía</h3>
              {loading || !data ? <div className="hc2-skel-block" /> : data.energy.proportionalIndex == null ? (
                <EmptyState icon={Zap} title="Sin línea base validada" description="Configura una línea base para calcular el índice proporcional." />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RadialGauge percent={Math.min(150, Math.round(data.energy.proportionalIndex))} color={ENERGY_COLOR} size={140} />
                </div>
              )}
            </Card>
            <Card accent={WATER_COLOR} className="p-5">
              <h3 className="hc2-card-title">Cumplimiento — Agua</h3>
              {loading || !data ? <div className="hc2-skel-block" /> : data.water.proportionalIndex == null ? (
                <EmptyState icon={Droplets} title="Sin línea base validada" description="Configura una línea base para calcular el índice proporcional." />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RadialGauge percent={Math.min(150, Math.round(data.water.proportionalIndex))} color={WATER_COLOR} size={140} />
                </div>
              )}
            </Card>
          </div>

          <Card accent={ENERGY_COLOR} className="p-5">
            <h3 className="hc2-card-title">Análisis automático del periodo</h3>
            <p className="hc2-narrative">{loading ? 'Calculando…' : data?.narrative}</p>
          </Card>

          <div className="hc2-grid-2">
            <Card accent={ENERGY_COLOR} className="p-5">
              <h3 className="hc2-card-title">Tendencia mensual — Energía (kWh)</h3>
              {loading ? <div className="hc2-skel-block" /> : (
                <LineChart color={ENERGY_COLOR} valueSuffix=" kWh" data={(data?.monthly || []).map(point => ({ label: MONTH_LABELS[point.month - 1], value: point.energyConsumption }))} />
              )}
            </Card>
            <Card accent={WATER_COLOR} className="p-5">
              <h3 className="hc2-card-title">Tendencia mensual — Agua (m³)</h3>
              {loading ? <div className="hc2-skel-block" /> : (
                <LineChart color={WATER_COLOR} valueSuffix=" m³" data={(data?.monthly || []).map(point => ({ label: MONTH_LABELS[point.month - 1], value: point.waterConsumption }))} />
              )}
            </Card>
          </div>

          <div className="hc2-grid-2">
            <Card accent={ENERGY_COLOR} className="p-5">
              <h3 className="hc2-card-title">Energía vs. atenciones</h3>
              {loading ? <div className="hc2-skel-block" /> : scatterEnergy.length ? (
                <ScatterChart data={scatterEnergy} xLabel="Atenciones" yLabel="kWh" color={ENERGY_COLOR} />
              ) : <EmptyState title="Sin datos suficientes" />}
            </Card>
            <Card accent={WATER_COLOR} className="p-5">
              <h3 className="hc2-card-title">Agua vs. atenciones</h3>
              {loading ? <div className="hc2-skel-block" /> : scatterWater.length ? (
                <ScatterChart data={scatterWater} xLabel="Atenciones" yLabel="m³" color={WATER_COLOR} />
              ) : <EmptyState title="Sin datos suficientes" />}
            </Card>
          </div>

          <Card accent={ENERGY_COLOR} className="p-5">
            <h3 className="hc2-card-title">Comportamiento mensual</h3>
            <div className="env-heat-row">
              {(data?.monthly || []).map(point => (
                <div key={point.month} className="env-heat-cell">
                  <span className="env-heat-month">{MONTH_LABELS[point.month - 1]}</span>
                  <span className={`env-heat-dot env-heat-energy ${point.energyConsumption == null ? 'is-empty' : point.energyIsOutlier ? 'is-outlier' : 'is-ok'}`} title="Energía" />
                  <span className={`env-heat-dot env-heat-water ${point.waterConsumption == null ? 'is-empty' : point.waterIsOutlier ? 'is-outlier' : 'is-ok'}`} title="Agua" />
                </div>
              ))}
            </div>
            <p className="hc2-hint">Punto azul = energía, punto turquesa = agua. Ámbar indica dato atípico pendiente de validación; gris, sin registro.</p>
          </Card>
        </>
      )}
    </EnvironmentalShell>
  )
}
