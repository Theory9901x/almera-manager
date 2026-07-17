import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { Badge, Button, Card, DatePicker, Field, Input, PageHeader, Table, ToastProvider, moduleIdentity, useToast } from '@/design-system'
import { carbonService } from '../services/carbonService'
import type { CarbonBlock, EmissionFactor } from '../types'

const identity = moduleIdentity('carbon-footprint')

export default function CarbonConfigPage() {
  return <ToastProvider><CarbonConfigContent /></ToastProvider>
}

function CarbonConfigContent() {
  const navigate = useNavigate()
  const toast = useToast()
  const [blocks, setBlocks] = useState<CarbonBlock[]>([])
  const [factors, setFactors] = useState<EmissionFactor[]>([])
  const [showFactorForm, setShowFactorForm] = useState(false)
  const [factorForm, setFactorForm] = useState({ blockKey: '', subtype: '', subtypeLabel: '', value: '', unit: '', validFrom: '', methodologySource: '' })

  async function load() {
    const [blockList, factorList] = await Promise.all([carbonService.blocks(), carbonService.factors()])
    setBlocks(blockList)
    setFactors(factorList)
  }

  useEffect(() => { void load() }, [])

  async function toggleBlock(block: CarbonBlock) {
    try {
      await carbonService.updateBlock(block.id, { enabled: !block.enabled, responsibleMembershipId: block.responsible_membership_id })
      toast.push('success', !block.enabled ? `"${block.name}" habilitada` : `"${block.name}" deshabilitada`)
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible actualizar') }
  }

  async function createFactor() {
    if (!factorForm.blockKey || !factorForm.subtype || !factorForm.value || !factorForm.unit || !factorForm.validFrom || !factorForm.methodologySource) {
      toast.push('error', 'Completa todos los campos del factor')
      return
    }
    try {
      await carbonService.createFactor({ ...factorForm, value: Number(factorForm.value) })
      toast.push('success', 'Factor de emisión guardado — cierra automáticamente la vigencia del anterior')
      setShowFactorForm(false)
      setFactorForm({ blockKey: '', subtype: '', subtypeLabel: '', value: '', unit: '', validFrom: '', methodologySource: '' })
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar el factor') }
  }

  return (
    <div className="carbon-module">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          eyebrow="Ambiental"
          title="Configuración de Huella de Carbono"
          description="Activa variables adicionales, asigna responsables de captura y administra los factores de emisión."
          identity={identity}
          actions={<Button variant="secondary" onClick={() => navigate('/app/huella-carbono')}><ArrowLeft size={15} /> Dashboard</Button>}
        />

        <Card accent={identity.color} className="p-5">
          <h3 className="mb-3 text-base font-bold">Variables</h3>
          <div className="space-y-2">
            {blocks.map(block => (
              <div key={block.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <strong className="text-sm">{block.name}</strong>
                    {block.is_core && <Badge tone="info">Núcleo</Badge>}
                    <Badge tone="neutral">{block.scope === 'VARIABLE' ? 'Alcance 1 o 3' : block.scope.replace('SCOPE_', 'Alcance ')}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{block.description}</p>
                </div>
                <Button variant={block.enabled ? 'secondary' : 'primary'} identity={identity} onClick={() => toggleBlock(block)}>
                  {block.enabled ? 'Deshabilitar' : 'Habilitar'}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card accent={identity.color} className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold">Factores de emisión</h3>
            <Button variant="secondary" onClick={() => setShowFactorForm(current => !current)}><Plus size={15} /> Nuevo factor</Button>
          </div>

          {showFactorForm && (
            <div className="mb-4 grid gap-3 rounded-xl border border-[var(--border-subtle)] p-4 sm:grid-cols-2">
              <Field label="Variable (key)"><Input value={factorForm.blockKey} onChange={event => setFactorForm({ ...factorForm, blockKey: event.target.value })} placeholder="ej. electricity" /></Field>
              <Field label="Subtipo (key)"><Input value={factorForm.subtype} onChange={event => setFactorForm({ ...factorForm, subtype: event.target.value })} placeholder="ej. electricidad_sin" /></Field>
              <Field label="Etiqueta visible"><Input value={factorForm.subtypeLabel} onChange={event => setFactorForm({ ...factorForm, subtypeLabel: event.target.value })} placeholder="ej. Electricidad (SIN Colombia)" /></Field>
              <Field label="Valor"><Input type="number" step="any" value={factorForm.value} onChange={event => setFactorForm({ ...factorForm, value: event.target.value })} /></Field>
              <Field label="Unidad"><Input value={factorForm.unit} onChange={event => setFactorForm({ ...factorForm, unit: event.target.value })} placeholder="kgCO2e/litro, gCO2/kWh..." /></Field>
              <Field label="Vigente desde"><DatePicker value={factorForm.validFrom} onChange={value => setFactorForm({ ...factorForm, validFrom: value })} /></Field>
              <div className="sm:col-span-2"><Field label="Fuente metodológica"><Input value={factorForm.methodologySource} onChange={event => setFactorForm({ ...factorForm, methodologySource: event.target.value })} placeholder="ej. UPME/XM 2024" /></Field></div>
              <div className="sm:col-span-2"><Button identity={identity} onClick={createFactor}>Guardar factor</Button></div>
            </div>
          )}

          <Table>
            <thead><tr><th>Variable</th><th>Subtipo</th><th>Valor</th><th>Vigencia</th><th>Fuente</th></tr></thead>
            <tbody>
              {factors.map(factor => (
                <tr key={factor.id}>
                  <td>{factor.block_key}</td>
                  <td>{factor.subtype_label}</td>
                  <td>{factor.value} {factor.unit}</td>
                  <td>{new Date(factor.valid_from).toLocaleDateString('es-CO')} — {factor.valid_to ? new Date(factor.valid_to).toLocaleDateString('es-CO') : 'vigente'}</td>
                  <td className="text-xs text-[var(--muted)]">{factor.methodology_source}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
