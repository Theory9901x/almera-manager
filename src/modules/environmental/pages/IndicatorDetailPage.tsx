import { useEffect, useState } from 'react'
import { AlertTriangle, FileText } from 'lucide-react'
import { Card, EmptyState, Field, Select, Table, ToastProvider, useToast } from '@/design-system'
import { EnvironmentalShell } from '../components/EnvironmentalShell'
import { environmentalService } from '../services/environmentalService'
import type { Facility, IndicatorDetail, IndicatorType, Periodicity } from '../types'

const PERIODICITY_OPTIONS = [{ value: 'MENSUAL', label: 'Mensual' }, { value: 'TRIMESTRAL', label: 'Trimestral' }, { value: 'SEMESTRAL', label: 'Semestral' }, { value: 'ANUAL', label: 'Anual' }]
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SEMAPHORE_COLOR: Record<string, string> = { verde: '#16A47A', amarillo: '#F3A712', rojo: '#D64545', 'sin-dato': '#94A3B8' }
const SEMAPHORE_LABEL: Record<string, string> = { verde: 'Favorable', amarillo: 'Cerca de la meta', rojo: 'Sobreconsumo crítico', 'sin-dato': 'Sin línea base' }

const FICHA_TECNICA: Record<IndicatorType, { nombre: string; objetivo: string; unidad: string; unidadOperativa: string }> = {
  ENERGY: {
    nombre: 'Índice de consumo energético ajustado por atenciones',
    objetivo: 'Evaluar si el consumo de energía eléctrica se comporta de manera eficiente y proporcional respecto al volumen de atenciones prestadas por el hospital — no mide el consumo bruto, sino su proporcionalidad frente a la línea base institucional.',
    unidad: '%',
    unidadOperativa: 'kWh por cada 1.000 atenciones',
  },
  WATER: {
    nombre: 'Índice de consumo de agua ajustado por atenciones',
    objetivo: 'Evaluar si el consumo de agua se comporta de manera eficiente y proporcional respecto al volumen de atenciones prestadas por el hospital — no mide el consumo bruto, sino su proporcionalidad frente a la línea base institucional.',
    unidad: '%',
    unidadOperativa: 'm³ por cada 1.000 atenciones',
  },
}

