import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Paperclip, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Table, ToastProvider, moduleIdentity, useToast } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { carbonService } from '../services/carbonService'
import type { CarbonBlock, CarbonMeasurement, EmissionFactor } from '../types'

const identity = moduleIdentity('carbon-footprint')

export default function CarbonCapturePage() {
  return <ToastProvider><CarbonCaptureContent /></ToastProvider>
}

function CarbonCaptureContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const isSuperadmin = session?.role.key === 'SUPERADMIN'

  const [blocks, setBlocks] = useState<CarbonBlock[]>([])
  const [selectedBlockKey, setSelectedBlockKey] = useState('')
  const [factors, setFactors] = useState<EmissionFactor[]>([])
  const [measurements, setMeasurements] = useState<CarbonMeasurement[]>([])
  const [loading, setLoading] = useState(true)

  const [subtype, setSubtype] = useState('')
  const [quantity, setQuantity] = useState('')
  const [quantityUnit, setQuantityUnit] = useState('')
  const [recordDate, setRecordDate] = useState('')
  const [inSitu, setInSitu] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  useEffect(() => {
    carbonService.blocks().then(list => {
      setBlocks(list)
      const enabled = list.find(block => block.enabled)
      if (enabled) setSelectedBlockKey(enabled.key)
    }).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar las variables')).finally(() => setLoading(false))
  }, [])

  const selectedBlock = blocks.find(block => block.key === selectedBlockKey)
  const enabledBlocks = blocks.filter(block => block.enabled)

  async function loadBlockData(blockKey: string) {
    const [factorList, measurementList] = await Promise.all([
      carbonService.factors(blockKey),
      carbonService.measurements({ blockKey }),
    ])
    setFactors(factorList)
    setMeasurements(measurementList.rows)
  }

  useEffect(() => {
    if (!selectedBlockKey) return
    setSubtype(''); setQuantityUnit(''); setNotes(''); setInSitu(false)
    void loadBlockData(selectedBlockKey)
  }, [selectedBlockKey])

  const subtypeOptions = useMemo(() => {
    const seen = new Set<string>()
    return factors.filter(factor => (seen.has(factor.subtype) ? false : seen.add(factor.subtype)))
  }, [factors])

  function pickSubtype(value: string) {
    setSubtype(value)
    const factor = subtypeOptions.find(item => item.subtype === value)
    if (factor) setQuantityUnit(factor.unit.split('/')[1] || factor.unit)
  }

  async function submit() {
    if (!selectedBlockKey || !recordDate || !quantity || !quantityUnit) {
      toast.push('error', 'Completa fecha, cantidad y unidad antes de guardar')
      return
    }
    setSaving(true)
    try {
      const period = recordDate.slice(0, 7)
      const measurement = await carbonService.createMeasurement({
        blockKey: selectedBlockKey, period, recordDate, subtype: subtype || undefined,
        quantity: Number(quantity), quantityUnit, inSitu: selectedBlock?.key === 'waste' ? inSitu : undefined, notes: notes || undefined,
      })
      if (pendingFiles.length) await carbonService.uploadEvidence(measurement.id, pendingFiles)
      toast.push('success', 'Medición registrada correctamente')
      setQuantity(''); setNotes(''); setPendingFiles([])
      void loadBlockData(selectedBlockKey)
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar la medición')
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar esta medición? Esta acción no se puede deshacer.')) return
    try {
      await carbonService.deleteMeasurement(id)
      toast.push('success', 'Medición eliminada')
      void loadBlockData(selectedBlockKey)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
  }

  if (loading) return null

  return (
    <div className="carbon-module">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          eyebrow="Ambiental"
          title="Registrar medición"
          description="Captura por período — el histórico nunca se sobrescribe, así se puede ver la evolución."
          identity={identity}
          actions={<Button variant="secondary" onClick={() => navigate('/app/huella-carbono')}><ArrowLeft size={15} /> Dashboard</Button>}
        />

        {!enabledBlocks.length ? (
          <Card accent={identity.color}>
            <EmptyState icon={Paperclip} title="No hay variables habilitadas" description="Pide a un administrador que habilite al menos una variable desde Configuración." />
          </Card>
        ) : (
          <>
            <Card accent={identity.color} className="p-5">
              <Field label="Variable">
                <Select value={selectedBlockKey} onChange={setSelectedBlockKey} options={enabledBlocks.map(block => ({ value: block.key, label: block.name }))} />
              </Field>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {subtypeOptions.length > 0 && (
                  <Field label="Tipo / subtipo">
                    <Select value={subtype} onChange={pickSubtype} placeholder="Selecciona un tipo" options={subtypeOptions.map(item => ({ value: item.subtype, label: item.subtype_label }))} />
                  </Field>
                )}
                <Field label="Fecha del registro"><Input type="date" value={recordDate} onChange={event => setRecordDate(event.target.value)} /></Field>
                <Field label="Cantidad"><Input type="number" min={0} step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></Field>
                <Field label="Unidad"><Input value={quantityUnit} onChange={event => setQuantityUnit(event.target.value)} placeholder="litros, kWh, kg..." /></Field>
              </div>

              {selectedBlock?.key === 'waste' && (
                <label className="survey-toggle-row mt-3">
                  <input type="checkbox" checked={inSitu} onChange={event => setInSitu(event.target.checked)} />
                  <span>El tratamiento se realiza in situ (dentro de la entidad) — si no, se cuenta en Alcance 3 (gestor externo)</span>
                </label>
              )}

              <div className="mt-3"><Field label="Observaciones (opcional)"><Input value={notes} onChange={event => setNotes(event.target.value)} /></Field></div>

              <div className="mt-3">
                <label className="carbon-evidence-upload">
                  <Paperclip size={14} /> {pendingFiles.length ? `${pendingFiles.length} archivo(s) seleccionados` : 'Adjuntar soporte (factura, reporte del gestor...)'}
                  <input type="file" multiple accept="application/pdf,image/png,image/jpeg" hidden onChange={event => setPendingFiles(Array.from(event.target.files || []))} />
                </label>
              </div>

              <div className="mt-4">
                <Button identity={identity} disabled={saving} onClick={submit}><Save size={15} /> {saving ? 'Guardando...' : 'Guardar medición'}</Button>
              </div>
            </Card>

            <Card className="p-0">
              <Table>
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>kg CO2e</th><th>Registrado por</th><th style={{ width: 60 }} /></tr>
                </thead>
                <tbody>
                  {measurements.map(row => (
                    <tr key={row.id}>
                      <td>{new Date(row.record_date).toLocaleDateString('es-CO')}</td>
                      <td>{row.subtype || '—'}</td>
                      <td>{row.quantity} {row.quantity_unit}</td>
                      <td>{row.computed_kgco2e != null ? <Badge tone="info">{Number(row.computed_kgco2e).toFixed(1)}</Badge> : '—'}</td>
                      <td>{row.recorded_by_name}</td>
                      <td>{isSuperadmin && <button className="survey-icon-button is-danger" title="Eliminar" onClick={() => remove(row.id)}><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                  {!measurements.length && <tr><td colSpan={6} className="py-8 text-center text-sm text-[var(--muted)]">Sin mediciones registradas todavía para esta variable.</td></tr>}
                </tbody>
              </Table>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
