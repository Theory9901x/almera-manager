import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCheck, CheckCircle2, ClipboardCheck, ClipboardList,
  Clock, Download, Eye, FileSpreadsheet, ListChecks, ListOrdered, Loader2, Search,
  SlidersHorizontal, TrendingDown, TrendingUp, Users, X,
} from 'lucide-react'
import {
  Button, DatePicker, DonutChart, EmptyState, LineChart, Select,
  moduleIdentity, semaphoreColor, useCountUp, useToast,
} from '@/design-system'
import { checklistsService } from '../services/checklistsService'
import type { DataCenter, DataCenterFilters, DataCenterOptions, DataCenterRow } from '../types'

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

const CONCEPT_LABEL: Record<string, string> = {
  OPTIMO: 'Óptimo', ACEPTABLE: 'Aceptable', DEFICIENTE: 'Deficiente', MUY_DEFICIENTE: 'Muy deficiente',
}

const PAGE_SIZE = 8

const fmt = (percent: number | null) => percent === null ? 'Sin dato' : `${percent.toFixed(1)} %`
const short = (text: string, max = 26) => text.length > max ? `${text.slice(0, max - 1)}…` : text
const fecha = (value: string | undefined) =>
  value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '—'

/** Duracion legible. Una ronda puede cerrarse en minutos o dias despues: la unidad se adapta. */
function fmtDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86400).toFixed(1)} días`
}

/** Flecha de variacion contra el periodo anterior. Solo aparece si de verdad se pudo calcular. */
function Delta({ value, suffix = ' pts', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value === null) return <span className="dcx-kd-none">Filtra por fechas para comparar</span>
  const good = invert ? value <= 0 : value >= 0
  return (
    <span className={good ? 'dcx-kd-up' : 'dcx-kd-down'}>
      {value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {value >= 0 ? '+' : ''}{value.toFixed(1)}{suffix} vs. anterior
    </span>
  )
}

function Kpi({ tone, icon, label, value, suffix = '', delta }: {
  tone: 'b' | 'g' | 'v' | 'a' | 't'
  icon: React.ReactNode
  label: string
  value: number
  suffix?: string
  delta: React.ReactNode
}) {
  const animated = useCountUp(value)
  return (
    <div className="dcx-kpi">
      <span className={`dcx-ki is-${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="dcx-kl">{label}</div>
        <div className="dcx-kv">{suffix === ' %' ? animated.toFixed(1) : Math.round(animated).toLocaleString('es-CO')}{suffix}</div>
        <div className="dcx-kd">{delta}</div>
      </div>
    </div>
  )
}

/** Barra clay: riel hundido + relleno. El color del relleno lo decide quien la usa (semaforo
 *  para porcentajes, rojo para conteos de NC), nunca una paleta decorativa propia. */
function ClayBar({ label, percent, display, color, rank }: {
  label: string
  percent: number
  display: string
  color: string
  rank?: number
}) {
  return (
    <div className="dcx-bar">
      {rank !== undefined && <span className="dcx-bar-rank">{rank}</span>}
      <span className="dcx-bar-name" title={label}>{short(label)}</span>
      <span className="dcx-bar-track"><i style={{ width: `${Math.max(2, Math.min(100, percent))}%`, background: color }} /></span>
      <span className="dcx-bar-value" style={{ color }}>{display}</span>
    </div>
  )
}

/**
 * Centro de datos en tres alcances con la misma estetica: general, por lista y por servicio.
 * El alcance NO es una vista aparte: lo definen los filtros, que viajan al servidor y
 * recalculan todo junto (dataCenterData). Filtrar en el cliente es como un grafico termina
 * contradiciendo al KPI de arriba sin que nadie lo note.
 */
