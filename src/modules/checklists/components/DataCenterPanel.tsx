import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Download, Eye, FileSpreadsheet, Loader2, PenLine, SlidersHorizontal,
  TrendingDown, TrendingUp, X,
} from 'lucide-react'
import {
  BarChart, Button, Card, DatePicker, DonutChart, EmptyState, Field, LineChart, Select, Table,
  moduleIdentity, semaphoreColor, useCountUp, useToast,
} from '@/design-system'
import { checklistsService } from '../services/checklistsService'
import type { DataCenter, DataCenterFilters, DataCenterOptions } from '../types'

const identity = moduleIdentity('checklists')

const PERIODS = [
  { value: 'dia', label: 'Diaria' },
  { value: 'semana', label: 'Semanal' },
  { value: 'mes', label: 'Mensual' },
  { value: 'trimestre', label: 'Trimestral' },
]

const LEVELS = [
  { value: '', label: 'Cualquier nivel' },
  { value: '70', label: 'Solo por debajo de 70 %' },
  { value: '80', label: 'Solo por debajo de 80 %' },
  { value: '90', label: 'Solo por debajo de 90 %' },
]

const fmt = (percent: number | null) => percent === null ? 'Sin dato' : `${percent.toFixed(1)} %`

/** ECharts no recorta las etiquetas: sin esto los nombres largos de dominio se encabalgan unos
 *  sobre otros y la grafica deja de leerse. */
const short = (text: string, max = 34) => text.length > max ? `${text.slice(0, max - 1)}…` : text

