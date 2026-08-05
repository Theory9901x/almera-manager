import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCheck, CheckCircle2, ClipboardCheck, ClipboardList,
  Clock, Download, Eye, FileSpreadsheet, ListChecks, ListOrdered, Loader2, Search,
  SlidersHorizontal, TrendingDown, TrendingUp, Users, X,
} from 'lucide-react'
import {
  BarChart, Button, DatePicker, DonutChart, EmptyState, LineChart, Select,
  moduleIdentity, useCountUp, useToast,
} from '@/design-system'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
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
  // Vistas dedicadas del molde. NO son otro recorte de datos: son otra lectura del MISMO
  // `dataCenterData` ya filtrado, para no tener dos verdades sobre el mismo periodo.
  const [view, setView] = useState<'general' | 'paciente' | 'colaborador' | 'criterio'>('general')
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
    if (filters.center) out.push({ key: 'center', label: `Centro: ${filters.center === 'SIN' ? 'Sin centro' : filters.center}` })
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
    if (filters.areaId) {
      const area = options.areas.find(a => a.id === filters.areaId)
      return `Servicio: ${area ? `${area.center ? `${area.center} — ` : ''}${area.name}` : ''}`
    }
    if (filters.center) return `Centro: ${filters.center === 'SIN' ? 'Sin centro' : filters.center}`
    return 'Visión general — todas las listas y servicios'
  }, [filters.templateId, filters.areaId, filters.center, options])

  // Servicios de la sede elegida; sin sede, el catalogo entero. 'SIN' agrupa las areas sin centro.
  const centerAreas = useMemo(() => {
    if (!options) return []
    if (!filters.center) return options.areas
    return options.areas.filter(area => (area.center || 'SIN') === filters.center)
  }, [options, filters.center])

  // Busqueda y paginacion de la tabla, en el cliente: el recorte ya viene acotado del servidor
  // (<=300 filas) y paginarlo alla obligaria a otro viaje por cada tecla.
  const tableRows = useMemo(() => {
    if (!data) return []
    const needle = search.trim().toLowerCase()
    if (!needle) return data.byAudit
    return data.byAudit.filter(row =>
      [row.template_name, row.template_code, row.area_name, row.auditor_name, row.shift, row.subjects, row.id]
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
      // ECharts posiciona su svg con style="position:absolute; width...; height..." dentro de un
      // contenedor relativo. Serializado tal cual, en el PDF se iba a la esquina de la pagina y
      // tapaba la cabecera. Se quita el estilo inline y se fijan dimensiones + viewBox, que es
      // lo que permite escalarlo al ancho de su columna sin deformarse.
      const rect = svg.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      clone.removeAttribute('style')
      clone.setAttribute('width', String(width))
      clone.setAttribute('height', String(height))
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
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
  /** Sujetos por tipo. `subject_label` lo define cada lista ("Paciente", "Colaborador"…), asi que
   *  se clasifica por esa etiqueta y no por una lista fija de palabras del sistema. */
  const subjectsByKind = (kind: 'paciente' | 'colaborador') => (data?.bySubject || [])
    .filter(row => {
      const label = (row.subject_label || '').toLowerCase()
      return kind === 'paciente' ? label.includes('paciente') : !label.includes('paciente')
    })
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))
  const ncAreas = data
    ? [...data.byArea].filter(row => row.nc > 0).sort((a, b) => b.nc - a.nc).slice(0, 5)
    : []

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
              {/* Centro y servicio SEPARADOS, en ese orden: primero la sede, luego su servicio.
                  El catalogo es completo (los 47 sembrados), no solo lo ya auditado. */}
              <div className="dcx-fgroup"><label>Centro de atención</label>
                <Select value={filters.center || 'ALL'}
                  onChange={value => {
                    const next = value === 'ALL' ? undefined : value
                    // Al cambiar de sede, un servicio elegido de otra sede deja de valer.
                    setFilters(current => ({ ...current, center: next, areaId: undefined }))
                  }}
                  options={[{ value: 'ALL', label: 'Todos' },
                    ...options.centers.map(item => ({ value: item || 'SIN', label: item || 'Sin centro' }))]} />
              </div>
              <div className="dcx-fgroup"><label>Servicio / proceso</label>
                <Select value={filters.areaId || 'ALL'} onChange={value => set({ areaId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: filters.center ? 'Todos los de la sede' : 'Todos' },
                    ...centerAreas.map(a => ({ value: a.id, label: filters.center ? a.name : `${a.center ? `${a.center} · ` : ''}${a.name}` }))]} />
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
                  {/* ECharts, como el resto de graficas del sistema. El color lo pone el
                      SEMAFORO barra a barra: aqui se comunica "que tan bien va", no identidad. */}
                  <div data-chart="Cumplimiento por dominio">
                    <BarChart
                      orientation="horizontal"
                      height={200}
                      hideValueAxis
                      data={data.byDomain.slice(0, 7).map(row => ({
                        label: short(row.name || '', 22),
                        value: row.percent,
                        color: row.percent === null ? '#94A3B8' : semaphoreColor(row.percent),
                      }))}
                      valueFormatter={value => `${value.toFixed(1)} %`}
                    />
                  </div>
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
              {/* Vistas dedicadas del molde: la misma data ya filtrada, leida por otro eje. */}
              <div className="dcx-views">
                {([['general', 'Resumen general'], ['paciente', 'Por paciente'],
                   ['colaborador', 'Por colaborador auditado'], ['criterio', 'Por criterios auditados']] as const)
                  .map(([key, label]) => (
                    <button key={key} className={`dcx-view ${view === key ? 'is-on' : ''}`} onClick={() => setView(key)}>
                      {label}
                    </button>
                  ))}
              </div>

              {view !== 'general' && (
                <div className="dcx-card">
                  <div className="dcx-ph">
                    <span className="dcx-pt">
                      {view === 'criterio' ? 'Criterios auditados' : view === 'paciente' ? 'Pacientes auditados' : 'Colaboradores auditados'}
                    </span>
                    <span className="dcx-hint">Del mismo recorte de filtros · ordenado de menor a mayor cumplimiento</span>
                  </div>
                  <div className="dcx-table-wrap">
                    <table className="dcx-table">
                      {view === 'criterio' ? (
                        <>
                          <thead><tr><th>Criterio</th><th>Dominio</th><th>Lista</th><th>C</th><th>NC</th><th>NA</th><th>Adherencia</th></tr></thead>
                          <tbody>
                            {data.byCriterion.map(row => (
                              <tr key={row.id}>
                                <td>{row.item_number ? <strong>{row.item_number}. </strong> : null}{row.text}</td>
                                <td>{short(row.domain_name || '', 26)}</td>
                                <td>{short(row.template_name || '', 26)}</td>
                                <td className="tabular-col">{row.c}</td>
                                <td className="tabular-col">{row.nc}</td>
                                <td className="tabular-col">{row.na}</td>
                                <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{fmt(row.percent)}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </>
                      ) : (
                        <>
                          <thead><tr><th>{view === 'paciente' ? 'Paciente' : 'Colaborador'}</th><th>Auditado en</th><th>C</th><th>NC</th><th>NA</th><th>Adherencia</th></tr></thead>
                          <tbody>
                            {subjectsByKind(view).map(row => (
                              <tr key={`${row.name}-${row.subject_label}`}>
                                <td><strong>{row.name}</strong></td>
                                <td className="tabular-col">{row.audits} ronda{row.audits === 1 ? '' : 's'}</td>
                                <td className="tabular-col">{row.c}</td>
                                <td className="tabular-col">{row.nc}</td>
                                <td className="tabular-col">{row.na}</td>
                                <td className="tabular-col"><strong style={{ color: semaphoreColor(row.percent) }}>{fmt(row.percent)}</strong></td>
                              </tr>
                            ))}
                            {!subjectsByKind(view).length && (
                              <tr><td colSpan={6}><p className="dcx-hint" style={{ padding: '18px 0' }}>
                                Ninguna lista de este recorte audita {view === 'paciente' ? 'pacientes' : 'colaboradores'}.
                              </p></td></tr>
                            )}
                          </tbody>
                        </>
                      )}
                    </table>
                  </div>
                </div>
              )}

              <div className="dcx-row2">
                <div className="dcx-card">
                  <div className="dcx-ph">
                    <span className="dcx-pt">Auditorías del recorte</span>
                    <div className="dcx-search">
                      <Search size={13} />
                      <input placeholder="Buscar por ID, evaluado, lista, auditor o servicio…" value={search}
                        onChange={event => { setSearch(event.target.value); setPage(1) }} />
                    </div>
                  </div>
                  <div className="dcx-table-wrap">
                    <table className="dcx-table">
                      <thead>
                        <tr><th>ID</th><th>Fecha</th><th>Evaluado</th><th>Lista</th><th>Servicio</th><th>Auditor</th><th>Cumpl.</th><th>Resultado</th><th>NC</th><th></th></tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row: DataCenterRow) => (
                          <tr key={row.id}>
                            {/* El ID de la ronda es con lo que se la referencia fuera del sistema. */}
                            <td className="tabular-col"><span className="code-pill">A-{row.id}</span></td>
                            <td className="tabular-col">{fecha(row.audit_date)}</td>
                            <td>
                              {row.subjects ? <>{short(row.subjects, 26)}<small>{row.subject_label || 'Evaluado'}</small></> : '—'}
                            </td>
                            <td>
                              <strong>{short(row.template_name || '', 30)}</strong>
                              {row.template_code ? <small>{row.template_code}</small> : null}
                            </td>
                            <td>
                              {short(row.area_name || '—', 20)}
                              {row.area_center ? <small>{short(row.area_center, 24)}</small> : null}
                            </td>
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
                    {topSubjects.length ? (
                      <div data-chart="Top profesionales auditados">
                        <BarChart
                          orientation="horizontal"
                          height={Math.max(150, topSubjects.length * 34)}
                          hideValueAxis
                          data={topSubjects.map(row => ({
                            label: short(row.name || '', 20),
                            value: row.percent,
                            color: semaphoreColor(row.percent),
                          }))}
                          valueFormatter={value => `${value.toFixed(1)} %`}
                        />
                      </div>
                    ) : <p className="dcx-hint">Este recorte no evalúa profesionales.</p>}
                  </div>
                  <div className="dcx-card">
                    <div className="dcx-ph"><span className="dcx-pt">No conformidades por servicio</span></div>
                    {ncAreas.length ? (
                      <div data-chart="No conformidades por servicio">
                        <BarChart
                          orientation="horizontal"
                          height={Math.max(150, ncAreas.length * 34)}
                          hideValueAxis
                          color="#DC2626"
                          data={ncAreas.map(row => ({ label: short(row.name || '', 20), value: row.nc }))}
                          valueFormatter={value => String(Math.round(value))}
                        />
                      </div>
                    ) : <p className="dcx-hint">Sin no conformidades en este recorte.</p>}
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
