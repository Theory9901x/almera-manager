import { useEffect, useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button, Card, Field, Select, ToastProvider, useToast } from '@/design-system'
import { EnvironmentalShell } from '../components/EnvironmentalShell'
import { environmentalService } from '../services/environmentalService'
import type { Facility, IndicatorType, Periodicity } from '../types'

const PERIODICITY_OPTIONS = [{ value: 'MENSUAL', label: 'Mensual' }, { value: 'TRIMESTRAL', label: 'Trimestral' }, { value: 'SEMESTRAL', label: 'Semestral' }, { value: 'ANUAL', label: 'Año completo' }]
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function EnvironmentalReportsPage() {
  return <ToastProvider><EnvironmentalReportsContent /></ToastProvider>
}

function EnvironmentalReportsContent() {
  const toast = useToast()
  const now = new Date()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState('')
  const [indicatorType, setIndicatorType] = useState<IndicatorType>('ENERGY')
  const [periodicity, setPeriodicity] = useState<Periodicity>('ANUAL')
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1))
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getUTCMonth() + 1) / 3)))
  const [semester, setSemester] = useState(now.getUTCMonth() + 1 <= 6 ? '1' : '2')
  const [generating, setGenerating] = useState(false)

  useEffect(() => { void environmentalService.facilities().then(list => { setFacilities(list); if (list[0]) setFacilityId(list[0].id) }) }, [])
  const yearOptions = Array.from({ length: 6 }, (_unused, index) => String(now.getUTCFullYear() - 4 + index)).map(value => ({ value, label: value }))

  async function generate() {
    setGenerating(true)
    try {
      await environmentalService.downloadReport({ facilityId, indicatorType, periodicity, year: Number(year), month: Number(month), quarter: Number(quarter), semester: Number(semester) })
      toast.push('success', 'Informe generado')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el informe') }
    finally { setGenerating(false) }
  }

  return (
    <EnvironmentalShell title="Informes" subtitle="Informe PDF por indicador, sede y periodo — con código único de verificación">
      <Card accent="#2385D9" className="p-6">
        <div className="hc2-form-grid">
          <Field label="Sede"><Select value={facilityId} onChange={setFacilityId} options={facilities.map(facility => ({ value: facility.id, label: facility.name }))} /></Field>
          <Field label="Indicador"><Select value={indicatorType} onChange={value => setIndicatorType(value as IndicatorType)} options={[{ value: 'ENERGY', label: 'Energía' }, { value: 'WATER', label: 'Agua' }]} /></Field>
          <Field label="Periodicidad"><Select value={periodicity} onChange={value => setPeriodicity(value as Periodicity)} options={PERIODICITY_OPTIONS} /></Field>
          <Field label="Año"><Select value={year} onChange={setYear} options={yearOptions} /></Field>
          {periodicity === 'MENSUAL' && <Field label="Mes"><Select value={month} onChange={setMonth} options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))} /></Field>}
          {periodicity === 'TRIMESTRAL' && <Field label="Trimestre"><Select value={quarter} onChange={setQuarter} options={[1, 2, 3, 4].map(q => ({ value: String(q), label: `${q}º trimestre` }))} /></Field>}
          {periodicity === 'SEMESTRAL' && <Field label="Semestre"><Select value={semester} onChange={setSemester} options={[{ value: '1', label: '1º semestre' }, { value: '2', label: '2º semestre' }]} /></Field>}
        </div>
        <p className="hc2-hint" style={{ marginTop: 12 }}>
          El informe incluye solo registros <b>Validados</b>: objetivo, metodología, fórmula, línea base aplicada, meta,
          resultados del periodo (consumo, atenciones, intensidad, consumo esperado, índice proporcional, ahorro o
          sobreconsumo), análisis automático, tabla de registros, alertas de datos atípicos, responsables y código de verificación.
        </p>
        <div style={{ marginTop: 18 }}>
          <Button identity={{ key: 'env', color: '#2385D9', gradientFrom: '#2385D9', gradientTo: '#1AA7B8' }} onClick={() => void generate()} disabled={generating}>
            <FileDown size={15} /> {generating ? 'Generando…' : 'Generar informe PDF'}
          </Button>
        </div>
      </Card>
    </EnvironmentalShell>
  )
}
