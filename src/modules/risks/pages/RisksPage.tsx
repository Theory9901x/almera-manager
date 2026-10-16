import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity, AlertOctagon, ArrowDownRight, ArrowRight, CalendarClock, ClipboardList, Copy, Download, FileSpreadsheet,
  Flame, Layers, Lock, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, ShieldX, Siren, TrendingDown, Unlock, X,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Button, DonutChart, EmptyState, LineChart, ModuleHero, Select, Tabs, ToastProvider, useToast, useCountUp } from '@/design-system'
import {
  CONTROL_IMPLEMENTATIONS, CONTROL_TYPES, IMPACT_LEVELS, PROBABILITY_LEVELS, RISK_TYPES, TREATMENTS, ZONES, ZONE_ORDER,
  type ZoneKey,
} from '../../../../shared/riskScoring.mjs'
import { risksService } from '../services/risksService'
import type { Materialization, RiskAction, RiskCatalogs, RiskDashboard, RiskRow } from '../types'
import { RiskForm } from '../components/RiskForm'
import { MapDialog } from '../components/RiskDialogs'
import {
  ACTION_STATUS_LABELS, HeatMap, LevelPair, MAT_STATUS_LABELS, Progress, TYPE_COLORS, TypeBadge, ZoneBadge, ZoneBar,
  formatDate, formatMoney, identity,
} from '../components/riskUi'

type TabKey = 'panorama' | 'matriz' | 'materializaciones' | 'plan' | 'configuracion'

export default function RisksPage() {
  return <ToastProvider><RisksContent /></ToastProvider>
}

function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{Math.round(animated).toLocaleString('es-CO')}{suffix}</>
}

