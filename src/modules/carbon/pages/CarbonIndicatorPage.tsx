import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Card, EmptyState, Field, Select, ToastProvider, useToast } from '@/design-system'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { carbonService } from '../services/carbonService'
import type { IndicatorData, Periodicity } from '../types'

const PERIODICITY_OPTIONS = [{ value: 'MENSUAL', label: 'Mensual' }, { value: 'TRIMESTRAL', label: 'Trimestral' }, { value: 'SEMESTRAL', label: 'Semestral' }, { value: 'ANUAL', label: 'Anual' }]
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SEMAPHORE_COLOR: Record<string, string> = { verde: '#16A47A', amarillo: '#F3A712', rojo: '#D64545', 'sin-dato': '#94A3B8' }
const SEMAPHORE_LABEL: Record<string, string> = { verde: 'Cumple', amarillo: 'Cerca de la meta', rojo: 'Crítico', 'sin-dato': 'Sin meta configurada' }

export default function CarbonIndicatorPage() {
  return <ToastProvider><CarbonIndicatorContent /></ToastProvider>
}

function CarbonIndicatorContent() {
  const toast = useToast()
  const now = new Date()
  const [periodicity, setPeriodicity] = useState<Periodicity>('ANUAL')
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1))
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getUTCMonth() + 1) / 3)))
  const [semester, setSemester] = useState(now.getUTCMonth() + 1 <= 6 ? '1' : '2')
  const [data, setData] = useState<IndicatorData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setData(await carbonService.indicator({ periodicity, year: Number(year), month: Number(month), quarter: Number(quarter), semester: Number(semester) }))
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible calcular el indicador') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [periodicity, year, month, quarter, semester])

  const yearOptions = Array.from({ length: 6 }, (_unused, index) => String(now.getUTCFullYear() - 4 + index)).map(value => ({ value, label: value }))
  const semaphoreColor = data ? SEMAPHORE_COLOR[data.semaphore] : '#94A3B8'

  return (
    <CarbonShell title="Indicador de huella de carbono" subtitle="Se calcula automáticamente a partir de los registros validados — nunca se captura a mano">
      <Card accent={carbonIdentity.color} className="p-4 hc2-filter-bar">
        <Field label="Periodicidad"><Select value={periodicity} onChange={value => setPeriodicity(value as Periodicity)} options={PERIODICITY_OPTIONS} /></Field>
        <Field label="Año"><Select value={year} onChange={setYear} options={yearOptions} /></Field>
        {periodicity === 'MENSUAL' && <Field label="Mes"><Select value={month} onChange={setMonth} options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))} /></Field>}
        {periodicity === 'TRIMESTRAL' && <Field label="Trimestre"><Select value={quarter} onChange={setQuarter} options={[1, 2, 3, 4].map(q => ({ value: String(q), label: `${q}º trimestre` }))} /></Field>}
        {periodicity === 'SEMESTRAL' && <Field label="Semestre"><Select value={semester} onChange={setSemester} options={[{ value: '1', label: '1º semestre' }, { value: '2', label: '2º semestre' }]} /></Field>}
      </Card>

      {loading ? <div className="hc2-skel-block" /> : !data ? (
        <EmptyState icon={AlertCircle} title="No fue posible calcular el indicador" />
      ) : (
        <>
          {data.isProvisional && (
            <Card accent="#F3A712" className="p-4 hc2-alert-card">
              <p className="hc2-narrative"><AlertCircle size={15} /> Resultado provisional: el periodo aún no ha cerrado. Este número puede cambiar si se validan más registros.</p>
            </Card>
          )}

          <Card accent={carbonIdentity.color} className="p-6 hc2-indicator-main">
            <div className="hc2-indicator-value" style={{ color: semaphoreColor }}>
              {data.resultTon.toLocaleString('es-CO', { maximumFractionDigits: 3 })} <span>tCO2e</span>
            </div>
            <span className="hc2-indicator-semaphore" style={{ background: `${semaphoreColor}18`, color: semaphoreColor }}>{SEMAPHORE_LABEL[data.semaphore]}</span>
            <div className="hc2-indicator-grid">
              <div><span>Periodo</span><strong>{data.periodKey}</strong></div>
              <div><span>Numerador</span><strong>{data.numeratorKg.toLocaleString('es-CO', { maximumFractionDigits: 1 })} kgCO2e</strong></div>
              <div><span>Línea base</span><strong>{data.baselineTon != null ? `${data.baselineTon.toFixed(3)} t` : '—'}</strong></div>
              <div><span>Meta</span><strong>{data.targetTon != null ? `${data.targetTon.toFixed(3)} t` : 'Sin configurar'}</strong></div>
              <div><span>Variación vs. línea base</span><strong>{data.variationPercent != null ? `${data.variationPercent.toFixed(1)}%` : '—'}</strong></div>
              <div><span>Registros incluidos</span><strong>{data.recordCount}</strong></div>
            </div>
          </Card>

          {data.intensity && (
            <Card accent={carbonIdentity.color} className="p-5">
              <h3 className="hc2-card-title">Indicadores complementarios de intensidad</h3>
              <div className="hc2-intensity-grid">
                <div><span>kgCO2e / paciente</span><strong>{data.intensity.kgco2ePerPatient != null ? data.intensity.kgco2ePerPatient.toFixed(3) : '—'}</strong></div>
                <div><span>tCO2e / empleado</span><strong>{data.intensity.tco2ePerEmployee != null ? data.intensity.tco2ePerEmployee.toFixed(4) : '—'}</strong></div>
                <div><span>tCO2e / cama ocupada</span><strong>{data.intensity.tco2ePerBed != null ? data.intensity.tco2ePerBed.toFixed(4) : '—'}</strong></div>
                <div><span>kgCO2e / m²</span><strong>{data.intensity.kgco2ePerM2 != null ? data.intensity.kgco2ePerM2.toFixed(2) : '—'}</strong></div>
              </div>
            </Card>
          )}
        </>
      )}
    </CarbonShell>
  )
}