export function DataCenterPanel() {
  const navigate = useNavigate()
  const toast = useToast()
  const [options, setOptions] = useState<DataCenterOptions | null>(null)
  const [filters, setFilters] = useState<DataCenterFilters>({ period: 'mes' })
  const [data, setData] = useState<DataCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const charts = useRef<HTMLDivElement>(null)

  useEffect(() => { checklistsService.dataCenterOptions().then(setOptions).catch(() => setOptions(null)) }, [])

  useEffect(() => {
    setLoading(true)
    checklistsService.dataCenter(filters)
      .then(result => { setData(result); setPage(1) })
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el tablero'))
      .finally(() => setLoading(false))
  }, [filters])

  const set = (patch: Partial<DataCenterFilters>) => setFilters(current => ({ ...current, ...patch }))

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

  /** El alcance actual, dicho con palabras: es lo primero que debe leerse del tablero. */
  const scope = useMemo(() => {
    if (!options) return 'Visión general'
    if (filters.templateId) return `Lista: ${options.templates.find(t => t.id === filters.templateId)?.name || ''}`
    if (filters.areaId) return `Servicio: ${options.areas.find(a => a.id === filters.areaId)?.name || ''}`
    return 'Visión general — todas las listas y servicios'
  }, [filters.templateId, filters.areaId, options])

  // Busqueda y paginacion de la tabla, en el cliente: el recorte ya viene acotado del servidor
  // (<=300 filas) y paginarlo alla obligaria a otro viaje por cada tecla.
  const tableRows = useMemo(() => {
    if (!data) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return data.byAudit
    return data.byAudit.filter(row =>
      [row.template_name, row.template_code, row.area_name, row.auditor_name, row.shift]
        .some(field => String(field || '').toLowerCase().includes(needle)))
  }, [data, search])
  const pages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE))
  const pageRows = tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
  const overall = data?.overall
  const answered = overall ? overall.c + overall.nc + overall.na : 0
  const deltaPercent = data?.previous && data.previous.percent !== null && overall?.percent != null
    ? overall.percent - data.previous.percent : null
  const deltaAudits = data?.previous && data.previous.audits > 0 && data
    ? ((data.kpis.audits - data.previous.audits) / data.previous.audits) * 100 : null

  const topSubjects = data
    ? [...data.bySubject].filter(row => row.percent !== null).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0)).slice(0, 5)
    : []
  const ncAreas = data
    ? [...data.byArea].filter(row => row.nc > 0).sort((a, b) => b.nc - a.nc).slice(0, 5)
    : []
  const maxNc = ncAreas[0]?.nc || 1

  return (
    <div className="dcx">
      {/* Topbar: que es y sobre que recorte. El alcance (general / por lista / por servicio)
          se dice aqui con palabras, no hay que deducirlo de los filtros. */}
      <div className="dcx-topbar">
        <div className="dcx-tb-l">
          <span className="dcx-tb-ic"><BarChart3 size={20} /></span>
          <div>
            <h2>Centro de datos de listas</h2>
            <p>{scope}</p>
          </div>
        </div>
        <div className="dcx-tb-r">
          <div className="dcx-chip is-col">
            <span>Período</span>
            <b>{filters.dateFrom || filters.dateTo
              ? `${filters.dateFrom || 'inicio'} — ${filters.dateTo || 'hoy'}`
              : 'Todo el período registrado'}</b>
          </div>
          <button className="dcx-chip" onClick={() => setFilters({ period: filters.period })} disabled={!chips.length}>
            <X size={14} /> Limpiar
          </button>
          <button className="dcx-chip" onClick={() => checklistsService.dataCenterCsv(filters)} disabled={!hasData}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button className="dcx-chip is-pri" onClick={() => void exportPdf()} disabled={!hasData || exporting}>
            <Download size={14} /> {exporting ? 'Generando…' : 'Informe PDF'}
          </button>
        </div>
      </div>

      {loading && <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>}

      {!loading && data && (
        <>
          <div className="dcx-kpis">
            <Kpi tone="b" icon={<ClipboardCheck size={22} />} label="Auditorías aplicadas" value={data.kpis.audits}
              delta={<Delta value={deltaAudits} suffix=" %" />} />
            <Kpi tone="g" icon={<CheckCircle2 size={22} />} label="Cumplimiento general" value={overall?.percent ?? 0} suffix=" %"
              delta={<Delta value={deltaPercent} />} />
            <Kpi tone="v" icon={<ListChecks size={22} />} label="Criterios cumplidos" value={overall?.c ?? 0}
              delta={<span className="dcx-kd-none">{overall ? `${answered.toLocaleString('es-CO')} evaluados en total` : ''}</span>} />
            <Kpi tone="a" icon={<AlertTriangle size={22} />} label="No conformidades" value={overall?.nc ?? 0}
              delta={<span className="dcx-kd-none">{data.kpis.criticalCriteria} criterios críticos (&lt;70 %)</span>} />
            <Kpi tone="t" icon={<Users size={22} />} label="Profesionales auditados" value={data.kpis.subjects}
              delta={<span className="dcx-kd-none">{data.kpis.auditors} auditores activos</span>} />
          </div>

          <div className="dcx-row1" ref={charts}>
            <div className="dcx-card">
              <div className="dcx-ph"><span className="dcx-pt is-caps"><SlidersHorizontal size={13} /> Filtros rápidos</span></div>
              <div className="dcx-fpair">
                <div className="dcx-fgroup"><label>Fecha inicio</label><DatePicker value={filters.dateFrom || ''} onChange={value => set({ dateFrom: value || undefined })} /></div>
                <div className="dcx-fgroup"><label>Fecha fin</label><DatePicker value={filters.dateTo || ''} onChange={value => set({ dateTo: value || undefined })} /></div>
              </div>
              <div className="dcx-fgroup"><label>Lista de chequeo</label>
                <Select value={filters.templateId || 'ALL'} onChange={value => set({ templateId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todas' }, ...options.templates.map(t => ({ value: t.id, label: t.name }))]} />
              </div>
              <div className="dcx-fgroup"><label>Servicio / proceso</label>
                <Select value={filters.areaId || 'ALL'} onChange={value => set({ areaId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todos' }, ...options.areas.map(a => ({ value: a.id, label: a.name }))]} />
              </div>
              <div className="dcx-fgroup"><label>Auditor</label>
                <Select value={filters.auditorId || 'ALL'} onChange={value => set({ auditorId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todos' }, ...options.auditors.map(a => ({ value: a.id, label: a.name }))]} />
              </div>
              <div className="dcx-fgroup"><label>Dominio</label>
                <Select value={filters.domainId || 'ALL'} onChange={value => set({ domainId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todos' }, ...options.domains.map(d => ({ value: d.id, label: d.name }))]} />
              </div>
              <div className="dcx-fpair">
                <div className="dcx-fgroup"><label>Turno</label>
                  <Select value={filters.shift || 'ALL'} onChange={value => set({ shift: value === 'ALL' ? undefined : value })}
                    options={[{ value: 'ALL', label: 'Todos' }, ...options.shifts.map(s => ({ value: s, label: s }))]} />
                </div>
                <div className="dcx-fgroup"><label>Nivel</label>
                  <Select value={filters.maxPercent || ''} onChange={value => set({ maxPercent: value || undefined })} options={LEVELS} />
                </div>
              </div>
              {chips.length > 0 && (
                <div className="dcx-chips">
                  {chips.map(chip => (
                    <button key={chip.key} className="dcx-fchip" onClick={() => set({ [chip.key]: undefined })}>
                      {chip.label} <X size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {hasData ? (
              <>
                <div className="dcx-card">
                  <div className="dcx-ph">
                    <span className="dcx-pt">Tendencia de cumplimiento</span>
                    <div className="w-[130px]"><Select value={filters.period || 'mes'} onChange={value => set({ period: value })} options={PERIODS} /></div>
                  </div>
                  <div data-chart="Tendencia de cumplimiento">
                    <LineChart
                      data={data.byDate.map(row => ({ label: row.period || '', value: row.percent }))}
                      color={identity.color} area height={300} valueFormatter={v => `${Math.round(v)}`}
                      referenceLine={{ value: 70, label: 'Mínimo aceptable' }}
                    />
                  </div>
                </div>

                <div className="dcx-card">
                  <div className="dcx-ph"><span className="dcx-pt">Distribución de resultados</span></div>
                  {/* C / NC / NA, sin "parcialmente": la escala no tiene estado intermedio y el
                      donut no puede inventarlo (decision del §15.2). */}
                  <div data-chart="Distribución de resultados">
                    <DonutChart
                      height={230}
                      centerLabel="Criterios"
                      data={[
                        { label: 'Cumplidos', value: overall?.c ?? 0, color: '#059669' },
                        { label: 'No cumplidos', value: overall?.nc ?? 0, color: '#DC2626' },
                        { label: 'No aplica', value: overall?.na ?? 0, color: '#94A3B8' },
                      ]}
                    />
                  </div>
                  <div className="dcx-dleg">
                    <div><span className="dcx-sw" style={{ background: '#059669' }} />Cumplidos <b>{(overall?.c ?? 0).toLocaleString('es-CO')}</b></div>
                    <div><span className="dcx-sw" style={{ background: '#DC2626' }} />No cumplidos <b>{(overall?.nc ?? 0).toLocaleString('es-CO')}</b></div>
                    <div><span className="dcx-sw" style={{ background: '#94A3B8' }} />No aplica <b>{(overall?.na ?? 0).toLocaleString('es-CO')}</b></div>
                  </div>
                </div>

                <div className="dcx-card">
                  <div className="dcx-ph"><span className="dcx-pt">Cumplimiento por dominio</span></div>
                  {data.byDomain.slice(0, 7).map(row => (
                    <ClayBar key={row.name} label={row.name || ''} percent={row.percent ?? 0}
                      display={row.percent === null ? '—' : `${row.percent.toFixed(1)} %`}
                      color={row.percent === null ? '#94A3B8' : semaphoreColor(row.percent)} />
                  ))}
                  <div className="dcx-axis"><span>0 %</span><span>50 %</span><span>100 %</span></div>
                </div>
              </>
            ) : (
              <div className="dcx-card dcx-span3">
                <EmptyState
                  icon={BarChart3}
                  title="Ninguna auditoría cumple estos filtros"
                  description="El tablero solo cuenta auditorías cerradas. Prueba a quitar algún filtro, ampliar el rango de fechas o revisar si hay rondas sin cerrar."
                  action={chips.length ? <Button variant="secondary" onClick={() => setFilters({ period: filters.period })}><X size={15} /> Limpiar filtros</Button> : undefined}
                />
              </div>
            )}
          </div>

          {hasData && (
            <>
              <div className="dcx-row2">
                <div className="dcx-card">
                  <div className="dcx-ph">
                    <span className="dcx-pt">Auditorías del recorte</span>
                    <div className="dcx-search">
                      <Search size={13} />
                      <input placeholder="Buscar lista, auditor, servicio…" value={search}
                        onChange={event => { setSearch(event.target.value); setPage(1) }} />
                    </div>
                  </div>
                  <div className="dcx-table-wrap">
                    <table className="dcx-table">
                      <thead>
                        <tr><th>Fecha</th><th>Lista</th><th>Servicio</th><th>Auditor</th><th>Cumpl.</th><th>Resultado</th><th>NC</th><th></th></tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row: DataCenterRow) => (
                          <tr key={row.id}>
                            <td className="tabular-col">{fecha(row.audit_date)}</td>
                            <td>
                              <strong>{short(row.template_name || '', 34)}</strong>
                              {row.template_code ? <small>{row.template_code}</small> : null}
                            </td>
                            <td>{short(row.area_name || '—', 22)}</td>
                            <td>{short(row.auditor_name || '', 20)}</td>
                            <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{fmt(row.percent)}</strong></td>
                            <td>
                              {row.concept ? (
                                <span className="dcx-res" style={{
                                  background: `color-mix(in srgb, ${semaphoreColor(row.percent)} 15%, transparent)`,
                                  color: semaphoreColor(row.percent),
                                }}>{CONCEPT_LABEL[row.concept] || row.concept}</span>
                              ) : '—'}
                            </td>
                            <td className="tabular-col">{row.nc}</td>
                            <td>
                              <span className="dcx-tac">
                                <button title="Ver el detalle" onClick={() => navigate(`/app/listas-chequeo/auditorias/${row.id}`)}><Eye size={13} /></button>
                                <a title="Descargar su informe PDF" href={`/api/checklists/audits/${row.id}/report.pdf`} target="_blank" rel="noreferrer"><Download size={13} /></a>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="dcx-pgs">
                    <span className="dcx-pgs-info">
                      {tableRows.length
                        ? `Mostrando ${(page - 1) * PAGE_SIZE + 1} a ${Math.min(page * PAGE_SIZE, tableRows.length)} de ${tableRows.length}`
                        : 'Sin coincidencias con la búsqueda'}
                    </span>
                    <button className="dcx-pg" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
                    {Array.from({ length: Math.min(5, pages) }, (_, index) => {
                      const n = page <= 3 ? index + 1 : Math.min(pages - 4, page - 2) + index
                      if (n < 1 || n > pages) return null
                      return <button key={n} className={`dcx-pg ${n === page ? 'is-on' : ''}`} onClick={() => setPage(n)}>{n}</button>
                    })}
                    <button className="dcx-pg" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
                  </div>
                </div>

                <div className="dcx-col">
                  <div className="dcx-card">
                    <div className="dcx-ph"><span className="dcx-pt">Top profesionales auditados</span></div>
                    {topSubjects.length ? topSubjects.map((row, index) => (
                      <ClayBar key={row.name} rank={index + 1} label={row.name || ''} percent={row.percent ?? 0}
                        display={`${(row.percent ?? 0).toFixed(1)} %`}
                        color={semaphoreColor(row.percent)} />
                    )) : <p className="dcx-hint">Este recorte no evalúa profesionales.</p>}
                  </div>
                  <div className="dcx-card">
                    <div className="dcx-ph"><span className="dcx-pt">No conformidades por servicio</span></div>
                    {ncAreas.length ? ncAreas.map(row => (
                      <ClayBar key={row.name} label={row.name || ''} percent={(row.nc / maxNc) * 100}
                        display={String(row.nc)} color="#DC2626" />
                    )) : <p className="dcx-hint">Sin no conformidades en este recorte.</p>}
                  </div>
                </div>
              </div>

              <div className="dcx-card">
                <div className="dcx-ph"><span className="dcx-pt">Criterios más incumplidos</span><span className="dcx-hint">Dónde falla la entidad — el dato más accionable</span></div>
                <div className="dcx-table-wrap">
                  <table className="dcx-table">
                    <thead><tr><th>Criterio</th><th>Dominio</th><th>Lista</th><th>C</th><th>NC</th><th>Adherencia</th></tr></thead>
                    <tbody>
                      {data.byCriterion.slice(0, 10).map(row => (
                        <tr key={row.id}>
                          <td>{row.item_number ? <strong>{row.item_number}. </strong> : null}{row.text}</td>
                          <td>{short(row.domain_name || '', 30)}</td>
                          <td>{short(row.template_name || '', 30)}</td>
                          <td className="tabular-col">{row.c}</td>
                          <td className="tabular-col">{row.nc}</td>
                          <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{fmt(row.percent)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="dcx-fstats">
                <div className="dcx-fstat">
                  <span className="dcx-fic"><Clock size={18} /></span>
                  <div><div className="dcx-fl">Duración promedio de auditoría</div><div className="dcx-fv">{fmtDuration(data.kpis.avgSeconds)}</div><div className="dcx-fd">de creada a cerrada</div></div>
                </div>
                <div className="dcx-fstat">
                  <span className="dcx-fic"><CalendarDays size={18} /></span>
                  <div><div className="dcx-fl">Listas por día (prom.)</div><div className="dcx-fv">{data.kpis.activeDays ? (data.kpis.audits / data.kpis.activeDays).toFixed(1) : '—'}</div><div className="dcx-fd">{data.kpis.activeDays} días con rondas</div></div>
                </div>
                <div className="dcx-fstat">
                  <span className="dcx-fic"><ListOrdered size={18} /></span>
                  <div><div className="dcx-fl">Criterios por lista (prom.)</div><div className="dcx-fv">{data.kpis.audits ? (answered / data.kpis.audits).toFixed(1) : '—'}</div><div className="dcx-fd">criterios evaluados por ronda</div></div>
                </div>
                <div className="dcx-fstat">
                  <span className="dcx-fic"><ClipboardList size={18} /></span>
                  <div><div className="dcx-fl">Planes de mejora abiertos</div><div className="dcx-fv">{data.kpis.plansOpen}</div><div className="dcx-fd">de hallazgos de este recorte</div></div>
                </div>
                <div className="dcx-fstat">
                  <span className="dcx-fic"><CheckCheck size={18} /></span>
                  <div><div className="dcx-fl">Planes de mejora cerrados</div><div className="dcx-fv">{data.kpis.plansClosed}</div><div className="dcx-fd">verificados por calidad</div></div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
