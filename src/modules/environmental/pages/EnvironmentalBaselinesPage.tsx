import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Card, DatePicker, Field, Input, Select, Table, ToastProvider, useToast } from '@/design-system'
import { EnvironmentalShell } from '../components/EnvironmentalShell'
import { environmentalService } from '../services/environmentalService'
import type { Baseline, Facility, Target } from '../types'

const ENERGY_COLOR = '#2385D9'
const WATER_COLOR = '#1AA7B8'
const SOURCE_LABEL: Record<string, string> = { LINEA_BASE_ANUAL: 'Línea base anual', PROMEDIO_MOVIL_12M: 'Promedio móvil 12 meses', PERIODO_ANTERIOR: 'Mismo periodo año anterior' }

export default function EnvironmentalBaselinesPage() {
  return <ToastProvider><EnvironmentalBaselinesContent /></ToastProvider>
}

function EnvironmentalBaselinesContent() {
  const toast = useToast()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [targets, setTargets] = useState<Target[]>([])
  const [baselineForm, setBaselineForm] = useState({ facilityId: '', indicatorType: 'ENERGY', sourceType: 'LINEA_BASE_ANUAL', baseYear: '', intensityBase: '', validFrom: '', observations: '', responsibleName: '' })
  const [targetForm, setTargetForm] = useState({ facilityId: '', indicatorType: 'ENERGY', targetYear: '', targetProportionalPercent: '100', tolerancePercent: '5', validFrom: '', observations: '', responsibleName: '' })

  async function load() {
    const [facilityList, baselineList, targetList] = await Promise.all([environmentalService.facilities(), environmentalService.baselines(), environmentalService.targets()])
    setFacilities(facilityList); setBaselines(baselineList); setTargets(targetList)
    if (facilityList[0]) {
      setBaselineForm(current => ({ ...current, facilityId: current.facilityId || facilityList[0].id }))
      setTargetForm(current => ({ ...current, facilityId: current.facilityId || facilityList[0].id }))
    }
  }
  useEffect(() => { void load() }, [])

  async function saveBaseline() {
    if (!baselineForm.facilityId || !baselineForm.baseYear || !baselineForm.intensityBase || !baselineForm.validFrom) { toast.push('error', 'Completa los campos obligatorios'); return }
    try {
      await environmentalService.addBaseline({ ...baselineForm, baseYear: Number(baselineForm.baseYear), intensityBase: Number(baselineForm.intensityBase) })
      toast.push('success', 'Línea base guardada — cierra automáticamente la vigencia anterior')
      setBaselineForm(current => ({ ...current, baseYear: '', intensityBase: '', validFrom: '', observations: '' }))
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar la línea base') }
  }

  async function saveTarget() {
    if (!targetForm.facilityId || !targetForm.targetYear || !targetForm.validFrom) { toast.push('error', 'Completa los campos obligatorios'); return }
    try {
      await environmentalService.addTarget({ ...targetForm, targetYear: Number(targetForm.targetYear), targetProportionalPercent: Number(targetForm.targetProportionalPercent), tolerancePercent: Number(targetForm.tolerancePercent) })
      toast.push('success', 'Meta guardada')
      setTargetForm(current => ({ ...current, targetYear: '', validFrom: '', observations: '' }))
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar la meta') }
  }

  return (
    <EnvironmentalShell title="Líneas base y metas" subtitle="Parametriza la referencia contra la que se mide la proporcionalidad de cada indicador">
      <div className="hc2-grid-2">
        <Card accent={ENERGY_COLOR} className="p-5">
          <h3 className="hc2-card-title">Líneas base</h3>
          <Table>
            <thead><tr><th>Sede</th><th>Indicador</th><th>Fuente</th><th className="text-right">Intensidad base</th><th>Vigencia</th></tr></thead>
            <tbody>
              {baselines.map(baseline => (
                <tr key={baseline.id}>
                  <td>{facilities.find(facility => facility.id === baseline.facility_id)?.name || '—'}</td>
                  <td>{baseline.indicator_type === 'WATER' ? 'Agua' : 'Energía'}</td>
                  <td>{SOURCE_LABEL[baseline.source_type]}</td>
                  <td className="text-right">{baseline.intensity_base} {baseline.unit}</td>
                  <td>{new Date(baseline.valid_from).toLocaleDateString('es-CO')} — {baseline.valid_to ? new Date(baseline.valid_to).toLocaleDateString('es-CO') : 'vigente'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="hc2-form-grid" style={{ marginTop: 12 }}>
            <Field label="Sede"><Select value={baselineForm.facilityId} onChange={value => setBaselineForm({ ...baselineForm, facilityId: value })} options={facilities.map(facility => ({ value: facility.id, label: facility.name }))} /></Field>
            <Field label="Indicador"><Select value={baselineForm.indicatorType} onChange={value => setBaselineForm({ ...baselineForm, indicatorType: value })} options={[{ value: 'ENERGY', label: 'Energía' }, { value: 'WATER', label: 'Agua' }]} /></Field>
            <Field label="Fuente"><Select value={baselineForm.sourceType} onChange={value => setBaselineForm({ ...baselineForm, sourceType: value })} options={[{ value: 'LINEA_BASE_ANUAL', label: 'Línea base anual' }, { value: 'PROMEDIO_MOVIL_12M', label: 'Promedio móvil 12 meses' }]} /></Field>
            <Field label="Año base"><Input type="number" value={baselineForm.baseYear} onChange={event => setBaselineForm({ ...baselineForm, baseYear: event.target.value })} /></Field>
            <Field label="Intensidad base (por 1000 atenciones)"><Input type="number" step="any" value={baselineForm.intensityBase} onChange={event => setBaselineForm({ ...baselineForm, intensityBase: event.target.value })} /></Field>
            <Field label="Vigente desde"><DatePicker value={baselineForm.validFrom} onChange={value => setBaselineForm({ ...baselineForm, validFrom: value })} /></Field>
            <Field label="Responsable"><Input value={baselineForm.responsibleName} onChange={event => setBaselineForm({ ...baselineForm, responsibleName: event.target.value })} /></Field>
            <div className="hc2-form-full"><Field label="Observaciones"><Input value={baselineForm.observations} onChange={event => setBaselineForm({ ...baselineForm, observations: event.target.value })} /></Field></div>
            <div className="hc2-form-full"><Button variant="secondary" onClick={() => void saveBaseline()}><Plus size={14} /> Nueva vigencia</Button></div>
          </div>
        </Card>

        <Card accent={WATER_COLOR} className="p-5">
          <h3 className="hc2-card-title">Metas</h3>
          <Table>
            <thead><tr><th>Sede</th><th>Indicador</th><th className="text-right">Meta</th><th className="text-right">Tolerancia</th><th>Vigencia</th></tr></thead>
            <tbody>
              {targets.map(target => (
                <tr key={target.id}>
                  <td>{facilities.find(facility => facility.id === target.facility_id)?.name || '—'}</td>
                  <td>{target.indicator_type === 'WATER' ? 'Agua' : 'Energía'}</td>
                  <td className="text-right">{target.target_proportional_percent}%</td>
                  <td className="text-right">±{target.tolerance_percent}%</td>
                  <td>{new Date(target.valid_from).toLocaleDateString('es-CO')} — {target.valid_to ? new Date(target.valid_to).toLocaleDateString('es-CO') : 'vigente'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="hc2-form-grid" style={{ marginTop: 12 }}>
            <Field label="Sede"><Select value={targetForm.facilityId} onChange={value => setTargetForm({ ...targetForm, facilityId: value })} options={facilities.map(facility => ({ value: facility.id, label: facility.name }))} /></Field>
            <Field label="Indicador"><Select value={targetForm.indicatorType} onChange={value => setTargetForm({ ...targetForm, indicatorType: value })} options={[{ value: 'ENERGY', label: 'Energía' }, { value: 'WATER', label: 'Agua' }]} /></Field>
            <Field label="Año meta"><Input type="number" value={targetForm.targetYear} onChange={event => setTargetForm({ ...targetForm, targetYear: event.target.value })} /></Field>
            <Field label="Meta del índice proporcional (%)"><Input type="number" step="any" value={targetForm.targetProportionalPercent} onChange={event => setTargetForm({ ...targetForm, targetProportionalPercent: event.target.value })} /></Field>
            <Field label="Tolerancia (%)"><Input type="number" step="any" value={targetForm.tolerancePercent} onChange={event => setTargetForm({ ...targetForm, tolerancePercent: event.target.value })} /></Field>
            <Field label="Vigente desde"><DatePicker value={targetForm.validFrom} onChange={value => setTargetForm({ ...targetForm, validFrom: value })} /></Field>
            <Field label="Responsable"><Input value={targetForm.responsibleName} onChange={event => setTargetForm({ ...targetForm, responsibleName: event.target.value })} /></Field>
            <div className="hc2-form-full"><Field label="Observaciones"><Input value={targetForm.observations} onChange={event => setTargetForm({ ...targetForm, observations: event.target.value })} /></Field></div>
            <div className="hc2-form-full"><Button variant="secondary" onClick={() => void saveTarget()}><Plus size={14} /> Nueva vigencia</Button></div>
          </div>
        </Card>
      </div>
    </EnvironmentalShell>
  )
}
