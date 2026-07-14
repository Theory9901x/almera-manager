import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Save, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Label, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/platform/auth/AuthContext'
import { Badge, Button, Card, Field, StatCard } from '@/shared/ui'
import { adherenceService } from '../services/adherenceService'
import type { Area, ConceptKey, Dashboard, Position, Professional, Threshold } from '../types'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

const conceptLabels: Record<ConceptKey, string> = { OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente' }
const conceptColors: Record<ConceptKey, string> = { OPTIMO: '#087a54', ACEPTABLE: '#315fae', DEFICIENTE: '#a8640d', MUY_DEFICIENTE: '#c7192d' }
const conceptTones: Record<ConceptKey, Tone> = { OPTIMO: 'success', ACEPTABLE: 'info', DEFICIENTE: 'warning', MUY_DEFICIENTE: 'danger' }
const conceptOrder: ConceptKey[] = ['OPTIMO', 'ACEPTABLE', 'DEFICIENTE', 'MUY_DEFICIENTE']
const neutralGray = '#94a3b8'

function colorForPercent(value: number | null, thresholds: Threshold[]) {
  if (value === null) return neutralGray
  const sorted = [...thresholds].sort((left, right) => right.min_percent - left.min_percent)
  const match = sorted.find(threshold => value >= threshold.min_percent)
  return match ? conceptColors[match.concept] : neutralGray
}

function formatPercent(value: number | null) {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`
}

const emptyDashboard: Dashboard = { totalEvaluations: 0, averageCompliance: null, byConcept: { OPTIMO: 0, ACEPTABLE: 0, DEFICIENTE: 0, MUY_DEFICIENTE: 0 }, byScope: [], byProfessional: [], byMonth: [] }

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

  const conceptData = conceptOrder.map(concept => ({ concept, label: conceptLabels[concept], value: dashboard.byConcept[concept] || 0, color: conceptColors[concept] }))
  const scopeData = [...dashboard.byScope].sort((left, right) => right.averageCompliance - left.averageCompliance)
    .map(item => ({ name: `${item.areaName} · ${item.scopeName}`, value: Number(item.averageCompliance.toFixed(1)) }))
  const professionalData = dashboard.byProfessional
    .map(item => ({ name: item.professionalName, value: item.averageCompliance === null ? null : Number(item.averageCompliance.toFixed(1)) }))
  const monthData = dashboard.byMonth
    .map(item => ({ name: item.month, value: item.averageCompliance === null ? null : Number(item.averageCompliance.toFixed(1)) }))

  const chartHeight = (rows: number) => Math.max(120, rows * 34 + 40)

  return (
    <div className="space-y-5">
      {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
      {notice && <div className="almera-notice"><CheckCircle2 size={17} />{notice}</div>}

      <Card className="p-5">
        <p className="eyebrow">Filtros</p>
        <h2 className="mt-1 text-xl font-black">Tablero de adherencia</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]"><Field label="Área"><select value={areaId} onChange={event => setAreaId(event.target.value)}><option value="">Todas</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}</select></Field></div>
          <div className="min-w-[220px]"><Field label="Profesional"><select value={professionalId} onChange={event => setProfessionalId(event.target.value)}><option value="">Todos</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.full_name}</option>)}</select></Field></div>
          <div className="min-w-[180px]"><Field label="Cargo"><select value={positionId} onChange={event => setPositionId(event.target.value)}><option value="">Todos</option>{positions.map(position => <option key={position.id} value={position.id}>{position.name}</option>)}</select></Field></div>
          <div className="min-w-[180px]"><Field label="Mes reportado"><input value={monthReported} onChange={event => setMonthReported(event.target.value)} placeholder="Ej. Julio 2026" /></Field></div>
          <Button variant="secondary" onClick={() => void downloadPdf()} disabled={busy}><Download size={16} />Exportar PDF</Button>
        </div>
      </Card>

      <section className="metric-strip">
        <StatCard label="Evaluaciones" value={dashboard.totalEvaluations} tone="info" />
        <StatCard label="Cumplimiento promedio" value={formatPercent(dashboard.averageCompliance)} tone="accent" />
      </section>

      <div className="flex flex-wrap gap-3">
        {conceptOrder.map(concept => <Badge key={concept} tone={conceptTones[concept]}>{conceptLabels[concept]}</Badge>)}
      </div>

      <Card className="p-5">
        <p className="eyebrow">Distribución</p>
        <h2 className="mt-1 text-xl font-black">Distribución por concepto</h2>
        <div style={{ width: '100%', height: chartHeight(conceptData.length) }} className="mt-3">
          <ResponsiveContainer>
            <BarChart data={conceptData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} stroke="#e5e9f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: '#344054' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value: unknown) => [`${value} evaluaciones`, '']} labelStyle={{ color: '#172033' }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                {conceptData.map(item => <Cell key={item.concept} fill={item.color} />)}
                <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: '#344054' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <p className="eyebrow">Ámbitos</p>
        <h2 className="mt-1 text-xl font-black">Cumplimiento por ámbito</h2>
        {scopeData.length ? (
          <div style={{ width: '100%', height: chartHeight(scopeData.length) }} className="mt-3">
            <ResponsiveContainer>
              <BarChart data={scopeData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="#e5e9f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11, fill: '#344054' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: unknown) => [`${value}%`, 'Cumplimiento']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                  {scopeData.map(item => <Cell key={item.name} fill={colorForPercent(item.value, thresholds)} />)}
                  <LabelList dataKey="value" position="right" formatter={(value: unknown) => `${value}%`} style={{ fontSize: 11, fill: '#344054' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
      </Card>

      <Card className="p-5">
        <p className="eyebrow">Comparativo</p>
        <h2 className="mt-1 text-xl font-black">Ranking de profesionales</h2>
        {professionalData.length ? (
          <div style={{ width: '100%', height: chartHeight(professionalData.length) }} className="mt-3">
            <ResponsiveContainer>
              <BarChart data={professionalData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="#e5e9f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 11, fill: '#344054' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: unknown) => [value === null || value === undefined ? 'N/A' : `${value}%`, 'Cumplimiento']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                  {professionalData.map(item => <Cell key={item.name} fill={colorForPercent(item.value, thresholds)} />)}
                  <LabelList dataKey="value" position="right" formatter={(value: unknown) => value === null || value === undefined ? 'N/A' : `${value}%`} style={{ fontSize: 11, fill: '#344054' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
      </Card>

      <Card className="p-5">
        <p className="eyebrow">Tendencia</p>
        <h2 className="mt-1 text-xl font-black">Evolución por mes reportado</h2>
        {monthData.length ? (
          <div style={{ width: '100%', height: 260 }} className="mt-3">
            <ResponsiveContainer>
              <LineChart data={monthData} margin={{ left: 8, right: 24, top: 10 }}>
                <CartesianGrid stroke="#e5e9f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#667085' }} axisLine={{ stroke: '#e5e9f0' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#667085' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: unknown) => [value === null || value === undefined ? 'N/A' : `${value}%`, 'Cumplimiento']} />
                <ReferenceLine y={80} stroke="#94a3b8" strokeDasharray="4 4"><Label value="Aceptable (80%)" position="insideTopRight" fill="#94a3b8" fontSize={10} /></ReferenceLine>
                <Line type="monotone" dataKey="value" stroke="#2b3b56" strokeWidth={2} dot={{ r: 4, fill: '#2b3b56' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
      </Card>

      <Card className="p-5">
        <p className="eyebrow">Escala</p>
        <h2 className="mt-1 text-xl font-black">Umbrales de concepto</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {thresholds.map(threshold => (
            <div key={threshold.concept} className="flex items-center gap-3">
              <Badge tone={conceptTones[threshold.concept]}>{conceptLabels[threshold.concept]}</Badge>
              {canManage ? (
                <>
                  <input type="number" min={0} max={100} className="w-24" value={thresholdDraft[threshold.concept] ?? ''} onChange={event => setThresholdDraft({ ...thresholdDraft, [threshold.concept]: event.target.value })} />
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