/** KPI con conteo animado. El color sale del semáforo, no de una paleta decorativa. */
function Kpi({ label, value, suffix = '', percent, hint, delta }: {
  label: string; value: number; suffix?: string; percent?: number | null; hint?: string
  /** Diferencia contra el período anterior. Solo se muestra si de verdad se pudo calcular. */
  delta?: number | null
}) {
  const animated = useCountUp(value)
  const color = percent === undefined ? undefined : semaphoreColor(percent)
  return (
    <div className="dc-kpi">
      <span className="dc-kpi-value" style={{ color }}>
        {suffix === ' %' ? animated.toFixed(1) : Math.round(animated)}{suffix}
      </span>
      <span className="dc-kpi-label">{label}</span>
      {delta !== undefined && delta !== null && (
        <span className={`dc-kpi-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
          {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)} pts vs. período anterior
        </span>
      )}
      {hint && <span className="dc-kpi-hint">{hint}</span>}
    </div>
  )
}

/**
 * Centro de datos: KPIs y seis vistas de adherencia sobre el MISMO recorte.
 *
 * Los filtros no se aplican en el cliente: se mandan al servidor y este recalcula todo junto.
 * Filtrar aqui obligaria a traerse el historico entero al navegador y, peor, cada vista
 * acabaria filtrando a su manera — que es como un grafico termina contradiciendo al KPI de
 * arriba sin que nadie lo note.
 */
export function DataCenterPanel() {
  const navigate = useNavigate()
  const toast = useToast()
  const [options, setOptions] = useState<DataCenterOptions | null>(null)
  const [filters, setFilters] = useState<DataCenterFilters>({ period: 'mes' })
  const [data, setData] = useState<DataCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const charts = useRef<HTMLDivElement>(null)

  useEffect(() => { checklistsService.dataCenterOptions().then(setOptions).catch(() => setOptions(null)) }, [])

  useEffect(() => {
    setLoading(true)
    checklistsService.dataCenter(filters)
      .then(setData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el tablero'))
      .finally(() => setLoading(false))
  }, [filters])

  const set = (patch: Partial<DataCenterFilters>) => setFilters(current => ({ ...current, ...patch }))

  // Chips de lo que esta activo. Se derivan del estado, no se mantienen aparte: dos listas de lo
  // mismo se desincronizan en cuanto alguien añade un filtro y olvida el chip.
  const chips = useMemo(() => {
    if (!options) return []
    const out: { key: keyof DataCenterFilters; label: string }[] = []
    const name = (list: { id: string; name: string }[], id?: string) => list.find(x => x.id === id)?.name
    if (filters.templateId) out.push({ key: 'templateId', label: `Lista: ${name(options.templates, filters.templateId) || filters.templateId}` })
    if (filters.areaId) out.push({ key: 'areaId', label: `Servicio: ${name(options.areas, filters.areaId) || filters.areaId}` })
    if (filters.auditorId) out.push({ key: 'auditorId', label: `Auditor: ${name(options.auditors, filters.auditorId) || filters.auditorId}` })
    if (filters.domainId) out.push({ key: 'domainId', label: `Dominio: ${name(options.domains, filters.domainId) || filters.domainId}` })
    if (filters.shift) out.push({ key: 'shift', label: `Turno: ${filters.shift}` })
    if (filters.dateFrom) out.push({ key: 'dateFrom', label: `Desde: ${filters.dateFrom}` })
    if (filters.dateTo) out.push({ key: 'dateTo', label: `Hasta: ${filters.dateTo}` })
    if (filters.maxPercent) out.push({ key: 'maxPercent', label: `Bajo ${filters.maxPercent} %` })
    return out
  }, [filters, options])

  /**
   * Los graficos se exportan tal como estan en pantalla: se serializa el SVG que ECharts ya
   * pinto. Volver a dibujarlos en el servidor daria un PDF que no es lo que el usuario vio, que
   * es justo lo que se pidio evitar.
   */
  function chartImages() {
    const out: { title: string; svg: string }[] = []
    charts.current?.querySelectorAll<HTMLElement>('[data-chart]').forEach(node => {
      const svg = node.querySelector('svg')
      if (!svg) return
      const clone = svg.cloneNode(true) as SVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      out.push({ title: node.dataset.chart || '', svg: new XMLSerializer().serializeToString(clone) })
    })
    return out
  }

  async function exportPdf() {
    setExporting(true)
    try {
      await checklistsService.dataCenterPdf(filters, chartImages(), chips.map(c => c.label))
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el informe') }
    finally { setExporting(false) }
  }

  if (!options) return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>

  const hasData = Boolean(data && data.kpis.audits > 0)

  return (
    <div className="dc-root">
      <Card accent={identity.color} className="p-5">
        <div className="dc-filters-head">
          <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
            <span><SlidersHorizontal size={19} /></span>
            <div><h2>Filtros</h2><p>Se combinan entre sí y recalculan todo el tablero</p></div>
          </div>
          <div className="dc-filters-actions">
            <Button variant="secondary" onClick={() => setFilters({ period: filters.period })} disabled={!chips.length}>
              <X size={15} /> Limpiar
            </Button>
            <Button variant="secondary" onClick={() => checklistsService.dataCenterCsv(filters)} disabled={!hasData}>
              <FileSpreadsheet size={15} /> Excel / CSV
            </Button>
            <Button identity={identity} onClick={() => void exportPdf()} disabled={!hasData || exporting}>
              <Download size={15} /> {exporting ? 'Generando…' : 'Informe PDF'}
            </Button>
          </div>
        </div>

        <div className="dc-filters">
          <Field label="Lista">
            <Select
              value={filters.templateId || 'ALL'}
              onChange={value => set({ templateId: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: 'Todas' }, ...options.templates.map(t => ({ value: t.id, label: t.name }))]}
            />
          </Field>
          <Field label="Servicio">
            <Select
              value={filters.areaId || 'ALL'}
              onChange={value => set({ areaId: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: 'Todos' }, ...options.areas.map(a => ({ value: a.id, label: a.name }))]}
            />
          </Field>
          <Field label="Auditor">
            <Select
              value={filters.auditorId || 'ALL'}
              onChange={value => set({ auditorId: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: 'Todos' }, ...options.auditors.map(a => ({ value: a.id, label: a.name }))]}
            />
          </Field>
          <Field label="Dominio">
            <Select
              value={filters.domainId || 'ALL'}
              onChange={value => set({ domainId: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: 'Todos' }, ...options.domains.map(d => ({ value: d.id, label: d.name }))]}
            />
          </Field>
          <Field label="Turno">
            <Select
              value={filters.shift || 'ALL'}
              onChange={value => set({ shift: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: 'Todos' }, ...options.shifts.map(s => ({ value: s, label: s }))]}
            />
          </Field>
          <Field label="Nivel de adherencia">
            <Select
              value={filters.maxPercent || ''}
              onChange={value => set({ maxPercent: value || undefined })}
              options={LEVELS}
            />
          </Field>
          <Field label="Desde"><DatePicker value={filters.dateFrom || ''} onChange={value => set({ dateFrom: value || undefined })} /></Field>
          <Field label="Hasta"><DatePicker value={filters.dateTo || ''} onChange={value => set({ dateTo: value || undefined })} /></Field>
        </div>

        {chips.length > 0 && (
          <div className="dc-chips">
            {chips.map(chip => (
              <button key={chip.key} className="dc-chip" onClick={() => set({ [chip.key]: undefined })}>
                {chip.label} <X size={13} />
              </button>
            ))}
          </div>
        )}
      </Card>

      {loading && <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>}

      {!loading && !hasData && (
        <Card accent={identity.color} className="p-5">
          <EmptyState
            icon={BarChart3}
            title="Ninguna auditoría cumple estos filtros"
            description="El tablero solo cuenta auditorías cerradas. Prueba a quitar algún filtro, ampliar el rango de fechas o revisar si hay rondas sin cerrar."
            action={chips.length ? <Button variant="secondary" onClick={() => setFilters({ period: filters.period })}><X size={15} /> Limpiar filtros</Button> : undefined}
          />
        </Card>
      )}

      {!loading && hasData && data && (
        <>
          <div className="dc-kpis">
            <Kpi
              label="Adherencia del filtro" value={data.overall.percent ?? 0} suffix=" %"
              percent={data.overall.percent}
              hint={`${data.overall.c} C · ${data.overall.nc} NC · ${data.overall.na} NA`}
              delta={data.previous && data.previous.percent !== null && data.overall.percent !== null
                ? data.overall.percent - data.previous.percent : null}
            />
            <Kpi
              label="Auditorías" value={data.kpis.audits}
              hint={data.previous ? `${data.previous.audits} en el período anterior` : undefined}
            />
            <Kpi label="Servicios evaluados" value={data.kpis.areas} />
            <Kpi label="Profesionales evaluados" value={data.kpis.subjects} />
            <Kpi label="Criterios críticos" value={data.kpis.criticalCriteria} percent={data.kpis.criticalCriteria > 0 ? 0 : 100} hint="Por debajo del 70 %" />
          </div>

          <div ref={charts} className="dc-charts">
            <Card accent={identity.color} className="p-5 dc-wide">
              <div className="dc-chart-head">
                <div><p className="ds-eyebrow">Evolución</p><h3>Adherencia por fecha</h3></div>
                <div className="w-[150px]">
                  <Select value={filters.period || 'mes'} onChange={value => set({ period: value })} options={PERIODS} />
                </div>
              </div>
              <div data-chart="Adherencia por fecha">
                <LineChart
                  data={data.byDate.map(row => ({ label: row.period || '', value: row.percent }))}
                  color={identity.color} area height={260} valueFormatter={v => `${Math.round(v)}`}
                  referenceLine={{ value: 70, label: 'Mínimo aceptable' }}
                />
              </div>
            </Card>

            <Card accent={identity.color} className="p-5">
              <p className="ds-eyebrow">Estado</p><h3>Auditorías por estado</h3>
              {/* Solo dos estados, que son los que el modelo distingue de verdad. No hay
                  "vencidas" porque ninguna lista tiene plazo. */}
              <div data-chart="Auditorías por estado">
                <DonutChart
                  height={260}
                  centerLabel="Auditorías"
                  data={data.statusMix.map(row => ({
                    label: row.status === 'CERRADA' ? 'Cerradas' : 'En borrador',
                    value: row.n,
                    color: row.status === 'CERRADA' ? identity.color : '#94A3B8',
                  }))}
                />
              </div>
            </Card>

            <Card accent={identity.color} className="p-5">
              <p className="ds-eyebrow">Comparación</p><h3>Por servicio</h3>
              <div data-chart="Adherencia por servicio">
                <BarChart
                  data={data.byArea.map(row => ({ label: short(row.name || '', 18), value: row.percent, color: semaphoreColor(row.percent) }))}
                  height={260} valueFormatter={v => `${Math.round(v)}`}
                />
              </div>
            </Card>

            <Card accent={identity.color} className="p-5 dc-wide">
              <p className="ds-eyebrow">Paquetes</p><h3>Por dominio</h3>
              <div data-chart="Adherencia por dominio">
                <BarChart
                  orientation="horizontal"
                  data={data.byDomain.slice(0, 12).map(row => ({ label: short(row.name || '', 46), value: row.percent, color: semaphoreColor(row.percent) }))}
                  height={340} valueFormatter={v => `${Math.round(v)}`}
                />
              </div>
            </Card>

            <Card accent={identity.color} className="p-5">
              <p className="ds-eyebrow">Personas</p><h3>Por profesional evaluado</h3>
              <div data-chart="Adherencia por profesional evaluado">
                <BarChart
                  orientation="horizontal"
                  data={data.bySubject.slice(0, 10).map(row => ({ label: short(row.name || ''), value: row.percent, color: semaphoreColor(row.percent) }))}
                  height={280} valueFormatter={v => `${Math.round(v)}`}
                />
              </div>
            </Card>

            <Card accent={identity.color} className="p-5 dc-wide">
              <p className="ds-eyebrow">Quién diligencia</p><h3>Por auditor</h3>
              <div data-chart="Adherencia por auditor">
                <BarChart
                  orientation="horizontal"
                  data={data.byAuditor.slice(0, 10).map(row => ({ label: short(row.name || ''), value: row.percent, color: semaphoreColor(row.percent) }))}
                  height={280} valueFormatter={v => `${Math.round(v)}`}
                />
              </div>
            </Card>
          </div>

          <Card accent={identity.color} className="overflow-hidden">
            <div className="table-toolbar">
              <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                <span><BarChart3 size={19} /></span>
                <div><h2>Criterios más incumplidos</h2><p>Dónde falla la entidad — el dato más accionable</p></div>
              </div>
            </div>
            <div className="checklists-table">
              <Table>
                <thead><tr><th>Criterio</th><th>Dominio</th><th>Lista</th><th>C</th><th>NC</th><th>Adherencia</th></tr></thead>
                <tbody>
                  {data.byCriterion.slice(0, 15).map(row => (
                    <tr key={row.id}>
                      <td>{row.item_number ? <strong>{row.item_number}. </strong> : null}{row.text}</td>
                      <td>{row.domain_name}</td>
                      <td>{row.template_name}</td>
                      <td className="tabular-col">{row.c}</td>
                      <td className="tabular-col">{row.nc}</td>
                      <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{fmt(row.percent)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>

          <Card accent={identity.color} className="overflow-hidden">
            <div className="table-toolbar">
              <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                <span><BarChart3 size={19} /></span>
                <div><h2>Auditorías del filtro</h2><p>{data.byAudit.length} en este recorte</p></div>
              </div>
            </div>
            <div className="checklists-table">
              <Table>
                <thead><tr><th>Lista</th><th>Servicio</th><th>Fecha</th><th>Turno</th><th>Auditor</th><th>Adherencia</th><th></th></tr></thead>
                <tbody>
                  {data.byAudit.slice(0, 30).map(row => (
                    <tr key={row.id}>
                      <td><strong>{row.template_name}</strong></td>
                      <td>{row.area_name || '—'}</td>
                      <td className="tabular-col">{String(row.audit_date).slice(0, 10)}</td>
                      <td>{row.shift || '—'}</td>
                      <td>{row.auditor_name}</td>
                      <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{fmt(row.percent)}</strong></td>
                      <td>
                        <div className="row-action-group">
                          <button className="row-action" style={{ color: identity.color }} title="Ver el detalle"
                                  onClick={() => navigate(`/app/listas-chequeo/auditorias/${row.id}`)}>
                            <Eye size={13} /> Ver
                          </button>
                          <button className="row-action" style={{ color: identity.color }} title="Abrir para editar"
                                  onClick={() => navigate(`/app/listas-chequeo/auditorias/${row.id}`)}>
                            <PenLine size={13} />
                          </button>
                          <a className="row-action" style={{ color: identity.color }} title="Descargar su informe PDF"
                             href={`/api/checklists/audits/${row.id}/report.pdf`} target="_blank" rel="noreferrer">
                            <Download size={13} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