export function IndicatorDetailContent({ indicatorType, accent }: { indicatorType: IndicatorType; accent: string }) {
  const toast = useToast()
  const now = new Date()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState('')
  const [periodicity, setPeriodicity] = useState<Periodicity>('ANUAL')
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1))
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getUTCMonth() + 1) / 3)))
  const [semester, setSemester] = useState(now.getUTCMonth() + 1 <= 6 ? '1' : '2')
  const [data, setData] = useState<IndicatorDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { void environmentalService.facilities().then(list => { setFacilities(list); if (list[0]) setFacilityId(list[0].id) }) }, [])

  async function load() {
    if (!facilityId) return
    setLoading(true)
    try { setData(await environmentalService.indicator({ indicatorType, facilityId, periodicity, year: Number(year), month: Number(month), quarter: Number(quarter), semester: Number(semester) })) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible calcular el indicador') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [facilityId, periodicity, year, month, quarter, semester])

  const yearOptions = Array.from({ length: 6 }, (_unused, index) => String(now.getUTCFullYear() - 4 + index)).map(value => ({ value, label: value }))
  const semaphoreColor = data ? SEMAPHORE_COLOR[data.semaphore] : '#94A3B8'
  const unitLabel = indicatorType === 'WATER' ? 'm³' : 'kWh'

  const ficha = FICHA_TECNICA[indicatorType]

  return (
    <EnvironmentalShell title={`Indicador — ${indicatorType === 'WATER' ? 'Agua' : 'Energía'}`} subtitle="Se calcula automáticamente a partir de los registros validados">
      <Card accent={accent} className="p-5">
        <h3 className="hc2-card-title"><FileText size={15} /> Ficha técnica</h3>
        <div className="hc2-indicator-grid" style={{ marginTop: 0 }}>
          <div className="hc2-form-full"><span>Nombre del indicador</span><strong style={{ fontSize: 13 }}>{ficha.nombre}</strong></div>
          <div className="hc2-form-full"><span>Objetivo</span><strong style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5 }}>{ficha.objetivo}</strong></div>
          <div><span>Unidad principal</span><strong>{ficha.unidad}</strong></div>
          <div><span>Unidad operativa</span><strong>{ficha.unidadOperativa}</strong></div>
          <div className="hc2-form-full"><span>Fórmula</span><strong style={{ fontSize: 12, fontWeight: 500, fontFamily: 'monospace' }}>Índice proporcional = (Consumo real / Consumo esperado) × 100, donde Consumo esperado = (Intensidad base × Atenciones) / 1.000</strong></div>
        </div>
      </Card>

      <Card accent={accent} className="p-4 hc2-filter-bar">
        <Field label="Sede"><Select value={facilityId} onChange={setFacilityId} options={facilities.map(facility => ({ value: facility.id, label: facility.name }))} /></Field>
        <Field label="Periodicidad"><Select value={periodicity} onChange={value => setPeriodicity(value as Periodicity)} options={PERIODICITY_OPTIONS} /></Field>
        <Field label="Año"><Select value={year} onChange={setYear} options={yearOptions} /></Field>
        {periodicity === 'MENSUAL' && <Field label="Mes"><Select value={month} onChange={setMonth} options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))} /></Field>}
        {periodicity === 'TRIMESTRAL' && <Field label="Trimestre"><Select value={quarter} onChange={setQuarter} options={[1, 2, 3, 4].map(q => ({ value: String(q), label: `${q}º trimestre` }))} /></Field>}
        {periodicity === 'SEMESTRAL' && <Field label="Semestre"><Select value={semester} onChange={setSemester} options={[{ value: '1', label: '1º semestre' }, { value: '2', label: '2º semestre' }]} /></Field>}
      </Card>

      {loading || !data ? <div className="hc2-skel-block" /> : (
        <>
          {data.isProvisional && <Card accent="#F3A712" className="p-4 hc2-alert-card"><p className="hc2-narrative"><AlertTriangle size={15} /> Resultado provisional: el periodo está incompleto o aún no ha cerrado.</p></Card>}
          {data.hasOutlier && <Card accent="#D64545" className="p-4 hc2-alert-card"><p className="hc2-narrative"><AlertTriangle size={15} /> Este periodo incluye al menos un dato atípico pendiente de validación.</p></Card>}

          <Card accent={accent} className="p-6 hc2-indicator-main">
            <div className="hc2-indicator-value" style={{ color: semaphoreColor }}>
              {data.proportionalIndex != null ? data.proportionalIndex.toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '—'} <span>%</span>
            </div>
            <span className="hc2-indicator-semaphore" style={{ background: `${semaphoreColor}18`, color: semaphoreColor }}>{SEMAPHORE_LABEL[data.semaphore]}</span>
            <div className="hc2-indicator-grid">
              <div><span>Consumo del periodo</span><strong>{data.consumptionTotal.toLocaleString('es-CO', { maximumFractionDigits: 1 })} {unitLabel}</strong></div>
              <div><span>Atenciones</span><strong>{data.attentionTotal.toLocaleString('es-CO')}</strong></div>
              <div><span>Intensidad</span><strong>{data.intensityValue != null ? `${data.intensityValue.toFixed(3)} ${unitLabel}/1000at.` : '—'}</strong></div>
              <div><span>Línea base aplicada</span><strong>{data.baseline ? data.baseline.label : 'Sin línea base'}</strong></div>
              <div><span>Consumo esperado</span><strong>{data.expectedConsumption != null ? `${data.expectedConsumption.toFixed(1)} ${unitLabel}` : '—'}</strong></div>
              <div><span>Meta</span><strong>{data.target ? `${data.target.proportionalPercent}% ± ${data.target.tolerancePercent}%` : 'Sin configurar'}</strong></div>
              <div><span>Ahorro / sobreconsumo</span><strong>{data.normalizedSaving != null ? `${data.normalizedSaving.toFixed(1)}%` : '—'}</strong></div>
              <div><span>Registros incluidos</span><strong>{data.recordCount}</strong></div>
            </div>
          </Card>

          <Card accent={accent} className="p-0">
            <div className="p-4"><h3 className="hc2-card-title">Historial del indicador</h3></div>
            {!data.history.length ? <div className="p-8"><EmptyState title="Sin historial todavía" /></div> : (
              <Table>
                <thead><tr><th>Periodo</th><th className="text-right">Consumo</th><th className="text-right">Atenciones</th><th className="text-right">Intensidad</th><th className="text-right">Índice prop.</th><th></th></tr></thead>
                <tbody>
                  {data.history.map(row => (
                    <tr key={`${row.year}-${row.month}`} className={row.is_outlier ? 'env-row-outlier' : ''}>
                      <td>{row.month}/{row.year}</td>
                      <td className="text-right">{Number(row.consumption_value).toLocaleString('es-CO', { maximumFractionDigits: 1 })}</td>
                      <td className="text-right">{Number(row.attention_count).toLocaleString('es-CO')}</td>
                      <td className="text-right">{row.intensity_value != null ? Number(row.intensity_value).toFixed(3) : '—'}</td>
                      <td className="text-right">{row.proportional_index != null ? `${Number(row.proportional_index).toFixed(1)}%` : '—'}</td>
                      <td>{row.is_outlier && <span className="env-outlier-chip"><AlertTriangle size={11} /> Atípico</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </EnvironmentalShell>
  )
}

export function EnergyIndicatorPage() {
  return <ToastProvider><IndicatorDetailContent indicatorType="ENERGY" accent="#2385D9" /></ToastProvider>
}
export function WaterIndicatorPage() {
  return <ToastProvider><IndicatorDetailContent indicatorType="WATER" accent="#1AA7B8" /></ToastProvider>
}
