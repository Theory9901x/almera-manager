import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Card, DatePicker, Field, Input, Table, ToastProvider, useToast } from '@/design-system'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { carbonService } from '../services/carbonService'
import type { BiofuelBlend, ElectricityFactor, FuelType, GwpEntry, ReductionTarget } from '../types'

export default function CarbonFactorsPage() {
  return <ToastProvider><CarbonFactorsContent /></ToastProvider>
}

function CarbonFactorsContent() {
  const toast = useToast()
  const [fuels, setFuels] = useState<FuelType[]>([])
  const [gwp, setGwp] = useState<GwpEntry[]>([])
  const [electricityFactors, setElectricityFactors] = useState<ElectricityFactor[]>([])
  const [blends, setBlends] = useState<BiofuelBlend[]>([])
  const [targets, setTargets] = useState<ReductionTarget[]>([])
  const [editingFuel, setEditingFuel] = useState<string | null>(null)
  const [fuelDraft, setFuelDraft] = useState<Record<string, string>>({})
  const [electricityForm, setElectricityForm] = useState({ validFrom: '', valueKgco2ePerKwh: '', source: '', label: '' })
  const [blendForm, setBlendForm] = useState({ validFrom: '', biodieselPercent: '', bioethanolPercent: '', source: '' })
  const [targetForm, setTargetForm] = useState({ baseYear: '', baseValueTon: '', targetYear: '', targetReductionPercent: '' })

  async function load() {
    const [fuelList, gwpList, elFactors, blendList, targetList] = await Promise.all([
      carbonService.fuels(), carbonService.gwp(), carbonService.electricityFactors(), carbonService.biofuelBlends(), carbonService.targets(),
    ])
    setFuels(fuelList); setGwp(gwpList); setElectricityFactors(elFactors); setBlends(blendList); setTargets(targetList)
  }
  useEffect(() => { void load() }, [])

  function startEdit(fuel: FuelType) {
    setEditingFuel(fuel.fuel_key)
    setFuelDraft({
      densityKgPerUnit: fuel.density_kg_per_unit != null ? String(fuel.density_kg_per_unit) : '', heatingValueMjPerKg: String(fuel.heating_value_mj_per_kg),
      feStationaryCo2GMj: fuel.fe_stationary_co2_g_mj != null ? String(fuel.fe_stationary_co2_g_mj) : '', feStationaryCh4GMj: fuel.fe_stationary_ch4_g_mj != null ? String(fuel.fe_stationary_ch4_g_mj) : '', feStationaryN2oGMj: fuel.fe_stationary_n2o_g_mj != null ? String(fuel.fe_stationary_n2o_g_mj) : '',
      feMobileCo2GMj: fuel.fe_mobile_co2_g_mj != null ? String(fuel.fe_mobile_co2_g_mj) : '', feMobileCh4GMj: fuel.fe_mobile_ch4_g_mj != null ? String(fuel.fe_mobile_ch4_g_mj) : '', feMobileN2oGMj: fuel.fe_mobile_n2o_g_mj != null ? String(fuel.fe_mobile_n2o_g_mj) : '',
      factorSource: fuel.factor_source,
    })
  }

  async function saveFuel(fuelKey: string) {
    try {
      await carbonService.updateFuel(fuelKey, {
        densityKgPerUnit: fuelDraft.densityKgPerUnit ? Number(fuelDraft.densityKgPerUnit) : null, heatingValueMjPerKg: Number(fuelDraft.heatingValueMjPerKg),
        feStationaryCo2GMj: fuelDraft.feStationaryCo2GMj ? Number(fuelDraft.feStationaryCo2GMj) : null, feStationaryCh4GMj: fuelDraft.feStationaryCh4GMj ? Number(fuelDraft.feStationaryCh4GMj) : null, feStationaryN2oGMj: fuelDraft.feStationaryN2oGMj ? Number(fuelDraft.feStationaryN2oGMj) : null,
        feMobileCo2GMj: fuelDraft.feMobileCo2GMj ? Number(fuelDraft.feMobileCo2GMj) : null, feMobileCh4GMj: fuelDraft.feMobileCh4GMj ? Number(fuelDraft.feMobileCh4GMj) : null, feMobileN2oGMj: fuelDraft.feMobileN2oGMj ? Number(fuelDraft.feMobileN2oGMj) : null,
        factorSource: fuelDraft.factorSource,
      })
      toast.push('success', 'Factor actualizado — los cálculos ya guardados no se ven afectados')
      setEditingFuel(null)
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible actualizar') }
  }

  async function addElectricityFactor() {
    if (!electricityForm.validFrom || !electricityForm.valueKgco2ePerKwh || !electricityForm.source) { toast.push('error', 'Completa vigencia, valor y fuente'); return }
    try {
      await carbonService.addElectricityFactor({ ...electricityForm, valueKgco2ePerKwh: Number(electricityForm.valueKgco2ePerKwh), label: electricityForm.label || 'Factor de red' })
      toast.push('success', 'Nuevo factor eléctrico guardado — cierra la vigencia del anterior')
      setElectricityForm({ validFrom: '', valueKgco2ePerKwh: '', source: '', label: '' })
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar') }
  }

  async function addBlend() {
    if (!blendForm.validFrom || !blendForm.biodieselPercent || !blendForm.bioethanolPercent || !blendForm.source) { toast.push('error', 'Completa todos los campos'); return }
    try {
      await carbonService.addBiofuelBlend({ ...blendForm, biodieselPercent: Number(blendForm.biodieselPercent), bioethanolPercent: Number(blendForm.bioethanolPercent) })
      toast.push('success', 'Nuevo corte de biocombustible guardado')
      setBlendForm({ validFrom: '', biodieselPercent: '', bioethanolPercent: '', source: '' })
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar') }
  }

  async function saveTarget() {
    if (!targetForm.baseYear || !targetForm.baseValueTon || !targetForm.targetYear || !targetForm.targetReductionPercent) { toast.push('error', 'Completa todos los campos de la meta'); return }
    try {
      await carbonService.saveTarget({
        baseYear: Number(targetForm.baseYear), baseValueKgco2e: Number(targetForm.baseValueTon) * 1000,
        targetYear: Number(targetForm.targetYear), targetReductionPercent: Number(targetForm.targetReductionPercent),
      })
      toast.push('success', 'Meta de reducción guardada')
      setTargetForm({ baseYear: '', baseValueTon: '', targetYear: '', targetReductionPercent: '' })
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar la meta') }
  }

  return (
    <CarbonShell title="Factores de emisión" subtitle="Catálogo de combustibles, factor eléctrico, mezcla de biocombustibles y metas — administración restringida">
      <Card accent={carbonIdentity.color} className="p-0">
        <div className="p-4"><h3 className="hc2-card-title">Combustibles</h3></div>
        <Table>
          <thead><tr><th>Combustible</th><th>Unidad</th><th className="text-right">Densidad</th><th className="text-right">PC (MJ/kg)</th><th className="text-right">FE CO2 estac.</th><th className="text-right">FE CO2 móvil</th><th>Fuente</th><th></th></tr></thead>
          <tbody>
            {fuels.map(fuel => (
              editingFuel === fuel.fuel_key ? (
                <tr key={fuel.fuel_key}>
                  <td colSpan={8}>
                    <div className="hc2-form-grid" style={{ padding: '8px 0' }}>
                      <Field label="Densidad kg/unidad"><Input type="number" step="any" value={fuelDraft.densityKgPerUnit} onChange={event => setFuelDraft({ ...fuelDraft, densityKgPerUnit: event.target.value })} /></Field>
                      <Field label="Poder calorífico MJ/kg"><Input type="number" step="any" value={fuelDraft.heatingValueMjPerKg} onChange={event => setFuelDraft({ ...fuelDraft, heatingValueMjPerKg: event.target.value })} /></Field>
                      <Field label="FE CO2 estacionaria (g/MJ)"><Input type="number" step="any" value={fuelDraft.feStationaryCo2GMj} onChange={event => setFuelDraft({ ...fuelDraft, feStationaryCo2GMj: event.target.value })} /></Field>
                      <Field label="FE CH4 estacionaria (g/MJ)"><Input type="number" step="any" value={fuelDraft.feStationaryCh4GMj} onChange={event => setFuelDraft({ ...fuelDraft, feStationaryCh4GMj: event.target.value })} /></Field>
                      <Field label="FE N2O estacionaria (g/MJ)"><Input type="number" step="any" value={fuelDraft.feStationaryN2oGMj} onChange={event => setFuelDraft({ ...fuelDraft, feStationaryN2oGMj: event.target.value })} /></Field>
                      <Field label="FE CO2 móvil (g/MJ)"><Input type="number" step="any" value={fuelDraft.feMobileCo2GMj} onChange={event => setFuelDraft({ ...fuelDraft, feMobileCo2GMj: event.target.value })} /></Field>
                      <Field label="FE CH4 móvil (g/MJ)"><Input type="number" step="any" value={fuelDraft.feMobileCh4GMj} onChange={event => setFuelDraft({ ...fuelDraft, feMobileCh4GMj: event.target.value })} /></Field>
                      <Field label="FE N2O móvil (g/MJ)"><Input type="number" step="any" value={fuelDraft.feMobileN2oGMj} onChange={event => setFuelDraft({ ...fuelDraft, feMobileN2oGMj: event.target.value })} /></Field>
                      <div className="hc2-form-full"><Field label="Fuente"><Input value={fuelDraft.factorSource} onChange={event => setFuelDraft({ ...fuelDraft, factorSource: event.target.value })} /></Field></div>
                      <div className="hc2-form-full" style={{ display: 'flex', gap: 8 }}>
                        <Button identity={carbonIdentity} onClick={() => void saveFuel(fuel.fuel_key)}>Guardar</Button>
                        <Button variant="secondary" onClick={() => setEditingFuel(null)}>Cancelar</Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={fuel.fuel_key}>
                  <td>{fuel.label}</td><td>{fuel.native_unit}</td>
                  <td className="text-right">{fuel.density_kg_per_unit ?? '—'}</td>
                  <td className="text-right">{fuel.heating_value_mj_per_kg}</td>
                  <td className="text-right">{fuel.fe_stationary_co2_g_mj ?? '—'}</td>
                  <td className="text-right">{fuel.fe_mobile_co2_g_mj ?? '—'}</td>
                  <td className="text-xs">{fuel.factor_source}</td>
                  <td><Button variant="secondary" onClick={() => startEdit(fuel)}>Editar</Button></td>
                </tr>
              )
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="hc2-grid-2">
        <Card accent={carbonIdentity.color} className="p-5">
          <h3 className="hc2-card-title">Factor de emisión de la red eléctrica</h3>
          <Table>
            <thead><tr><th>Vigencia</th><th className="text-right">kgCO2e/kWh</th><th>Fuente</th></tr></thead>
            <tbody>{electricityFactors.map(factor => (
              <tr key={factor.id}><td>{new Date(factor.valid_from).toLocaleDateString('es-CO')} — {factor.valid_to ? new Date(factor.valid_to).toLocaleDateString('es-CO') : 'vigente'}</td><td className="text-right">{factor.value_kgco2e_per_kwh}</td><td className="text-xs">{factor.source}</td></tr>
            ))}</tbody>
          </Table>
          <div className="hc2-form-grid" style={{ marginTop: 12 }}>
            <Field label="Vigente desde"><DatePicker value={electricityForm.validFrom} onChange={value => setElectricityForm({ ...electricityForm, validFrom: value })} /></Field>
            <Field label="Valor (kgCO2e/kWh)"><Input type="number" step="any" value={electricityForm.valueKgco2ePerKwh} onChange={event => setElectricityForm({ ...electricityForm, valueKgco2ePerKwh: event.target.value })} /></Field>
            <div className="hc2-form-full"><Field label="Fuente"><Input value={electricityForm.source} onChange={event => setElectricityForm({ ...electricityForm, source: event.target.value })} /></Field></div>
            <div className="hc2-form-full"><Button variant="secondary" onClick={() => void addElectricityFactor()}><Plus size={14} /> Nueva vigencia</Button></div>
          </div>
        </Card>

        <Card accent={carbonIdentity.color} className="p-5">
          <h3 className="hc2-card-title">Corte de biocombustibles</h3>
          <Table>
            <thead><tr><th>Vigencia</th><th className="text-right">Biodiésel</th><th className="text-right">Bioetanol</th></tr></thead>
            <tbody>{blends.map(blend => (
              <tr key={blend.id}><td>{new Date(blend.valid_from).toLocaleDateString('es-CO')} — {blend.valid_to ? new Date(blend.valid_to).toLocaleDateString('es-CO') : 'vigente'}</td><td className="text-right">{blend.biodiesel_percent}%</td><td className="text-right">{blend.bioethanol_percent}%</td></tr>
            ))}</tbody>
          </Table>
          <div className="hc2-form-grid" style={{ marginTop: 12 }}>
            <Field label="Vigente desde"><DatePicker value={blendForm.validFrom} onChange={value => setBlendForm({ ...blendForm, validFrom: value })} /></Field>
            <Field label="Biodiésel en diésel (%)"><Input type="number" step="any" value={blendForm.biodieselPercent} onChange={event => setBlendForm({ ...blendForm, biodieselPercent: event.target.value })} /></Field>
            <Field label="Bioetanol en gasolina (%)"><Input type="number" step="any" value={blendForm.bioethanolPercent} onChange={event => setBlendForm({ ...blendForm, bioethanolPercent: event.target.value })} /></Field>
            <div className="hc2-form-full"><Field label="Fuente"><Input value={blendForm.source} onChange={event => setBlendForm({ ...blendForm, source: event.target.value })} /></Field></div>
            <div className="hc2-form-full"><Button variant="secondary" onClick={() => void addBlend()}><Plus size={14} /> Nueva vigencia</Button></div>
          </div>
        </Card>
      </div>

      <Card accent={carbonIdentity.color} className="p-5">
        <h3 className="hc2-card-title">Potencial de calentamiento global (IPCC AR4, 100 años)</h3>
        <Table>
          <thead><tr><th>Gas</th><th className="text-right">GWP</th><th>Fuente</th></tr></thead>
          <tbody>{gwp.map(entry => <tr key={entry.gas_key}><td>{entry.label} ({entry.gas_key})</td><td className="text-right">{entry.gwp_value}</td><td className="text-xs">{entry.source}</td></tr>)}</tbody>
        </Table>
        <p className="hc2-hint">Fijo por decisión metodológica — no se edita desde aquí, ya que alteraría retroactivamente cálculos ya firmados en informes anteriores.</p>
      </Card>

      <Card accent={carbonIdentity.color} className="p-5">
        <h3 className="hc2-card-title">Metas de reducción</h3>
        <Table>
          <thead><tr><th>Año base</th><th className="text-right">Valor base</th><th>Año meta</th><th className="text-right">% reducción</th></tr></thead>
          <tbody>{targets.map(target => <tr key={target.id}><td>{target.base_year}</td><td className="text-right">{(Number(target.base_value_kgco2e) / 1000).toFixed(3)} t</td><td>{target.target_year}</td><td className="text-right">{target.target_reduction_percent}%</td></tr>)}</tbody>
        </Table>
        <div className="hc2-form-grid" style={{ marginTop: 12 }}>
          <Field label="Año base"><Input type="number" value={targetForm.baseYear} onChange={event => setTargetForm({ ...targetForm, baseYear: event.target.value })} /></Field>
          <Field label="Valor base (tCO2e)"><Input type="number" step="any" value={targetForm.baseValueTon} onChange={event => setTargetForm({ ...targetForm, baseValueTon: event.target.value })} /></Field>
          <Field label="Año meta"><Input type="number" value={targetForm.targetYear} onChange={event => setTargetForm({ ...targetForm, targetYear: event.target.value })} /></Field>
          <Field label="% de reducción"><Input type="number" step="any" value={targetForm.targetReductionPercent} onChange={event => setTargetForm({ ...targetForm, targetReductionPercent: event.target.value })} /></Field>
          <div className="hc2-form-full"><Button variant="secondary" onClick={() => void saveTarget()}><Plus size={14} /> Guardar meta</Button></div>
        </div>
      </Card>
    </CarbonShell>
  )
}