function RisksContent() {
  const { session } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const permissions = session?.permissions || []
  const can = (key: string) => permissions.includes(key)

  const tab = (params.get('tab') as TabKey) || 'panorama'
  const [catalogs, setCatalogs] = useState<RiskCatalogs | null>(null)
  const [mapId, setMapId] = useState<string>(params.get('mapa') || '')
  const [dashboard, setDashboard] = useState<RiskDashboard | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // Celda del mapa de calor elegida en el panorama: filtra la matriz por esa posicion exacta.
  const [cell, setCell] = useState<{ stage: 'inherent' | 'residual'; probability: number; impact: number } | null>(null)

  const loadCatalogs = useCallback(async () => {
    const result = await risksService.catalogs()
    setCatalogs(result)
    setMapId(current => current && result.maps.some(map => map.id === current) ? current : (result.maps[0]?.id || ''))
  }, [])

  useEffect(() => { loadCatalogs().catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el módulo')) }, [loadCatalogs])
  useEffect(() => {
    if (!mapId) return
    risksService.dashboard(mapId).then(setDashboard).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el tablero'))
  }, [mapId, refreshKey])

  const currentMap = catalogs?.maps.find(map => map.id === mapId) || null
  const setTab = (key: string) => { const next = new URLSearchParams(params); next.set('tab', key); setParams(next, { replace: true }) }
  const refresh = () => { setRefreshKey(value => value + 1); void loadCatalogs() }

  async function exportPdf() {
    if (!mapId) return
    setExporting(true)
    try { await risksService.exportPdf(mapId) } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el informe') } finally { setExporting(false) }
  }

  const k = dashboard?.kpis
  const tabs = [
    { key: 'panorama', label: 'Panorama' },
    { key: 'matriz', label: 'Matriz de riesgos' },
    { key: 'materializaciones', label: `Materializaciones${k?.materializations.open ? ` · ${k.materializations.open}` : ''}` },
    { key: 'plan', label: 'Plan de tratamiento' },
    { key: 'configuracion', label: 'Configuración y metodología' },
  ]

  return (
    <div className="rsk-page">
      <ModuleHero
        className="rsk-hero"
        badge="Gestión del riesgo · DAFP v6"
        title="Mapa de riesgos"
        subtitle="Riesgos por proceso: identificación, valoración, controles, tratamiento, materialización y seguimiento por líneas de defensa."
        accent={identity.color}
        actions={
          <div className="rsk-hero-actions">
            {catalogs && catalogs.maps.length > 0 && (
              <div className="rsk-map-select">
                <Select value={mapId} onChange={value => { setMapId(value); setCell(null) }} options={catalogs.maps.map(map => ({ value: map.id, label: `${map.name}${map.active ? '' : ' (cerrado)'}` }))} />
              </div>
            )}
            {can('risks.export') && <Button variant="secondary" onClick={exportPdf} disabled={exporting || !mapId}><Download size={15} /> {exporting ? 'Generando…' : 'Informe PDF'}</Button>}
            {can('risks.edit') && currentMap?.active && <Button identity={identity} onClick={() => setShowForm(true)}><Plus size={15} /> Nuevo riesgo</Button>}
          </div>
        }
      >
        {k && (
          <div className="rsk-hero-stats">
            <div><strong><CountUp value={k.total} /></strong><span>riesgos</span></div>
            <div><strong style={{ color: '#fca5a5' }}><CountUp value={k.highResidual} /></strong><span>alto / extremo residual</span></div>
            <div><strong style={{ color: '#86efac' }}><CountUp value={k.avgReduction} suffix="%" /></strong><span>reducción por controles</span></div>
            <div><strong style={{ color: '#fcd34d' }}><CountUp value={k.materializations.open} /></strong><span>materializaciones abiertas</span></div>
          </div>
        )}
      </ModuleHero>

      <div className="rsk-tabs"><Tabs items={tabs} active={tab} onChange={setTab} identity={identity} /></div>

      {!catalogs ? <div className="rsk-loading"><RefreshCw className="animate-spin" size={20} /> Cargando…</div>
        : !currentMap ? <EmptyState icon={Layers} title="No hay mapas de riesgo" description="Crea el primer mapa de riesgos desde Configuración." />
          : (
            <>
              {tab === 'panorama' && dashboard && <Panorama dashboard={dashboard} onCell={(stage, probability, impact) => { setCell({ stage, probability, impact }); setTab('matriz') }} onOpen={id => navigate(`/app/riesgos/${id}`)} onTab={setTab} />}
              {tab === 'matriz' && <Matrix catalogs={catalogs} mapId={mapId} cell={cell} onClearCell={() => setCell(null)} refreshKey={refreshKey} canExport={can('risks.export')} />}
              {tab === 'materializaciones' && <Materializations mapId={mapId} refreshKey={refreshKey} />}
              {tab === 'plan' && <ActionPlan mapId={mapId} refreshKey={refreshKey} />}
              {tab === 'configuracion' && <Settings catalogs={catalogs} currentMapId={mapId} canManage={can('risks.manage')} onChanged={refresh} />}
            </>
          )}

      {showForm && catalogs && currentMap && (
        <RiskForm
          catalogs={catalogs}
          mapId={currentMap.id}
          onClose={() => setShowForm(false)}
          onSave={async payload => {
            const created = await risksService.create(payload)
            toast.push('success', `Riesgo ${created.code} registrado. Ahora agrega sus controles.`)
            setShowForm(false)
            navigate(`/app/riesgos/${created.id}?tab=controles`)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panorama
// ---------------------------------------------------------------------------

function Kpi({ icon: Icon, label, value, suffix, text, detail, tone, children }: {
  icon: typeof Activity; label: string; value: number; suffix?: string; detail?: string; tone?: 'danger' | 'warning' | 'ok' | 'info' | 'violet'; children?: React.ReactNode
  /** Valor ya formateado (ej. dinero compacto): el contador animado solo sabe de enteros. */
  text?: string
}) {
  return (
    <article className={`rsk-kpi ${tone ? `is-${tone}` : ''}`}>
      <div className="rsk-kpi-top">
        <span className="rsk-kpi-icon"><Icon size={18} /></span>
        <span className="rsk-kpi-label">{label}</span>
      </div>
      <strong className="rsk-kpi-value">{text ?? <CountUp value={value} suffix={suffix} />}</strong>
      {detail && <span className="rsk-kpi-detail">{detail}</span>}
      {children}
    </article>
  )
}

function Panorama({ dashboard, onCell, onOpen, onTab }: {
  dashboard: RiskDashboard
  onCell(stage: 'inherent' | 'residual', probability: number, impact: number): void
  onOpen(id: string): void
  onTab(tab: string): void
}) {
  const k = dashboard.kpis
  if (!k.total) {
    return <EmptyState icon={ShieldAlert} title="Este mapa aún no tiene riesgos" description="Registra el primer riesgo con «Nuevo riesgo»: la guía DAFP te acompaña en la redacción y la valoración." />
  }
  const typeData = k.byType.filter(item => item.value > 0).map(item => ({ label: RISK_TYPES[item.type].name, value: item.value, color: TYPE_COLORS[item.type] }))
  const timeline = dashboard.materializationTimeline.map(item => {
    const [year, month] = item.month.split('-').map(Number)
    return { label: new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1))), value: item.total }
  })
  const alerts = [
    { show: k.controlsIneffective > 0, tone: 'danger', icon: ShieldX, text: `${k.controlsIneffective} control(es) no efectivo(s) en la última prueba: no están reduciendo el riesgo.` },
    { show: k.actions.overdue > 0, tone: 'danger', icon: CalendarClock, text: `${k.actions.overdue} acción(es) del plan vencida(s).`, tab: 'plan' },
    { show: k.materializations.open > 0, tone: 'warning', icon: Siren, text: `${k.materializations.open} materialización(es) sin cerrar: falta análisis, revaluación o correctivas.`, tab: 'materializaciones' },
    { show: k.withoutControls > 0, tone: 'warning', icon: ShieldAlert, text: `${k.withoutControls} riesgo(s) sin ningún control registrado.` },
    { show: k.withoutPlan > 0, tone: 'warning', icon: ClipboardList, text: `${k.withoutPlan} riesgo(s) con tratamiento que exige plan y no tienen acciones.` },
    { show: k.withoutTreatment > 0, tone: 'info', icon: ClipboardList, text: `${k.withoutTreatment} riesgo(s) sin opción de tratamiento definida.` },
    { show: k.total - k.reviewedThisPeriod > 0, tone: 'info', icon: CalendarClock, text: `${k.total - k.reviewedThisPeriod} riesgo(s) sin seguimiento en el ${k.currentPeriod}.` },
  ].filter(item => item.show)

  return (
    <div className="rsk-panorama">
      <section className="rsk-kpis">
        <Kpi icon={Layers} label="Riesgos identificados" value={k.total} detail={`${k.valued} valorados · ${k.byType.filter(t => t.value).map(t => `${t.value} ${RISK_TYPES[t.type].short.toLowerCase()}`).join(' · ')}`} />
        <Kpi icon={Flame} label="Exposición inherente" value={k.highInherent} tone="danger" detail="en zona alta o extrema, sin controles">
          <ZoneBar data={dashboard.zones.inherent} />
        </Kpi>
        <Kpi icon={ShieldAlert} label="Exposición residual" value={k.highResidual} tone="warning" detail={`${k.extremeResidual} en zona extrema tras controles`}>
          <ZoneBar data={dashboard.zones.residual} />
        </Kpi>
        <Kpi icon={TrendingDown} label="Reducción por controles" value={k.avgReduction} suffix="%" tone="ok" detail={`${k.controls} controles · ${k.controlsByStrength.FUERTE} fuertes · ${k.movement.lowered} riesgos bajaron de zona`} />
        <Kpi icon={Siren} label="Materializaciones" value={k.materializations.total} tone="violet" detail={`${k.materializations.open} abiertas · ${k.materializations.risks} riesgos · ${formatMoney(k.materializations.loss)}`} />
        <Kpi icon={ClipboardList} label="Avance del plan" value={k.actions.progress} suffix="%" tone="info" detail={`${k.actions.done}/${k.actions.total} acciones terminadas · ${k.actions.overdue} vencidas`}>
          <Progress value={k.actions.progress} tone={k.actions.overdue ? 'danger' : undefined} />
        </Kpi>
      </section>

      <section className="rsk-card rsk-maps-card">
        <header className="rsk-card-head">
          <div><h2>Mapa de calor</h2><p>Clic en una celda para ver sus riesgos en la matriz.</p></div>
          <div className="rsk-legend">{ZONE_ORDER.map(key => <span key={key}><i style={{ background: ZONES[key].color }} />{ZONES[key].name}</span>)}</div>
        </header>
        <div className="rsk-maps">
          <HeatMap title="Riesgo inherente" grid={dashboard.heat.inherent} onCellClick={(p, i) => onCell('inherent', p, i)} />
          <div className="rsk-maps-arrow">
            <span className="rsk-maps-arrow-icon"><ArrowRight size={20} /></span>
            <strong>−{k.avgReduction}%</strong>
            <span>severidad promedio por los controles</span>
            {k.controlsIneffective > 0 && <em><ShieldX size={13} /> {k.controlsIneffective} no efectivo(s) excluido(s)</em>}
          </div>
          <HeatMap title="Riesgo residual" grid={dashboard.heat.residual} onCellClick={(p, i) => onCell('residual', p, i)} />
        </div>
      </section>

      <div className="rsk-grid-2">
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Alertas de gestión</h2><p>Lo que requiere atención ahora.</p></div></header>
          {alerts.length ? (
            <ul className="rsk-alerts">
              {alerts.map(alert => (
                <li key={alert.text} className={`is-${alert.tone}`}>
                  <alert.icon size={17} />
                  <span>{alert.text}</span>
                  {alert.tab && <button type="button" onClick={() => onTab(alert.tab!)}>Ver <ArrowRight size={13} /></button>}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={ShieldCheck} title="Sin alertas" description="Controles probados, planes al día y seguimiento completo." />}
        </section>
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Riesgos críticos</h2><p>Mayor severidad residual.</p></div></header>
          <ul className="rsk-top">
            {dashboard.topRisks.map(risk => (
              <li key={risk.id}>
                <button type="button" onClick={() => onOpen(risk.id)}>
                  <span className="rsk-top-zone" style={{ ['--zone' as string]: ZONES[risk.assessment.residual!.zone].color }} />
                  <span className="rsk-top-body">
                    <span className="rsk-top-meta"><b>{risk.code}</b> · {risk.process_name} <TypeBadge type={risk.risk_type} />{risk.materializations.total > 0 && <span className="rsk-tag is-violet"><Siren size={11} /> {risk.materializations.total}</span>}</span>
                    <span className="rsk-top-text">{risk.description}</span>
                  </span>
                  <ZoneBadge zone={risk.assessment.residual?.zone} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="rsk-grid-3">
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Riesgos por proceso</h2><p>Distribución por zona residual.</p></div></header>
          <ul className="rsk-procs">
            {dashboard.byProcess.slice(0, 10).map(item => {
              const max = Math.max(...dashboard.byProcess.map(row => row.total), 1)
              return (
                <li key={item.processId}>
                  <span className="rsk-procs-name" title={item.name}>{item.name.length > 42 ? `${item.name.slice(0, 42)}…` : item.name}{item.materialized > 0 && <span><Siren size={11} /> {item.materialized}</span>}</span>
                  <span className="rsk-procs-bar" style={{ width: `${Math.max(12, (item.total / max) * 100)}%` }}>
                    {ZONE_ORDER.map(zone => item.zones[zone] ? <i key={zone} style={{ flexGrow: item.zones[zone], ['--zone' as string]: ZONES[zone].color }} title={`${ZONES[zone].name}: ${item.zones[zone]}`} /> : null)}
                  </span>
                  <b>{item.total}</b>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Por tipo de riesgo</h2><p>Gestión, corrupción, seguridad digital y fiscal.</p></div></header>
          <DonutChart data={typeData} centerLabel="riesgos" />
          <div className="rsk-donut-legend">{typeData.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}<b>{item.value}</b></span>)}</div>
        </section>
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Materializaciones</h2><p>Eventos por mes (12 meses).</p></div></header>
          <LineChart data={timeline} color="#7c3aed" height={190} />
          <div className="rsk-mat-status">
            {dashboard.materializationStatus.map(item => <span key={item.status} className={`is-${item.status.toLowerCase()}`}><b>{item.total}</b>{MAT_STATUS_LABELS[item.status]}</span>)}
          </div>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Matriz
// ---------------------------------------------------------------------------

function Matrix({ catalogs, mapId, cell, onClearCell, refreshKey, canExport }: {
  catalogs: RiskCatalogs; mapId: string; cell: { stage: 'inherent' | 'residual'; probability: number; impact: number } | null
  onClearCell(): void; refreshKey: number; canExport: boolean
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<RiskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ processId: 'ALL', riskType: 'ALL', zone: 'ALL', treatment: 'ALL', status: 'ACTIVO' })
  const [q, setQ] = useState('')

  useEffect(() => {
    setLoading(true)
    risksService.list({ mapId, ...filters })
      .then(result => setRows(result.rows))
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar la matriz'))
      .finally(() => setLoading(false))
  }, [mapId, filters, refreshKey])

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(risk =>
      (!cell || (risk.assessment[cell.stage]?.probability === cell.probability && risk.assessment[cell.stage]?.impact === cell.impact))
      && (!term || `${risk.code} ${risk.description} ${risk.process_name} ${risk.owner_label}`.toLowerCase().includes(term)))
  }, [rows, q, cell])

  const set = (key: keyof typeof filters, value: string) => setFilters(current => ({ ...current, [key]: value }))

  return (
    <section className="rsk-card rsk-matrix">
      <div className="rsk-filters">
        <label className="rsk-search"><Search size={15} /><input value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar código, riesgo, proceso o responsable…" /></label>
        <Select value={filters.processId} onChange={value => set('processId', value)} options={[{ value: 'ALL', label: 'Todos los procesos' }, ...catalogs.processes.map(item => ({ value: item.id, label: item.name }))]} />
        <Select value={filters.riskType} onChange={value => set('riskType', value)} options={[{ value: 'ALL', label: 'Todos los tipos' }, ...Object.values(RISK_TYPES).map(item => ({ value: item.key, label: item.name }))]} />
        <Select value={filters.zone} onChange={value => set('zone', value)} options={[{ value: 'ALL', label: 'Toda zona residual' }, ...ZONE_ORDER.map(key => ({ value: key, label: `Residual ${ZONES[key].name.toLowerCase()}` }))]} />
        <Select value={filters.treatment} onChange={value => set('treatment', value)} options={[{ value: 'ALL', label: 'Todo tratamiento' }, { value: 'SIN', label: 'Sin tratamiento' }, ...Object.values(TREATMENTS).map(item => ({ value: item.key, label: item.name }))]} />
        <Select value={filters.status} onChange={value => set('status', value)} options={[{ value: 'ACTIVO', label: 'Activos' }, { value: 'RETIRADO', label: 'Retirados' }, { value: 'ALL', label: 'Todos' }]} />
        {canExport && <Button variant="secondary" onClick={() => risksService.exportCsv(mapId).catch(cause => toast.push('error', cause.message))}><FileSpreadsheet size={15} /> CSV</Button>}
      </div>
      {cell && (
        <div className="rsk-cell-filter">
          Celda del mapa {cell.stage === 'inherent' ? 'inherente' : 'residual'}: <strong>{PROBABILITY_LEVELS[cell.probability - 1].name} × {IMPACT_LEVELS[cell.impact - 1].name}</strong>
          <button type="button" onClick={onClearCell}><X size={13} /> Quitar</button>
        </div>
      )}
      <p className="rsk-count">{loading ? 'Cargando…' : `${visible.length} riesgo(s)`}</p>
      <div className="rsk-table-wrap">
        <table className="rsk-table">
          <thead>
            <tr>
              <th>Código</th><th className="is-wide">Riesgo</th><th>Inherente</th><th aria-label="Desplazamiento" />
              <th>Residual</th><th>Controles</th><th>Tratamiento</th><th>Plan</th><th>Eventos</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(risk => {
              const a = risk.assessment
              const lowered = a.inherent && a.residual && ZONES[a.residual.zone].rank < ZONES[a.inherent.zone].rank
              return (
                <tr key={risk.id} onClick={() => navigate(`/app/riesgos/${risk.id}`)}>
                  <td><strong className="rsk-code">{risk.code}</strong><TypeBadge type={risk.risk_type} /></td>
                  <td className="is-wide">
                    <span className="rsk-desc">{risk.description}</span>
                    <span className="rsk-sub">{risk.class_name && <i style={{ background: risk.class_color || '#94a3b8' }} />}{[risk.process_name, risk.class_name, risk.owner_label].filter(Boolean).join(' · ')}</span>
                  </td>
                  <td><ZoneBadge zone={a.inherent?.zone} size="sm" /><LevelPair probability={a.inherent?.probability} impact={a.inherent?.impact} /></td>
                  <td className="rsk-shift">{a.inherent && (lowered ? <ArrowDownRight size={16} className="is-down" /> : <ArrowRight size={16} />)}</td>
                  <td><ZoneBadge zone={a.residual?.zone} size="sm" /><LevelPair probability={a.residual?.probability} impact={a.residual?.impact} /></td>
                  <td>
                    <span className="rsk-num">{risk.controls_count}</span>
                    {risk.controls_ineffective > 0 && <span className="rsk-tag is-danger"><ShieldX size={11} /> {risk.controls_ineffective}</span>}
                    {a.reduction ? <span className="rsk-sub">−{Math.round(a.reduction)}%</span> : null}
                  </td>
                  <td>{risk.treatment ? <span className="rsk-treat">{TREATMENTS[risk.treatment].name}</span> : <span className="rsk-tag is-warn">Sin definir</span>}</td>
                  <td>
                    {risk.actions.total ? (
                      <>
                        <Progress value={risk.actions.progress} tone={risk.actions.overdue ? 'danger' : undefined} />
                        <span className="rsk-sub">{risk.actions.progress}% · {risk.actions.total} acc.{risk.actions.overdue ? ` · ${risk.actions.overdue} venc.` : ''}</span>
                      </>
                    ) : <span className="rsk-muted">—</span>}
                  </td>
                  <td>{risk.materializations.total ? <span className={`rsk-tag ${risk.materializations.open ? 'is-violet' : ''}`}><Siren size={11} /> {risk.materializations.total}</span> : <span className="rsk-muted">—</span>}</td>
                </tr>
              )
            })}
            {!loading && !visible.length && <tr><td colSpan={9}><EmptyState icon={Search} title="Sin resultados" description="No hay riesgos con estos filtros." /></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Materializaciones
// ---------------------------------------------------------------------------

function Materializations({ mapId, refreshKey }: { mapId: string; refreshKey: number }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Materialization[] | null>(null)
  useEffect(() => {
    risksService.materializations({ mapId }).then(result => setRows(result.rows)).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar'))
  }, [mapId, refreshKey])
  if (!rows) return <div className="rsk-loading"><RefreshCw className="animate-spin" size={20} /> Cargando…</div>
  const loss = rows.reduce((sum, row) => sum + Number(row.economic_loss || 0), 0)
  const people = rows.reduce((sum, row) => sum + Number(row.affected_people || 0), 0)
  const open = rows.filter(row => row.status !== 'CERRADA')
  const pendingRevaluation = open.filter(row => !row.revalued_at).length
  return (
    <div className="rsk-mats">
      <section className="rsk-kpis is-4">
        <Kpi icon={Siren} label="Eventos materializados" value={rows.length} tone="violet" detail={`${open.length} abiertos`} />
        <Kpi icon={AlertOctagon} label="Pendientes de revaluar" value={pendingRevaluation} tone="warning" detail="el mapa aún no refleja el evento" />
        <Kpi icon={Activity} label="Personas afectadas" value={people} tone="danger" detail="suma de todos los eventos" />
        <Kpi icon={TrendingDown} label="Pérdida económica" value={loss} text={new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(loss)} tone="info" detail={formatMoney(loss)} />
      </section>
      {!rows.length ? (
        <section className="rsk-card"><EmptyState icon={ShieldCheck} title="Ningún riesgo materializado" description="Cuando un riesgo ocurra, repórtalo desde su ficha con «Reportar materialización»." /></section>
      ) : (
        <div className="rsk-board">
          {(['REPORTADA', 'EN_ANALISIS', 'EN_TRATAMIENTO', 'CERRADA'] as const).map(status => {
            const items = rows.filter(row => row.status === status)
            return (
              <section key={status} className={`rsk-lane is-${status.toLowerCase()}`}>
                <header><i />{MAT_STATUS_LABELS[status]}<b>{items.length}</b></header>
                {items.map(row => (
                  <button key={row.id} type="button" className="rsk-mat-card" onClick={() => navigate(`/app/riesgos/${row.risk_id}?tab=materializacion`)}>
                    <span className="rsk-mat-card-top"><b>{row.code}</b><span>{formatDate(row.occurred_at)}</span></span>
                    <span className="rsk-mat-card-text">{row.description}</span>
                    <span className="rsk-mat-card-meta">{row.risk_code} · {row.process_name}</span>
                    <span className="rsk-mat-card-flags">
                      {row.risk_type && <TypeBadge type={row.risk_type} />}
                      {row.revalued_at ? <span className="rsk-tag is-ok">Revaluado</span> : <span className="rsk-tag is-warn">Sin revaluar</span>}
                      {row.actions_total ? <span className="rsk-tag">{row.actions_done}/{row.actions_total} correctivas</span> : null}
                    </span>
                  </button>
                ))}
                {!items.length && <p className="rsk-lane-empty">Sin eventos</p>}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plan de tratamiento (todas las acciones del mapa)
// ---------------------------------------------------------------------------

function ActionPlan({ mapId, refreshKey }: { mapId: string; refreshKey: number }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [status, setStatus] = useState('ALL')
  const [kind, setKind] = useState('ALL')
  const [rows, setRows] = useState<RiskAction[] | null>(null)
  useEffect(() => {
    risksService.actions({ mapId, status, kind }).then(result => setRows(result.rows)).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar'))
  }, [mapId, status, kind, refreshKey])
  return (
    <section className="rsk-card">
      <div className="rsk-filters">
        <div className="rsk-segment">
          {[['ALL', 'Todas'], ['EN_CURSO', 'En curso'], ['PENDIENTE', 'Pendientes'], ['VENCIDA', 'Vencidas'], ['TERMINADA', 'Terminadas']].map(([key, label]) => (
            <button type="button" key={key} className={status === key ? 'is-on' : ''} onClick={() => setStatus(key)}>{label}</button>
          ))}
        </div>
        <Select value={kind} onChange={setKind} options={[{ value: 'ALL', label: 'Tratamiento y correctivas' }, { value: 'TRATAMIENTO', label: 'Solo tratamiento' }, { value: 'CORRECTIVA', label: 'Solo correctivas' }]} />
      </div>
      <div className="rsk-table-wrap">
        <table className="rsk-table">
          <thead><tr><th>Acción</th><th>Riesgo</th><th className="is-wide">Descripción</th><th>Responsable</th><th>Fecha límite</th><th>Estado</th><th>Avance</th></tr></thead>
          <tbody>
            {(rows || []).map(action => (
              <tr key={action.id} onClick={() => navigate(`/app/riesgos/${action.risk_id}?tab=tratamiento`)}>
                <td><strong className="rsk-code">{action.code}</strong><span className={`rsk-tag ${action.kind === 'CORRECTIVA' ? 'is-violet' : ''}`}>{action.kind === 'CORRECTIVA' ? `Correctiva${action.materialization_code ? ` · ${action.materialization_code}` : ''}` : 'Tratamiento'}</span></td>
                <td><strong className="rsk-code">{action.risk_code}</strong><span className="rsk-sub">{action.process_name}</span></td>
                <td className="is-wide"><span className="rsk-desc">{action.description}</span></td>
                <td>{action.responsible_label || <span className="rsk-muted">Sin asignar</span>}</td>
                <td className={action.overdue ? 'rsk-overdue' : ''}>{formatDate(action.due_date)}{action.overdue && <span className="rsk-sub">Vencida</span>}</td>
                <td><span className={`rsk-status is-${action.status.toLowerCase()}`}>{ACTION_STATUS_LABELS[action.status]}</span></td>
                <td><Progress value={action.progress} tone={action.overdue ? 'danger' : action.status === 'TERMINADA' ? 'ok' : undefined} /><span className="rsk-sub">{action.progress}%</span></td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={7}><EmptyState icon={ClipboardList} title="Sin acciones" description="Las acciones se crean desde la ficha de cada riesgo, en la pestaña Tratamiento." /></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Configuracion y metodologia
// ---------------------------------------------------------------------------

function Settings({ catalogs, currentMapId, canManage, onChanged }: { catalogs: RiskCatalogs; currentMapId: string; canManage: boolean; onChanged(): void }) {
  const toast = useToast()
  const [dialog, setDialog] = useState<{ mode: 'create' | 'duplicate'; sourceId?: string; sourceName?: string } | null>(null)
  const [className, setClassName] = useState('')
  const [classColor, setClassColor] = useState('#0ea5e9')

  async function act(promise: Promise<unknown>, message: string) {
    try { await promise; toast.push('success', message); onChanged() } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible guardar') }
  }

  return (
    <div className="rsk-settings">
      <div className="rsk-grid-2">
        <section className="rsk-card">
          <header className="rsk-card-head">
            <div><h2>Mapas de riesgo</h2><p>Una vigencia por mapa. Un mapa cerrado queda de consulta.</p></div>
            {canManage && <Button identity={identity} onClick={() => setDialog({ mode: 'create' })}><Plus size={15} /> Nuevo mapa</Button>}
          </header>
          <ul className="rsk-list">
            {catalogs.maps.map(map => (
              <li key={map.id} className={map.id === currentMapId ? 'is-current' : ''}>
                <div><strong>{map.name}</strong><span>Vigencia {map.year} · {map.risks_count} riesgos · {map.active ? 'Abierto' : 'Cerrado'}</span></div>
                {canManage && (
                  <div className="rsk-list-actions">
                    <button type="button" className="rsk-icon-btn" title="Duplicar a otra vigencia" onClick={() => setDialog({ mode: 'duplicate', sourceId: map.id, sourceName: map.name })}><Copy size={15} /></button>
                    <button type="button" className="rsk-icon-btn" title={map.active ? 'Cerrar mapa' : 'Reabrir mapa'} onClick={() => act(risksService.updateMap(map.id, { active: !map.active }), map.active ? 'Mapa cerrado' : 'Mapa reabierto')}>{map.active ? <Lock size={15} /> : <Unlock size={15} />}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="rsk-card">
          <header className="rsk-card-head"><div><h2>Clases de riesgo</h2><p>El «factor» que agrupa los riesgos. Propias de la entidad.</p></div></header>
          <ul className="rsk-list">
            {catalogs.classes.map(item => (
              <li key={item.id} className={item.active ? '' : 'is-off'}>
                <div className="rsk-class"><i style={{ background: item.color }} /><strong>{item.name}</strong>{!item.active && <span className="rsk-tag">Inactiva</span>}</div>
                {canManage && <button type="button" className="rsk-link" onClick={() => act(risksService.updateClass(item.id, { active: !item.active }), item.active ? 'Clase desactivada' : 'Clase activada')}>{item.active ? 'Desactivar' : 'Activar'}</button>}
              </li>
            ))}
          </ul>
          {canManage && (
            <div className="rsk-inline-form">
              <input type="color" value={classColor} onChange={event => setClassColor(event.target.value)} aria-label="Color" />
              <input className="ds-input" value={className} onChange={event => setClassName(event.target.value)} placeholder="Nueva clase (ej. Ambiental)" />
              <Button variant="secondary" disabled={!className.trim()} onClick={() => act(risksService.createClass({ name: className, color: classColor }).then(() => setClassName('')), 'Clase creada')}><Plus size={14} /> Agregar</Button>
            </div>
          )}
        </section>
      </div>

      <section className="rsk-card">
        <header className="rsk-card-head"><div><h2>Metodología</h2><p>Guía para la administración del riesgo y el diseño de controles en entidades públicas — DAFP, versión 6 (MIPG, Decreto 1499 de 2017).</p></div></header>
        <div className="rsk-method">
          <div>
            <h3>Probabilidad (por exposición)</h3>
            <table className="rsk-ref"><tbody>{PROBABILITY_LEVELS.map(item => <tr key={item.level}><th>{item.name}<small>{item.percent}%</small></th><td>{item.description}</td></tr>)}</tbody></table>
          </div>
          <div>
            <h3>Impacto</h3>
            <table className="rsk-ref"><tbody>{IMPACT_LEVELS.map(item => <tr key={item.level}><th>{item.name}<small>{item.percent}%</small></th><td><b>Económico:</b> {item.economic}<br /><b>Reputacional:</b> {item.reputational}<br /><b>Salud:</b> {item.health}</td></tr>)}</tbody></table>
          </div>
          <div>
            <h3>Mapa de calor</h3>
            <HeatMap compact />
            <h3>Atributos de eficiencia del control</h3>
            <table className="rsk-ref"><tbody>
              {Object.values(CONTROL_TYPES).map(item => <tr key={item.key}><th>{item.name}<small>{item.weight}%</small></th><td>{item.description} Reduce {item.affects === 'IMPACTO' ? 'impacto' : 'probabilidad'}.</td></tr>)}
              {Object.values(CONTROL_IMPLEMENTATIONS).map(item => <tr key={item.key}><th>{item.name}<small>{item.weight}%</small></th><td>{item.description}</td></tr>)}
            </tbody></table>
            <p className="rsk-help">Cada control se aplica sobre el valor ya reducido por el anterior: 60 % − 40 % = 36 %; 36 % − 30 % = 25,2 %. Un control con última prueba «no efectivo» no reduce.</p>
          </div>
          <div>
            <h3>Opciones de tratamiento</h3>
            <table className="rsk-ref"><tbody>{Object.values(TREATMENTS).map(item => <tr key={item.key}><th>{item.name}</th><td>{item.description}</td></tr>)}</tbody></table>
            <h3>Reglas que el sistema hace cumplir</h3>
            <ul className="rsk-rules">
              <li>Un riesgo de corrupción nunca se acepta y su impacto lo fija el cuestionario (mínimo Moderado).</li>
              <li>Una materialización no se cierra sin causa raíz, revaluación del riesgo y acciones correctivas terminadas.</li>
              <li>Un hecho de corrupción materializado exige reportarlo a una autoridad externa.</li>
              <li>Una acción no se termina sin evidencia de cumplimiento.</li>
              <li>La primera línea se autoevalúa; segunda y tercera requieren permiso de seguimiento.</li>
            </ul>
          </div>
        </div>
      </section>

      {dialog && (
        <MapDialog
          mode={dialog.mode}
          sourceName={dialog.sourceName}
          onClose={() => setDialog(null)}
          onSave={async payload => {
            if (dialog.mode === 'duplicate' && dialog.sourceId) {
              const result = await risksService.duplicateMap(dialog.sourceId, payload)
              toast.push('success', `Mapa duplicado con ${result.copied} riesgo(s)`)
            } else {
              await risksService.createMap(payload)
              toast.push('success', 'Mapa creado')
            }
            setDialog(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}
