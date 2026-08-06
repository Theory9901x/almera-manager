import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, Check, ChevronLeft, ChevronRight, Flame, Save, Upload, Zap } from 'lucide-react'
import { Button, Card, DatePicker, Field, Input, Select, Textarea, ToastProvider, useToast } from '@/design-system'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { carbonService } from '../services/carbonService'
import { previewElectricity, previewMobile, previewStationary } from '../design/carbonPreview'
import type { BiofuelBlend, ElectricityFactor, FuelType } from '../types'

type Source = 'STATIONARY' | 'MOBILE' | 'ELECTRICITY'

const STEPS = ['Información del registro', 'Selección de fuente', 'Datos de actividad', 'Evidencias', 'Revisión y cálculo']

const SOURCE_CARDS: { key: Source; label: string; scope: string; description: string; icon: typeof Flame }[] = [
  { key: 'STATIONARY', label: 'Combustión estacionaria', scope: 'Alcance 1', description: 'Calderas, plantas eléctricas y generadores fijos.', icon: Flame },
  { key: 'MOBILE', label: 'Combustión móvil', scope: 'Alcance 1', description: 'Vehículos propios o bajo control operacional (ambulancias, administrativos).', icon: Car },
  { key: 'ELECTRICITY', label: 'Energía eléctrica', scope: 'Alcance 2', description: 'Consumo de electricidad comprada a la red.', icon: Zap },
]

const LIQUID_UNITS = [{ value: 'litro', label: 'Litros' }, { value: 'galon', label: 'Galones' }]

export default function CarbonRegistrationPage() {
  return <ToastProvider><CarbonRegistrationContent /></ToastProvider>
}

function CarbonRegistrationContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<Source | null>(null)
  const [fuels, setFuels] = useState<FuelType[]>([])
  const [electricityFactor, setElectricityFactor] = useState<ElectricityFactor | null>(null)
  const [blend, setBlend] = useState<BiofuelBlend | null>(null)
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const [general, setGeneral] = useState({ responsibleName: '', informationSource: '', invoiceNumber: '', notes: '' })
  const [st, setSt] = useState({ recordDate: today, area: '', equipmentLabel: '', internalCode: '', fuelKey: '', quantity: '', quantityUnit: '', provider: '', invoiceValue: '' })
  const [mb, setMb] = useState({ recordDate: today, plate: '', vehicleType: '', ownership: 'PROPIO', fuelKey: '', inputMethod: 'CANTIDAD' as 'CANTIDAD' | 'RENDIMIENTO', quantity: '', quantityUnit: '', kmTraveled: '', specificConsumption: '', provider: '' })
  const [el, setEl] = useState({ billingStart: '', billingEnd: today, meterCode: '', provider: '', accountNumber: '', kwh: '', invoiceValue: '' })
  const [evidenceFiles, setEvidenceFiles] = useState<FileList | null>(null)

  useEffect(() => {
    void carbonService.fuels().then(setFuels)
    void carbonService.electricityFactors().then(rows => setElectricityFactor(rows.find(row => !row.valid_to) || rows[0] || null))
    void carbonService.biofuelBlends().then(rows => setBlend(rows.find(row => !row.valid_to) || rows[0] || null))
  }, [])

  const stationaryFuels = fuels.filter(fuel => fuel.applicable_stationary)
  const mobileFuels = fuels.filter(fuel => fuel.applicable_mobile)
  const stFuel = fuels.find(fuel => fuel.fuel_key === st.fuelKey)
  const mbFuel = fuels.find(fuel => fuel.fuel_key === mb.fuelKey)
  const mbBlendFuel = useMemo(() => {
    if (!mbFuel || mbFuel.is_biofuel || !blend) return null
    if (mbFuel.fuel_key === 'diesel') return { fuel: fuels.find(fuel => fuel.fuel_key === 'biodiesel') || null, percent: Number(blend.biodiesel_percent) }
    if (mbFuel.fuel_key === 'gasolina') return { fuel: fuels.find(fuel => fuel.fuel_key === 'bioetanol') || null, percent: Number(blend.bioethanol_percent) }
    return null
  }, [mbFuel, blend, fuels])

  const stPreview = previewStationary(stFuel, Number(st.quantity), st.quantityUnit || stFuel?.native_unit || '')
  const mbQuantity = mb.inputMethod === 'RENDIMIENTO' ? Number(mb.kmTraveled) * Number(mb.specificConsumption) : Number(mb.quantity)
  const mbPreview = previewMobile(mbFuel, mbQuantity, mb.quantityUnit || mbFuel?.native_unit || '', mbBlendFuel?.fuel || null, mbBlendFuel?.percent || 0)
  const elPreview = previewElectricity(Number(el.kwh), electricityFactor ? Number(electricityFactor.value_kgco2e_per_kwh) : undefined)
  const activePreview = source === 'STATIONARY' ? stPreview : source === 'MOBILE' ? mbPreview : source === 'ELECTRICITY' ? elPreview : null

  function canAdvance() {
    if (step === 0) return true
    if (step === 1) return Boolean(source)
    if (step === 2) {
      if (source === 'STATIONARY') return Boolean(st.recordDate && st.fuelKey && Number(st.quantity) > 0)
      if (source === 'MOBILE') return Boolean(mb.recordDate && mb.fuelKey && (mb.inputMethod === 'CANTIDAD' ? Number(mb.quantity) > 0 : Number(mb.kmTraveled) > 0 && Number(mb.specificConsumption) > 0))
      if (source === 'ELECTRICITY') return Boolean(el.billingStart && el.billingEnd && Number(el.kwh) > 0)
      return false
    }
    return true
  }

  async function submit(status: 'BORRADOR' | 'PENDIENTE') {
    if (!source) return
    setSaving(true)
    try {
      let recordId: string
      let kind: 'stationary' | 'mobile' | 'electricity'
      if (source === 'STATIONARY') {
        kind = 'stationary'
        const created = await carbonService.createStationary({
          recordDate: st.recordDate, area: st.area, equipmentLabel: st.equipmentLabel, internalCode: st.internalCode,
          fuelKey: st.fuelKey, quantity: Number(st.quantity), quantityUnit: st.quantityUnit || stFuel?.native_unit,
          provider: st.provider, invoiceValue: st.invoiceValue ? Number(st.invoiceValue) : null,
          invoiceNumber: general.invoiceNumber, responsibleName: general.responsibleName, informationSource: general.informationSource, notes: general.notes, status,
        })
        recordId = created.id
      } else if (source === 'MOBILE') {
        kind = 'mobile'
        const created = await carbonService.createMobile({
          recordDate: mb.recordDate, plate: mb.plate, vehicleType: mb.vehicleType, ownership: mb.ownership,
          fuelKey: mb.fuelKey, inputMethod: mb.inputMethod,
          quantity: mb.inputMethod === 'CANTIDAD' ? Number(mb.quantity) : null, quantityUnit: mb.quantityUnit || mbFuel?.native_unit,
          kmTraveled: mb.inputMethod === 'RENDIMIENTO' ? Number(mb.kmTraveled) : null, specificConsumption: mb.inputMethod === 'RENDIMIENTO' ? Number(mb.specificConsumption) : null,
          provider: mb.provider, invoiceNumber: general.invoiceNumber, responsibleName: general.responsibleName, informationSource: general.informationSource, notes: general.notes, status,
        })
        recordId = created.id
      } else {
        kind = 'electricity'
        const created = await carbonService.createElectricity({
          billingStart: el.billingStart, billingEnd: el.billingEnd, meterCode: el.meterCode, provider: el.provider, accountNumber: el.accountNumber,
          kwh: Number(el.kwh), invoiceValue: el.invoiceValue ? Number(el.invoiceValue) : null,
          invoiceNumber: general.invoiceNumber, responsibleName: general.responsibleName, notes: general.notes, status,
        })
        recordId = created.id
      }
      if (evidenceFiles && evidenceFiles.length) await carbonService.uploadEvidence(kind, recordId, evidenceFiles)
      toast.push('success', status === 'BORRADOR' ? 'Guardado como borrador' : 'Registro enviado a revisión')
      navigate('/app/huella-carbono/inventario')
    } catch (cause) {
      toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar el registro')
    } finally { setSaving(false) }
  }

  return (
    <CarbonShell title="Registro de actividad" subtitle="Combustión estacionaria, combustión móvil o energía eléctrica — un registro por fuente">
      <Card accent={carbonIdentity.color} className="p-5 hc2-stepper-card">
        <ol className="hc2-stepper">
          {STEPS.map((label, index) => (
            <li key={label} className={`hc2-step ${index === step ? 'is-active' : index < step ? 'is-done' : ''}`}>
              <span className="hc2-step-dot">{index < step ? <Check size={12} /> : index + 1}</span>
              <span className="hc2-step-label">{label}</span>
            </li>
          ))}
        </ol>

        <div className="hc2-step-body">
          {step === 0 && (
            <div className="hc2-form-grid">
              <Field label="Responsable"><Input value={general.responsibleName} onChange={event => setGeneral({ ...general, responsibleName: event.target.value })} placeholder="Nombre de quien registra" /></Field>
              <Field label="Fuente de información"><Input value={general.informationSource} onChange={event => setGeneral({ ...general, informationSource: event.target.value })} placeholder="Factura, medidor, bitácora…" /></Field>
              <Field label="Número de factura (opcional)"><Input value={general.invoiceNumber} onChange={event => setGeneral({ ...general, invoiceNumber: event.target.value })} /></Field>
              <div className="hc2-form-full"><Field label="Observaciones"><Textarea rows={3} value={general.notes} onChange={event => setGeneral({ ...general, notes: event.target.value })} /></Field></div>
            </div>
          )}

          {step === 1 && (
            <div className="hc2-source-cards">
              {SOURCE_CARDS.map(card => {
                const Icon = card.icon
                return (
                  <button key={card.key} type="button" className={`hc2-source-card ${source === card.key ? 'is-selected' : ''}`} onClick={() => setSource(card.key)}>
                    <span className="hc2-source-card-icon"><Icon size={20} /></span>
                    <strong>{card.label}</strong>
                    <span className="hc2-source-card-scope">{card.scope}</span>
                    <p>{card.description}</p>
                  </button>
                )
              })}
            </div>
          )}

          {step === 2 && source === 'STATIONARY' && (
            <div className="hc2-form-grid">
              <Field label="Fecha"><DatePicker value={st.recordDate} onChange={value => setSt({ ...st, recordDate: value })} max={today} /></Field>
              <Field label="Área"><Input value={st.area} onChange={event => setSt({ ...st, area: event.target.value })} placeholder="Lavandería, caldera central…" /></Field>
              <Field label="Equipo"><Input value={st.equipmentLabel} onChange={event => setSt({ ...st, equipmentLabel: event.target.value })} /></Field>
              <Field label="ID interno"><Input value={st.internalCode} onChange={event => setSt({ ...st, internalCode: event.target.value })} /></Field>
              <Field label="Tipo de combustible">
                <Select value={st.fuelKey} onChange={value => { const fuel = fuels.find(item => item.fuel_key === value); setSt({ ...st, fuelKey: value, quantityUnit: fuel?.native_unit || '' }) }}
                  options={stationaryFuels.map(fuel => ({ value: fuel.fuel_key, label: fuel.label }))} placeholder="Selecciona el combustible" />
              </Field>
              <Field label="Cantidad consumida"><Input type="number" step="any" min="0" value={st.quantity} onChange={event => setSt({ ...st, quantity: event.target.value })} /></Field>
              {stFuel && stFuel.native_unit === 'litro' && (
                <Field label="Unidad"><Select value={st.quantityUnit} onChange={value => setSt({ ...st, quantityUnit: value })} options={LIQUID_UNITS} /></Field>
              )}
              <Field label="Proveedor"><Input value={st.provider} onChange={event => setSt({ ...st, provider: event.target.value })} /></Field>
              <Field label="Valor de la factura (opcional)"><Input type="number" step="any" value={st.invoiceValue} onChange={event => setSt({ ...st, invoiceValue: event.target.value })} /></Field>
            </div>
          )}

          {step === 2 && source === 'MOBILE' && (
            <div className="hc2-form-grid">
              <Field label="Fecha"><DatePicker value={mb.recordDate} onChange={value => setMb({ ...mb, recordDate: value })} max={today} /></Field>
              <Field label="Placa"><Input value={mb.plate} onChange={event => setMb({ ...mb, plate: event.target.value.toUpperCase() })} /></Field>
              <Field label="Tipo de vehículo"><Input value={mb.vehicleType} onChange={event => setMb({ ...mb, vehicleType: event.target.value })} placeholder="Ambulancia, camioneta…" /></Field>
              <Field label="Propiedad / control operacional">
                <Select value={mb.ownership} onChange={value => setMb({ ...mb, ownership: value })} options={[{ value: 'PROPIO', label: 'Propio' }, { value: 'CONTROL_OPERACIONAL', label: 'Control operacional' }]} />
              </Field>
              <Field label="Tipo de combustible">
                <Select value={mb.fuelKey} onChange={value => { const fuel = fuels.find(item => item.fuel_key === value); setMb({ ...mb, fuelKey: value, quantityUnit: fuel?.native_unit || '' }) }}
                  options={mobileFuels.map(fuel => ({ value: fuel.fuel_key, label: fuel.label }))} placeholder="Selecciona el combustible" />
              </Field>
              <Field label="Método de captura">
                <Select value={mb.inputMethod} onChange={value => setMb({ ...mb, inputMethod: value as 'CANTIDAD' | 'RENDIMIENTO' })}
                  options={[{ value: 'CANTIDAD', label: 'Cantidad real consumida' }, { value: 'RENDIMIENTO', label: 'Km recorridos × consumo específico' }]} />
              </Field>
              {mb.inputMethod === 'CANTIDAD' ? (
                <>
                  <Field label="Cantidad consumida"><Input type="number" step="any" min="0" value={mb.quantity} onChange={event => setMb({ ...mb, quantity: event.target.value })} /></Field>
                  {mbFuel && mbFuel.native_unit === 'litro' && (
                    <Field label="Unidad"><Select value={mb.quantityUnit} onChange={value => setMb({ ...mb, quantityUnit: value })} options={LIQUID_UNITS} /></Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="Km recorridos"><Input type="number" step="any" min="0" value={mb.kmTraveled} onChange={event => setMb({ ...mb, kmTraveled: event.target.value })} /></Field>
                  <Field label="Consumo específico (litros/km)"><Input type="number" step="any" min="0" value={mb.specificConsumption} onChange={event => setMb({ ...mb, specificConsumption: event.target.value })} /></Field>
                </>
              )}
              <Field label="Proveedor"><Input value={mb.provider} onChange={event => setMb({ ...mb, provider: event.target.value })} /></Field>
              {mbBlendFuel?.fuel && <p className="hc2-hint">Se descontará automáticamente {mbBlendFuel.percent}% como {mbBlendFuel.fuel.label} (biogénico, no cuenta CO2).</p>}
            </div>
          )}

          {step === 2 && source === 'ELECTRICITY' && (
            <div className="hc2-form-grid">
              <Field label="Fecha inicial de facturación"><DatePicker value={el.billingStart} onChange={value => setEl({ ...el, billingStart: value })} max={today} /></Field>
              <Field label="Fecha final de facturación"><DatePicker value={el.billingEnd} onChange={value => setEl({ ...el, billingEnd: value })} max={today} /></Field>
              <Field label="Medidor / cuenta"><Input value={el.meterCode} onChange={event => setEl({ ...el, meterCode: event.target.value })} /></Field>
              <Field label="Número de cuenta"><Input value={el.accountNumber} onChange={event => setEl({ ...el, accountNumber: event.target.value })} /></Field>
              <Field label="Comercializadora"><Input value={el.provider} onChange={event => setEl({ ...el, provider: event.target.value })} /></Field>
              <Field label="Consumo (kWh)"><Input type="number" step="any" min="0" value={el.kwh} onChange={event => setEl({ ...el, kwh: event.target.value })} /></Field>
              <Field label="Valor de la factura (opcional)"><Input type="number" step="any" value={el.invoiceValue} onChange={event => setEl({ ...el, invoiceValue: event.target.value })} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="hc2-evidence-step">
              <label className="hc2-evidence-drop">
                <Upload size={22} />
                <span>{evidenceFiles?.length ? `${evidenceFiles.length} archivo(s) seleccionado(s)` : 'Adjunta factura, foto del medidor u otra evidencia (PDF, PNG, JPG)'}</span>
                <input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={event => setEvidenceFiles(event.target.files)} hidden />
              </label>
              <p className="hc2-hint">La evidencia es opcional en este paso, pero recomendable para la trazabilidad del dato.</p>
            </div>
          )}

          {step === 4 && (
            <div className="hc2-review">
              <h4>Vista previa del cálculo</h4>
              {!activePreview ? (
                <p className="hc2-hint">Completa los datos de actividad para ver el cálculo.</p>
              ) : (
                <div className="hc2-calc-preview">
                  {'energyMj' in activePreview && activePreview.energyMj > 0 && <div><span>Energía</span><strong>{activePreview.energyMj.toLocaleString('es-CO', { maximumFractionDigits: 1 })} MJ</strong></div>}
                  {activePreview.co2Kg > 0 && <div><span>CO2</span><strong>{activePreview.co2Kg.toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg</strong></div>}
                  {activePreview.ch4Kg > 0 && <div><span>CH4</span><strong>{activePreview.ch4Kg.toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg</strong></div>}
                  {activePreview.n2oKg > 0 && <div><span>N2O</span><strong>{activePreview.n2oKg.toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg</strong></div>}
                  <div className="hc2-calc-total"><span>Total CO2e</span><strong>{activePreview.co2eTon.toLocaleString('es-CO', { maximumFractionDigits: 3 })} tCO2e</strong></div>
                </div>
              )}
              <p className="hc2-hint">El registro queda <b>pendiente de revisión</b> hasta que alguien con permiso de gestión lo valide desde el Inventario — o guárdalo como borrador para completarlo después.</p>
            </div>
          )}
        </div>

        <div className="hc2-step-actions">
          <Button variant="secondary" onClick={() => setStep(current => Math.max(0, current - 1))} disabled={step === 0}><ChevronLeft size={15} /> Anterior</Button>
          {step < STEPS.length - 1 ? (
            <Button identity={carbonIdentity} onClick={() => setStep(current => current + 1)} disabled={!canAdvance()}>Siguiente <ChevronRight size={15} /></Button>
          ) : (
            <div className="hc2-step-actions-final">
              <Button variant="secondary" onClick={() => void submit('BORRADOR')} disabled={saving}><Save size={15} /> Guardar borrador</Button>
              <Button identity={carbonIdentity} onClick={() => void submit('PENDIENTE')} disabled={saving || !activePreview}><Check size={15} /> Finalizar registro</Button>
            </div>
          )}
        </div>
      </Card>
    </CarbonShell>
  )
}
