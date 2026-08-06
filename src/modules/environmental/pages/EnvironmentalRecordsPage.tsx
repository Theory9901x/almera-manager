import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Droplets, Save, Upload, X, Zap } from 'lucide-react'
import { Button, Card, ConfirmDialog, DatePicker, EmptyState, Field, Input, Select, Table, Textarea, ToastProvider, useToast } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { EnvironmentalShell } from '../components/EnvironmentalShell'
import { RecordStatusBadge } from '@/modules/carbon/components/RecordStatusBadge'
import { environmentalService } from '../services/environmentalService'
import { previewIndicator } from '../design/environmentalPreview'
import type { ConsumptionRecord, Facility, IndicatorType } from '../types'

const ENERGY_COLOR = '#2385D9'
const WATER_COLOR = '#1AA7B8'

export default function EnvironmentalRecordsPage() {
  return <ToastProvider><EnvironmentalRecordsContent /></ToastProvider>
}

function EnvironmentalRecordsContent() {
  const toast = useToast()
  const { session } = useAuth()
  const canManage = Boolean(session?.permissions.includes('carbon.manage'))
  const isSuperadmin = session?.role.key === 'SUPERADMIN'

  const [facilities, setFacilities] = useState<Facility[]>([])
  const [indicatorType, setIndicatorType] = useState<IndicatorType>('ENERGY')
  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    facilityId: '', readingStart: '', readingEnd: today, provider: '', invoiceNumber: '', meterCode: '',
    meterReadingStart: '', meterReadingEnd: '', consumptionValue: '', invoiceValue: '', attentionCount: '',
    responsibleName: '', informationSource: '', notes: '',
  })
  const [evidenceFiles, setEvidenceFiles] = useState<FileList | null>(null)
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<ConsumptionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [rejecting, setRejecting] = useState<ConsumptionRecord | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deleting, setDeleting] = useState<ConsumptionRecord | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void environmentalService.facilities().then(list => { setFacilities(list); if (list[0]) setForm(current => ({ ...current, facilityId: current.facilityId || list[0].id })) }) }, [])

  async function loadRecords() {
    setLoading(true)
    try { setRows((await environmentalService.records({ indicatorType, limit: 100 })).rows) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar los registros') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadRecords() }, [indicatorType])

  const accent = indicatorType === 'WATER' ? WATER_COLOR : ENERGY_COLOR
  const preview = useMemo(() => previewIndicator(Number(form.consumptionValue), Number(form.attentionCount), null), [form.consumptionValue, form.attentionCount])

  function resetForm() {
    setForm({ facilityId: form.facilityId, readingStart: '', readingEnd: today, provider: '', invoiceNumber: '', meterCode: '', meterReadingStart: '', meterReadingEnd: '', consumptionValue: '', invoiceValue: '', attentionCount: '', responsibleName: '', informationSource: '', notes: '' })
    setEvidenceFiles(null)
  }

  async function submit(status: 'BORRADOR' | 'PENDIENTE') {
    if (!form.facilityId || !form.readingEnd || !form.consumptionValue || !form.attentionCount) { toast.push('error', 'Completa sede, fecha, consumo y atenciones'); return }
    setSaving(true)
    try {
      const created = await environmentalService.createRecord({
        facilityId: form.facilityId, indicatorType, readingStart: form.readingStart || null, readingEnd: form.readingEnd,
        provider: form.provider, invoiceNumber: form.invoiceNumber, meterCode: form.meterCode,
        meterReadingStart: form.meterReadingStart ? Number(form.meterReadingStart) : null, meterReadingEnd: form.meterReadingEnd ? Number(form.meterReadingEnd) : null,
        consumptionValue: Number(form.consumptionValue), invoiceValue: form.invoiceValue ? Number(form.invoiceValue) : null,
        attentionCount: Number(form.attentionCount), responsibleName: form.responsibleName, informationSource: form.informationSource, notes: form.notes, status,
      })
      if (evidenceFiles?.length) await environmentalService.uploadEvidence(created.id, evidenceFiles)
      toast.push('success', created.is_outlier ? 'Registro guardado — marcado como dato atípico pendiente de validación' : (status === 'BORRADOR' ? 'Guardado como borrador' : 'Registro enviado a revisión'))
      resetForm()
      void loadRecords()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar el registro') }
    finally { setSaving(false) }
  }

  async function validate(row: ConsumptionRecord) {
    try { await environmentalService.validateRecord(row.id); toast.push('success', 'Registro validado'); void loadRecords() }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible validar') }
  }
  async function confirmReject() {
    if (!rejecting || !rejectReason.trim()) return
    setBusy(true)
    try { await environmentalService.rejectRecord(rejecting.id, rejectReason.trim()); toast.push('success', 'Registro rechazado'); setRejecting(null); setRejectReason(''); void loadRecords() }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible rechazar') }
    finally { setBusy(false) }
  }
  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try { await environmentalService.deleteRecord(deleting.id); toast.push('success', 'Registro eliminado'); setDeleting(null); void loadRecords() }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
    finally { setBusy(false) }
  }

  return (
    <EnvironmentalShell title="Registro de consumos" subtitle="Un formulario por recurso — energía y agua nunca se mezclan en la misma pantalla">
      <Card accent={accent} className="p-2 env-tab-switch">
        <button type="button" className={`env-tab ${indicatorType === 'ENERGY' ? 'is-active' : ''}`} style={{ '--env-tab-accent': ENERGY_COLOR } as never} onClick={() => setIndicatorType('ENERGY')}><Zap size={15} /> Energía</button>
        <button type="button" className={`env-tab ${indicatorType === 'WATER' ? 'is-active' : ''}`} style={{ '--env-tab-accent': WATER_COLOR } as never} onClick={() => setIndicatorType('WATER')}><Droplets size={15} /> Agua</button>
      </Card>

      <Card accent={accent} className="p-6">
        <div className="hc2-form-grid">
          <Field label="Sede"><Select value={form.facilityId} onChange={value => setForm({ ...form, facilityId: value })} options={facilities.map(facility => ({ value: facility.id, label: facility.name }))} placeholder="Selecciona sede" /></Field>
          <Field label="Fecha inicial de lectura (opcional)"><DatePicker value={form.readingStart} onChange={value => setForm({ ...form, readingStart: value })} max={today} /></Field>
          <Field label="Fecha final de lectura"><DatePicker value={form.readingEnd} onChange={value => setForm({ ...form, readingEnd: value })} max={today} /></Field>
          <Field label="Empresa prestadora"><Input value={form.provider} onChange={event => setForm({ ...form, provider: event.target.value })} /></Field>
          <Field label="Número de factura"><Input value={form.invoiceNumber} onChange={event => setForm({ ...form, invoiceNumber: event.target.value })} /></Field>
          <Field label="Medidor"><Input value={form.meterCode} onChange={event => setForm({ ...form, meterCode: event.target.value })} /></Field>
          <Field label="Lectura inicial (opcional)"><Input type="number" step="any" value={form.meterReadingStart} onChange={event => setForm({ ...form, meterReadingStart: event.target.value })} /></Field>
          <Field label="Lectura final (opcional)"><Input type="number" step="any" value={form.meterReadingEnd} onChange={event => setForm({ ...form, meterReadingEnd: event.target.value })} /></Field>
          <Field label={`Consumo de ${indicatorType === 'WATER' ? 'agua (m³)' : 'energía (kWh)'}`}><Input type="number" step="any" min="0" value={form.consumptionValue} onChange={event => setForm({ ...form, consumptionValue: event.target.value })} /></Field>
          <Field label="Valor de factura (opcional)"><Input type="number" step="any" value={form.invoiceValue} onChange={event => setForm({ ...form, invoiceValue: event.target.value })} /></Field>
          <Field label="Número de atenciones"><Input type="number" min="1" value={form.attentionCount} onChange={event => setForm({ ...form, attentionCount: event.target.value })} /></Field>
          <Field label="Responsable del registro"><Input value={form.responsibleName} onChange={event => setForm({ ...form, responsibleName: event.target.value })} /></Field>
          <Field label="Fuente de información"><Input value={form.informationSource} onChange={event => setForm({ ...form, informationSource: event.target.value })} /></Field>
          <div className="hc2-form-full"><Field label="Observaciones"><Textarea rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></Field></div>
          <div className="hc2-form-full">
            <label className="hc2-evidence-drop" style={{ padding: '18px 16px' }}>
              <Upload size={18} />
              <span>{evidenceFiles?.length ? `${evidenceFiles.length} archivo(s) seleccionado(s)` : 'Adjuntar evidencia (factura, foto del medidor)'}</span>
              <input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={event => setEvidenceFiles(event.target.files)} hidden />
            </label>
          </div>
        </div>

        {preview && (
          <div className="hc2-calc-preview" style={{ marginTop: 16 }}>
            <div><span>Intensidad</span><strong>{preview.intensityValue?.toFixed(3)} {indicatorType === 'WATER' ? 'm³' : 'kWh'}/1000at.</strong></div>
            {preview.proportionalIndex == null && <div className="hc2-results-note" style={{ gridColumn: '1 / -1' }}>La línea base se resuelve al guardar (mismo mes año anterior → línea base anual → promedio móvil).</div>}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => void submit('BORRADOR')} disabled={saving}><Save size={15} /> Guardar borrador</Button>
          <Button identity={{ key: 'env', color: accent, gradientFrom: accent, gradientTo: accent }} onClick={() => void submit('PENDIENTE')} disabled={saving}><Check size={15} /> Registrar consumo</Button>
        </div>
      </Card>

      <Card accent={accent} className="p-0">
        {!loading && !rows.length ? (
          <div className="p-8"><EmptyState title="Sin registros" description={`Aún no hay registros de ${indicatorType === 'WATER' ? 'agua' : 'energía'}.`} /></div>
        ) : (
          <Table>
            <thead><tr><th>Periodo</th><th>Sede</th><th className="text-right">Consumo</th><th className="text-right">Atenciones</th><th className="text-right">Índice prop.</th><th>Estado</th><th></th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={row.is_outlier ? 'env-row-outlier' : ''}>
                  <td>{row.month}/{row.year}</td>
                  <td>{row.facility_name}</td>
                  <td className="text-right">{Number(row.consumption_value).toLocaleString('es-CO', { maximumFractionDigits: 1 })} {row.consumption_unit}</td>
                  <td className="text-right">{Number(row.attention_count).toLocaleString('es-CO')}</td>
                  <td className="text-right">{row.proportional_index != null ? `${Number(row.proportional_index).toFixed(1)}%` : '—'}</td>
                  <td>
                    <RecordStatusBadge status={row.status} />
                    {row.is_outlier && <span className="env-outlier-chip"><AlertTriangle size={11} /> Atípico</span>}
                  </td>
                  <td>{row.evidence_count ? `${row.evidence_count} evid.` : ''}</td>
                  {canManage && (
                    <td className="hc2-row-actions">
                      {row.status === 'PENDIENTE' && (<><Button variant="secondary" onClick={() => validate(row)}><Check size={13} /></Button><Button variant="secondary" onClick={() => setRejecting(row)}><X size={13} /></Button></>)}
                      {isSuperadmin && <Button variant="secondary" onClick={() => setDeleting(row)}>✕</Button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog open={Boolean(rejecting)} title="Rechazar registro"
        description={<Field label="Motivo del rechazo"><Textarea rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} /></Field>}
        confirmLabel="Rechazar" tone="danger" busy={busy} onConfirm={() => void confirmReject()} onCancel={() => { setRejecting(null); setRejectReason('') }} />
      <ConfirmDialog open={Boolean(deleting)} title="Eliminar registro"
        description="Borra el registro y su evidencia de forma permanente. Solo un superadministrador puede hacerlo."
        confirmLabel="Eliminar" tone="danger" busy={busy} onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)} />
    </EnvironmentalShell>
  )
}
