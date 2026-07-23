import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Download, Save } from 'lucide-react'
import { BarChart, Button, Card, Field, LineChart, Select, moduleIdentity } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { adherenceService } from '../services/adherenceService'
import type { Area, ConceptKey, Dashboard, Position, Professional, Threshold } from '../types'
import { CONCEPT_COLORS, CONCEPT_LABELS } from '../design/scopeColors'
import { ConceptBadge } from '../design/ConceptBadge'
import { ComplianceRing } from '../design/ComplianceRing'
import { GradientButton } from '../design/GradientButton'
import { ToastStack } from '../design/Toast'

const identity = moduleIdentity('adherence-matrix')
const conceptOrder: ConceptKey[] = ['OPTIMO', 'ACEPTABLE', 'DEFICIENTE', 'MUY_DEFICIENTE']
const NO_DATA_COLOR = '#94A3B8'

function formatPercent(value: number | null) {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`
}

const emptyDashboard: Dashboard = { totalEvaluations: 0, averageCompliance: null, byConcept: { OPTIMO: 0, ACEPTABLE: 0, DEFICIENTE: 0, MUY_DEFICIENTE: 0 }, byScope: [], byProfessional: [], byMonth: [] }

function colorFor(value: number | null, thresholds: Threshold[]) {
  if (value === null) return NO_DATA_COLOR
  const sorted = [...thresholds].sort((left, right) => right.min_percent - left.min_percent)
  const match = sorted.find(threshold => value >= threshold.min_percent)
  return match ? CONCEPT_COLORS[match.concept as ConceptKey] : NO_DATA_COLOR
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

      <Card accent={identity.color} className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px]"><Field label="Área"><Select value={areaId || 'ALL'} onChange={value => setAreaId(value === 'ALL' ? '' : value)} options={[{ value: 'ALL', label: 'Todas' }, ...areas.map(area => ({ value: area.id, label: area.name }))]} /></Field></div>
        <div className="min-w-[220px]"><Field label="Profesional"><Select value={professionalId || 'ALL'} onChange={value => setProfessionalId(value === 'ALL' ? '' : value)} options={[{ value: 'ALL', label: 'Todos' }, ...professionals.map(professional => ({ value: professional.id, label: professional.full_name }))]} /></Field></div>
        <div className="min-w-[180px]"><Field label="Cargo"><Select value={positionId || 'ALL'} onChange={value => setPositionId(value === 'ALL' ? '' : value)} options={[{ value: 'ALL', label: 'Todos' }, ...positions.map(position => ({ value: position.id, label: position.name }))]} /></Field></div>
        <div className="min-w-[180px]"><Field label="Mes reportado"><input className="ds-input" value={monthReported} onChange={event => setMonthReported(event.target.value)} placeholder="Ej. Julio 2026" /></Field></div>
        <div className="ml-auto"><GradientButton variant="ghost" onClick={() => void downloadPdf()} disabled={busy}><Download size={16} />Exportar PDF</GradientButton></div>
      </Card>

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
          <div className="mt-3">
            <BarChart
              orientation="horizontal"
              height={chartHeight(conceptData.length)}
              valueSuffix=" ev."
              data={conceptData.map(item => ({ label: item.label, value: item.value, color: CONCEPT_COLORS[item.concept] }))}
            />
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
            <div className="mt-3">
              <BarChart
                orientation="horizontal"
                height={chartHeight(scopeData.length)}
                valueSuffix="%"
                data={scopeData.map(item => ({ label: item.name, value: item.value, color: colorFor(item.value, thresholds) }))}
              />
            </div>
          ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
        </Card>

        <Card accent={identity.color} className="p-5">
          <p className="ds-eyebrow">Comparativo</p>
          <h2 className="mt-1 text-lg font-black">Ranking de profesionales</h2>
          {professionalData.length ? (
            <div className="mt-3">
              <BarChart
                orientation="horizontal"
                height={chartHeight(professionalData.length)}
                valueFormatter={value => `${value}%`}
                data={professionalData.map(item => ({ label: item.name, value: item.value, color: colorFor(item.value, thresholds) }))}
              />
            </div>
          ) : <div className="almera-empty mt-3"><p>Sin datos suficientes para este filtro.</p></div>}
        </Card>
      </div>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Tendencia</p>
        <h2 className="mt-1 text-lg font-black">Evolución por mes reportado</h2>
        {monthData.length ? (
          <div className="mt-3">
            <LineChart
              height={260}
              color="#4F46E5"
              valueFormatter={value => `${value}%`}
              referenceLine={{ value: 80, label: 'Aceptable (80%)' }}
              data={monthData.map(item => ({ label: item.name, value: item.value }))}
            />
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
