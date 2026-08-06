import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button, Card, Field, Select, ToastProvider, useToast } from '@/design-system'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { carbonService } from '../services/carbonService'
import type { Periodicity } from '../types'

const PERIODICITY_OPTIONS = [{ value: 'MENSUAL', label: 'Mensual' }, { value: 'TRIMESTRAL', label: 'Trimestral' }, { value: 'SEMESTRAL', label: 'Semestral' }, { value: 'ANUAL', label: 'Año completo' }]
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function CarbonReportsPage() {
  return <ToastProvider><CarbonReportsContent /></ToastProvider>
}

function CarbonReportsContent() {
  const toast = useToast()
  const now = new Date()
  const [periodicity, setPeriodicity] = useState<Periodicity>('ANUAL')
  const [year, setYear] = useState(String(now.getUTCFullYear()))
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1))
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getUTCMonth() + 1) / 3)))
  const [semester, setSemester] = useState(now.getUTCMonth() + 1 <= 6 ? '1' : '2')
  const [generating, setGenerating] = useState(false)

  const yearOptions = Array.from({ length: 6 }, (_unused, index) => String(now.getUTCFullYear() - 4 + index)).map(value => ({ value, label: value }))

  async function generate() {
    setGenerating(true)
    try {
      await carbonService.downloadReport({ periodicity, year: Number(year), month: Number(month), quarter: Number(quarter), semester: Number(semester) })
      toast.push('success', 'Informe generado')
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el informe') }
    finally { setGenerating(false) }
  }

  return (
    <CarbonShell title="Informes" subtitle="Informe institucional en PDF, con las 22 secciones de trazabilidad de la huella de carbono">
      <Card accent={carbonIdentity.color} className="p-6">
        <div className="hc2-form-grid">
          <Field label="Periodicidad"><Select value={periodicity} onChange={value => setPeriodicity(value as Periodicity)} options={PERIODICITY_OPTIONS} /></Field>
          <Field label="Año"><Select value={year} onChange={setYear} options={yearOptions} /></Field>
          {periodicity === 'MENSUAL' && <Field label="Mes"><Select value={month} onChange={setMonth} options={MONTHS.map((label, index) => ({ value: String(index + 1), label }))} /></Field>}
          {periodicity === 'TRIMESTRAL' && <Field label="Trimestre"><Select value={quarter} onChange={setQuarter} options={[1, 2, 3, 4].map(q => ({ value: String(q), label: `${q}º trimestre` }))} /></Field>}
          {periodicity === 'SEMESTRAL' && <Field label="Semestre"><Select value={semester} onChange={setSemester} options={[{ value: '1', label: '1º semestre' }, { value: '2', label: '2º semestre' }]} /></Field>}
        </div>
        <p className="hc2-hint" style={{ marginTop: 12 }}>
          El informe incluye solo registros en estado <b>Validado</b>: portada, perfil institucional, metodología, resumen
          ejecutivo, desglose por alcance y fuente, evolución mensual, datos de actividad, factores de emisión utilizados,
          indicador institucional, cumplimiento de meta, calidad de los datos, responsables y un código único de verificación.
        </p>
        <div style={{ marginTop: 18 }}>
          <Button identity={carbonIdentity} onClick={() => void generate()} disabled={generating}><FileDown size={15} /> {generating ? 'Generando…' : 'Generar informe PDF'}</Button>
        </div>
      </Card>
    </CarbonShell>
  )
}
