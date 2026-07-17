import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Download, Save } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Label, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/platform/auth/AuthContext'
import { Button, Card, Field, Select, moduleIdentity } from '@/design-system'
import { adherenceService } from '../services/adherenceService'
import type { Area, ConceptKey, Dashboard, Position, Professional, Threshold } from '../types'
import { CONCEPT_COLORS, CONCEPT_LABELS } from '../design/scopeColors'
import { ConceptBadge } from '../design/ConceptBadge'
import { ComplianceRing } from '../design/ComplianceRing'
import { GradientButton } from '../design/GradientButton'
import { ToastStack } from '../design/Toast'

const identity = moduleIdentity('adherence-matrix')
const conceptOrder: ConceptKey[] = ['OPTIMO', 'ACEPTABLE', 'DEFICIENTE', 'MUY_DEFICIENTE']

function formatPercent(value: number | null) {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`
}

const emptyDashboard: Dashboard = { totalEvaluations: 0, averageCompliance: null, byConcept: { OPTIMO: 0, ACEPTABLE: 0, DEFICIENTE: 0, MUY_DEFICIENTE: 0 }, byScope: [], byProfessional: [], byMonth: [] }

const GRADIENT_IDS: Record<string, string> = { OPTIMO: 'gradOptimo', ACEPTABLE: 'gradAceptable', DEFICIENTE: 'gradDeficiente', MUY_DEFICIENTE: 'gradMuyDeficiente' }

function ComplianceGradientDefs() {
  return (
    <defs>
      {conceptOrder.map(concept => (
        <linearGradient key={concept} id={GRADIENT_IDS[concept]} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={CONCEPT_COLORS[concept]} stopOpacity={0.65} />
          <stop offset="100%" stopColor={CONCEPT_COLORS[concept]} stopOpacity={1} />
        </linearGradient>
      ))}
      <linearGradient id="gradNeutral" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.5} />
        <stop offset="100%" stopColor="#94A3B8" stopOpacity={0.9} />
      </linearGradient>
    </defs>
  )
}

function gradientFor(value: number | null, thresholds: Threshold[]) {
  if (value === null) return 'url(#gradNeutral)'
  const sorted = [...thresholds].sort((left, right) => right.min_percent - left.min_percent)
  const match = sorted.find(threshold => value >= threshold.min_percent)
  return match ? `url(#${GRADIENT_IDS[match.concept]})` : 'url(#gradNeutral)'
}

export default function DashboardPanel({ areas, positions, professionals }: { areas: Area[]; positions: Position[]; professionals: Professional[] }) {
  const { session } = useAuth()
  const canManage = (session?.permissions || []).includes('adherence_matrix.manage')

  const [areaId, setAreaId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [monthReported, setMonthReported] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard)
  const [thresholds, setThresholds] = useState<Threshold[]>([])
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3500) }
  const fail = (caught: unknown, fallback: string) => setError(caught instanceof Error ? caught.message : fallback)

  const filters = useMemo(() => ({ areaId, professionalId, positionId, monthReported }), [areaId, professionalId, positionId, monthReported])

  const loadDashboard = () => adherenceService.dashboard(filters).then(setDashboard).catch(caught => fail(caught, 'No fue posible cargar el tablero'))
  useEffect(() => { void loadDashboard() }, [areaId, professionalId, positionId, monthReported])

  useEffect(() => {
    void adherenceService.thresholds().then(rows => {
      setThresholds(rows)
      setThresholdDraft(Object.fromEntries(rows.map(row => [row.concept, String(row.min_percent)])))
    }).catch(caught => fail(caught, 'No fue posible cargar los umbrales'))
  }, [])

  const saveThreshold = async (concept: string) => {
    const value = Number(thresholdDraft[concept])
    if (!Number.isFinite(value) || value < 0 || value > 100) { setError('El umbral debe ser un número entre 0 y 100'); return }
    setBusy(true); setError('')
    try {
      const updated = await adherenceService.updateThreshold(concept, value)
      setThresholds(current => current.map(item => item.concept === concept ? updated : item))
      notify('Umbral actualizado')
    } catch (caught) { fail(caught, 'No fue posible guardar el umbral') } finally { setBusy(false) }
  }

  const downloadPdf = async () => {
    setBusy(true); setError('')
    try { await adherenceService.downloadDashboardReport(filters) }
    catch (caught) { fail(caught, 'No fue posible generar el informe') } finally { setBusy(false) }
  }

  const conceptData = conceptOrder.map(concept => ({ concept, label: CONCEPT_LABELS[concept], value: dashboard.byConcept[concept] || 0 }))
  const scopeData = [...dashboard.byScope].sort((left, right) => right.averageCompliance - left.averageCompliance)
    .map(item => ({ name: `${item.areaName} · ${item.scopeName}`, value: Number(item.averageCompliance.toFixed(1)) }))
  const professionalData = dashboard.byProfessional
    .map(item => ({ name: item.professionalName, value: item.averageCompliance === null ? null : Number(item.averageCompliance.toFixed(1)) }))
  const monthData = dashboard.byMonth
    .map(item => ({ name: item.month, value: item.averageCompliance === null ? null : Number(item.averageCompliance.toFixed(1)) }))

  const chartHeight = (rows: number) => Math.max(120, rows * 34 + 40)

  return (
    <div className="space-y-5">
      <ToastStack notice={notice} error={error} onDismissError={() => setError('')} />

      <div className="matrix-toolbar-glass">
        <div className="matrix-toolbar-glass-top">
          <div>
            <p className="ds-eyebrow">Matrices de adherencia</p>
            <h2 className="mt-1 text-xl font-black">Dashboard de cumplimiento</h2>
          </div>
          <GradientButton variant="ghost" onClick={() => void downloadPdf()} disabled={busy}><Download size={16} />Exportar PDF</GradientButton>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]"><Field label="Área"><Select value={areaId || 'ALL'} onChange={value => setAreaId(value === 'ALL' ? '' : value)} options={[{ value: 'ALL', label: 'Todas' }, ...areas.map(area => ({ value: area.id, label: area.name }))]} /></Field></div>
          <div className="min-w-[220px]"><Field label="Profesional"><Select value={professionalId || 'ALL'} onChange={value => setProfessionalId(value === 'ALL' ? '' : value)} options={[{ value: 'ALL', label: 'Todos' }, ...professionals.map(professional => ({ value: professional.id, label: professional.full_name }))]} /></Field></div>
          <div className="min-w-[180px]"><Field label="Cargo"><Select value={positionId || 'ALL'} onChange={value => setPositionId(value === 'ALL' ? '' : value)} options={[{ value: 'ALL', label: 'Todos' }, ...positions.map(position => ({ value: position.id, label: position.name }))]} /></Field></div>
          <div className="min-w-[180px]"><Field label="Mes reportado"><input className="ds-input" value={monthReported} onChange={event => setMonthReported(event.target.value)} placeholder="Ej. Julio 2026" /></Field></div>
        </div>
      </div>

      {/* Bento: el cumplimiento promedio es el dato protagonista (hero 2x2) — evaluaciones y
          distribucion por concepto son secundarios, ya no una fila de cajas identicas. */}
      <div className="ds-bento">
        <Card accent={identity.color} className="ds-bento-item ds-bento-hero p-6">
          <p className="ds-module-badge" style={{ ['--ds-eyebrow-color' as string]: identity.color }}>Cumplimiento promedio</p>
          <div className="ds-bento-hero-content">
            <ComplianceRing percent={dashboard.averageCompliance} size={84} strokeWidth={8} />
            <strong className="ds-bento-hero-value font-black leading-none">{formatPercent(dashboard.averageCompliance)}</strong>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {conceptOrder.map(concept => <ConceptBadge key={concept} concept={concept} size="sm" />)}
          </div>
        </Card>

        <Card accent={identity.color} className="ds-bento-item flex flex-col justify-center gap-2 p-5">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-full text-white" style={{ backgroundImage: `linear-gradient(135deg, ${identity.gradientFrom}, ${identity.gradientTo})` }}><ClipboardList size={20} /></span>
          <p className="ds-eyebrow">Evaluaciones</p>
          <strong className="text-2xl font-black">{dashboard.totalEvaluations}</strong>
        </Card>

        <Card accent={identity.color} className="ds-bento-item ds-bento-wide p-5">
          <p className="ds-eyebrow">Distribución</p>
          <h2 className="mt-1 text-lg font-black">Distribución por concepto</h2>
          <div style={{ width: '100%', height: chartHeight(conceptData.length) }} className="mt-3">
            <ResponsiveContainer>
              <BarChart data={conceptData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <ComplianceGradientDefs />
                <CartesianGrid horizontal={false} stroke="#e5e9f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: '#344054' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: unknown) => [`${value} evaluaciones`, '']} labelStyle={{ color: '#172033' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                  {conceptData.map(item => <Cell key={item.concept} fill={`url(#${GRADIENT_IDS[item.concept]})`} />)}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: '#344054' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts de volumen variable (crecen con la cantidad de ambitos/profesionales) — grid de
          2 columnas en vez de una sola columna larga, sin forzar alturas iguales artificiales. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Ámbitos</p>
          <h2 className="mt-1 text-lg font-black">Cumplimiento por ámbito</h2>
          {scopeData.length ? (
            <div style={{ width: '100%', height: chartHeight(scopeData.length) }} className="mt-3">
              <ResponsiveContainer>
                <BarChart data={scopeData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <ComplianceGradientDefs />
                  <CartesianGrid horizontal={false} stroke="#e5e9f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11, fill: '#344054' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: unknown) => [`${value}%`, 'Cumplimiento']} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                    {scopeData.map(item => <Cell key={item.name} fill={gradientFor(item.value, thresholds)} />)}
                    <LabelList dataKey="value" position="right" formatter={(value: unknown) => `${value}%`} style={{ fontSize: 11, fill: '#344054' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
        </Card>

        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Comparativo</p>
          <h2 className="mt-1 text-lg font-black">Ranking de profesionales</h2>
          {professionalData.length ? (
            <div style={{ width: '100%', height: chartHeight(professionalData.length) }} className="mt-3">
              <ResponsiveContainer>
                <BarChart data={professionalData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <ComplianceGradientDefs />
                  <CartesianGrid horizontal={false} stroke="#e5e9f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11, fill: '#344054' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: unknown) => [value === null || value === undefined ? 'N/A' : `${value}%`, 'Cumplimiento']} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                    {professionalData.map(item => <Cell key={item.name} fill={gradientFor(item.value, thresholds)} />)}
                    <LabelList dataKey="value" position="right" formatter={(value: unknown) => value === null || value === undefined ? 'N/A' : `${value}%`} style={{ fontSize: 11, fill: '#344054' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
        </Card>
      </div>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Tendencia</p>
        <h2 className="mt-1 text-lg font-black">Evolución por mes reportado</h2>
        {monthData.length ? (
          <div style={{ width: '100%', height: 260 }} className="mt-3">
            <ResponsiveContainer>
              <LineChart data={monthData} margin={{ left: 8, right: 24, top: 10 }}>
                <defs>
                  <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e9f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: unknown) => [value === null || value === undefined ? 'N/A' : `${value}%`, 'Cumplimiento']} />
                <ReferenceLine y={80} stroke="#94a3b8" strokeDasharray="4 4"><Label value="Aceptable (80%)" position="insideTopRight" fill="#94a3b8" fontSize={10} /></ReferenceLine>
                <Line type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 4, fill: '#4F46E5' }} connectNulls fill="url(#lineFill)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
      </Card>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Escala</p>
        <h2 className="mt-1 text-lg font-black">Umbrales de concepto</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {thresholds.map(threshold => (
            <div key={threshold.concept} className="flex items-center gap-3">
              <ConceptBadge concept={threshold.concept as ConceptKey} size="sm" />
              {canManage ? (
                <>
                  <input type="number" min={0} max={100} className="ds-input w-24" value={thresholdDraft[threshold.concept] ?? ''} onChange={event => setThresholdDraft({ ...thresholdDraft, [threshold.concept]: event.target.value })} />
                  <Button variant="secondary" onClick={() => void saveThreshold(threshold.concept)} disabled={busy}><Save size={14} />Guardar</Button>
                </>
              ) : <span className="text-sm text-[var(--muted)]">≥ {threshold.min_percent}%</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
