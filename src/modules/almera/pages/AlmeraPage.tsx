import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, BarChart3, CalendarClock, CheckCircle2, ChevronDown, ClipboardCheck, Columns3,
  Download, FileText, History, LayoutList, ListTodo, Loader2, Map,
  Paperclip, PencilLine, Plus, RefreshCw, RotateCcw, Search, Send, Settings, SlidersHorizontal,
  Timer, Upload, X,
} from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { DatePicker, Select } from '@/design-system'
import { almeraService } from '../services/almeraService'
import type { AlmeraCatalogs, Assistance, AssistanceDashboard, AssistanceDetail, AssistanceFilters, AssistanceStatus } from '../types'

// ---------------------------------------------------------------------------
// Asistencias Tecnicas — reconstruccion completa de la capa de presentacion.
//
// La LOGICA es la misma de siempre: almeraService (endpoints intactos), los mismos filtros de
// servidor (processId/moduleId/status/dateFrom/dateTo), la misma busqueda en cliente y los mismos
// permisos technical_assistance.*. Lo que cambia es la arquitectura de la interfaz:
//
// - El detalle deja de ser un MODAL que tapa todo y pasa a un INSPECTOR lateral persistente:
//   se cambia de asistencia sin perder el tablero de vista, como en un service desk real.
// - La vista principal es un TABLERO por estado operativo (Vencidas / Sin iniciar / En curso /
//   Resueltas) — el estado general se entiende de un vistazo, sin leer una tabla.
// - Los filtros viven en una barra compacta: busqueda dominante + chips de estado + popover de
//   filtros avanzados con contador, en vez de un panel de tarjeta permanente.
// - La analitica (Balance) y los catalogos pasan a vistas secundarias del selector segmentado:
//   consultables, pero sin competir con la operacion diaria.
//
// Todo el CSS de esta pantalla esta encapsulado bajo .ats-app (ver seccion homonima de
// index.css) y no toca las clases del resto del sistema.
// ---------------------------------------------------------------------------

type View = 'board' | 'database' | 'balance' | 'catalogs'
type InspectorTab = 'resumen' | 'actividad' | 'evidencias' | 'gestion'

const STATUS_LABELS: Record<AssistanceStatus, string> = {
  PENDIENTE: 'Sin iniciar', EN_CURSO: 'En curso', COMPLETADA: 'Completada', VENCIDA: 'Vencida', CANCELADA: 'Cancelada',
}
const PRIORITY_LABELS: Record<Assistance['priority'], string> = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', CRITICA: 'Crítica' }

const EMPTY_CATALOGS: AlmeraCatalogs = { processes: [], modules: [], responsibles: [] }
const EMPTY_DASHBOARD: AssistanceDashboard = {
  summary: { total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0, due_soon: 0, average_completion: '0' },
  byModule: [], byProcess: [],
}

function inputDate(value: Date) {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 16)
}
function newForm() {
  const now = new Date()
  const commitment = new Date(now)
  commitment.setDate(commitment.getDate() + 7)
  return {
    subject: '', processId: '', almeraModuleId: '', receivedAt: inputDate(now), description: '',
    priority: 'MEDIA', commitmentAt: inputDate(commitment), responsibleMembershipId: '', requesterName: '', requesterContact: '',
  }
}
function formatDate(value?: string) {
  return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha'
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}
function timeToCommitment(value?: string) {
  if (!value) return 'Sin fecha límite'
  const difference = new Date(value).getTime() - Date.now()
  const totalHours = Math.max(1, Math.round(Math.abs(difference) / 3600000))
  const duration = totalHours < 24 ? `${totalHours} h` : `${Math.floor(totalHours / 24)} d${totalHours % 24 ? ` ${totalHours % 24} h` : ''}`
  return difference < 0 ? `Venció hace ${duration}` : `Vence en ${duration}`
}
function initials(name?: string) {
  if (!name) return '—'
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

/** Columna operativa de una asistencia. Vencida manda sobre el estado nominal: una EN_CURSO
 *  vencida es un problema de "Vencidas", no de "En curso". */
function laneOf(row: Assistance): 'overdue' | 'pending' | 'progress' | 'done' {
  if (row.effective_status === 'COMPLETADA' || row.effective_status === 'CANCELADA') return 'done'
  if (row.overdue) return 'overdue'
  if (row.effective_status === 'EN_CURSO') return 'progress'
  return 'pending'
}

export default function AlmeraPage() {
  const { session } = useAuth()
  const permissions = session?.permissions || []
  const has = (...keys: string[]) => keys.some(key => permissions.includes(key))
  const canCreate = has('technical_assistance.create')
  const canEdit = has('technical_assistance.edit')
  const canClose = has('technical_assistance.close')
  const canExport = has('technical_assistance.export')

  const [rows, setRows] = useState<Assistance[]>([])
  const [catalogs, setCatalogs] = useState<AlmeraCatalogs>(EMPTY_CATALOGS)
  const [dashboard, setDashboard] = useState<AssistanceDashboard>(EMPTY_DASHBOARD)
  const [filters, setFilters] = useState<AssistanceFilters>({})
  const [view, setView] = useState<View>('board')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // Busqueda con debounce: el filtrado es en cliente, el debounce solo evita recalcular la
  // lista en cada tecla con cientos de filas.
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchDraft), 220)
    return () => window.clearTimeout(timer)
  }, [searchDraft])

  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement | null>(null)

  // Inspector lateral: la asistencia seleccionada vive aqui, no en un modal.
  const [detail, setDetail] = useState<AssistanceDetail | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('resumen')
  const [detailLoading, setDetailLoading] = useState(false)
  // Desde la Base de datos el detalle se abre como FICHA emergente (toda la informacion de una
  // vez, como se lee un registro); desde el tablero sigue siendo el inspector lateral, que es
  // donde se gestiona sin perder el contexto.
  const [detailPresentation, setDetailPresentation] = useState<'inspector' | 'ficha'>('inspector')

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(newForm)
  const [action, setAction] = useState({ description: '', result: '', completionPercent: 0 })
  const [meta, setMeta] = useState({ commitmentAt: '', responsibleMembershipId: '', observations: '' })
  const [closeForm, setCloseForm] = useState({ solution: '', closedAt: inputDate(new Date()) })
  const [reopenText, setReopenText] = useState('')
  const [evidenceDescription, setEvidenceDescription] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    try {
      setLoadError('')
      const [items, summary] = await Promise.all([almeraService.assistances(filters), almeraService.dashboard(filters)])
      setRows(items)
      setDashboard(summary)
      setLastSync(new Date())
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'No fue posible cargar las asistencias')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    void almeraService.catalogs().then(setCatalogs)
      .catch(caught => setLoadError(caught instanceof Error ? caught.message : 'No fue posible cargar los catálogos'))
  }, [])
  useEffect(() => { void load() }, [filters.processId, filters.moduleId, filters.status, filters.dateFrom, filters.dateTo])

  // Cerrar con Escape: primero lo flotante (modal, popover), luego el inspector.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showCreate) { setShowCreate(false); return }
      if (filtersOpen) { setFiltersOpen(false); return }
      if (detail) setDetail(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showCreate, filtersOpen, detail])

  // El popover de filtros se cierra al hacer clic fuera.
  useEffect(() => {
    if (!filtersOpen) return
    const onClick = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [filtersOpen])

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    if (!term) return rows
    return rows.filter(row =>
      `${row.code} ${row.subject} ${row.process_name} ${row.module_name} ${row.responsible_name || ''}`
        .toLocaleLowerCase('es').includes(term))
  }, [rows, search])

  const lanes = useMemo(() => {
    const buckets = { overdue: [] as Assistance[], pending: [] as Assistance[], progress: [] as Assistance[], done: [] as Assistance[] }
    for (const row of visibleRows) buckets[laneOf(row)].push(row)
    const byCommitment = (a: Assistance, b: Assistance) =>
      new Date(a.commitment_at || '2999-12-31').getTime() - new Date(b.commitment_at || '2999-12-31').getTime()
    buckets.overdue.sort(byCommitment); buckets.pending.sort(byCommitment); buckets.progress.sort(byCommitment)
    buckets.done.sort((a, b) => new Date(b.closed_at || b.received_at).getTime() - new Date(a.closed_at || a.received_at).getTime())
    return buckets
  }, [visibleRows])

  const activeFilterCount = [filters.processId, filters.moduleId, filters.dateFrom, filters.dateTo].filter(Boolean).length
  const updateFilter = (key: keyof AssistanceFilters, value: string) =>
    setFilters(current => ({ ...current, [key]: value || undefined }))

  const openDetail = async (id: string, presentation?: 'inspector' | 'ficha') => {
    setDetailLoading(true)
    try {
      setError('')
      const result = await almeraService.detail(id)
      setDetail(result)
      setDetailPresentation(presentation || (view === 'database' ? 'ficha' : 'inspector'))
      setInspectorTab('resumen')
      setAction({ description: '', result: '', completionPercent: result.assistance.completion_percent })
      setMeta({
        commitmentAt: result.assistance.commitment_at ? inputDate(new Date(result.assistance.commitment_at)) : '',
        responsibleMembershipId: result.assistance.responsible_membership_id || '',
        observations: result.assistance.general_observations || '',
      })
      setCloseForm({ solution: '', closedAt: inputDate(new Date()) })
      setReopenText(''); setFiles(null); setEvidenceDescription('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible abrir el detalle')
    } finally { setDetailLoading(false) }
  }

  const refreshAfterMutation = async (message: string) => {
    if (detail) {
      const fresh = await almeraService.detail(detail.assistance.id)
      setDetail(fresh)
      setAction(current => ({ ...current, description: '', result: '', completionPercent: fresh.assistance.completion_percent }))
    }
    await load()
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true); setError('')
    try { await work(); await refreshAfterMutation(message) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible completar la operación') }
    finally { setBusy(false) }
  }

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await almeraService.createAssistance({
        ...form,
        responsibleMembershipId: form.responsibleMembershipId || null,
        requesterName: form.requesterName || session?.user.fullName,
      })
      setForm(newForm()); setShowCreate(false); await load()
      setNotice('Asistencia registrada correctamente')
      window.setTimeout(() => setNotice(''), 3500)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible registrar la asistencia') }
    finally { setBusy(false) }
  }

  const exportCsv = async () => {
    setBusy(true)
    try { await almeraService.exportCsv({ ...filters, q: search }); setNotice('Archivo CSV generado'); window.setTimeout(() => setNotice(''), 3500) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible exportar') }
    finally { setBusy(false) }
  }

  const statusChips: [AssistanceStatus | undefined, string][] = [
    [undefined, 'Todas'], ['VENCIDA', 'Vencidas'], ['PENDIENTE', 'Sin iniciar'], ['EN_CURSO', 'En curso'], ['COMPLETADA', 'Completadas'],
  ]
  const selectedId = detail?.assistance.id || null

  return (
    <div className={`ats-app${detail && detailPresentation === 'inspector' ? ' has-inspector' : ''}`}>
      <div className="ats-main">
        {/* ---- Capa 1: contexto ---- */}
        <header className="ats-page-header">
          <div className="ats-page-title">
            <p className="ats-eyebrow">Gestión ALMERA · Control operativo</p>
            <h1>Asistencias técnicas</h1>
            <p className="ats-page-sub">
              Gestión de solicitudes, seguimiento y tiempos de atención.
              {lastSync && <span className="ats-sync"><RefreshCw size={11} /> Actualizado {lastSync.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>}
            </p>
          </div>
          <div className="ats-page-actions">
            {canExport && (
              <button className="ats-btn" onClick={() => void exportCsv()} disabled={busy}>
                <Download size={15} /> Exportar
              </button>
            )}
            {canCreate && (
              <button className="ats-btn is-primary" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> Nueva asistencia
              </button>
            )}
          </div>
        </header>

        {/* ---- Capa 2: resumen operativo (datos reales del dashboard, nada inventado) ---- */}
        <section className="ats-summary" aria-label="Resumen operativo">
          <MetricCard icon={ClipboardCheck} label="Total" value={dashboard.summary.total} sub="con los filtros actuales" />
          <MetricCard icon={ListTodo} label="Sin iniciar" value={dashboard.summary.pending} sub="esperan asignación o arranque" />
          <MetricCard icon={Loader2} label="En curso" value={dashboard.summary.in_progress} sub={`${dashboard.summary.due_soon} por vencer en 48 h`} tone={dashboard.summary.due_soon > 0 ? 'warning' : undefined} />
          <MetricCard icon={AlertTriangle} label="Vencidas" value={dashboard.summary.overdue} sub="requieren acción inmediata" tone={dashboard.summary.overdue > 0 ? 'danger' : undefined} />
          <MetricCard icon={CheckCircle2} label="Completadas" value={dashboard.summary.completed} sub={`${dashboard.summary.average_completion}% de avance promedio`} tone="success" />
        </section>

        {/* ---- Capa 3: exploracion ---- */}
        <section className="ats-toolbar" aria-label="Búsqueda y filtros">
          <label className="ats-search">
            <Search size={15} />
            <input
              value={searchDraft}
              onChange={event => setSearchDraft(event.target.value)}
              placeholder="Buscar código, asunto, proceso o responsable…"
              aria-label="Buscar asistencias"
            />
            {searchDraft && <button aria-label="Limpiar búsqueda" onClick={() => setSearchDraft('')}><X size={13} /></button>}
          </label>

          <div className="ats-chiprow" role="group" aria-label="Filtro rápido por estado">
            {statusChips.map(([value, label]) => (
              <button
                key={label}
                className={`ats-chip${(filters.status || undefined) === value ? ' is-on' : ''}`}
                onClick={() => updateFilter('status', value || '')}
              >{label}</button>
            ))}
          </div>

          <div className="ats-toolbar-right">
            <div className="ats-popwrap" ref={filtersRef}>
              <button
                className={`ats-btn${activeFilterCount ? ' has-badge' : ''}`}
                aria-expanded={filtersOpen}
                aria-controls="ats-adv-filters"
                onClick={() => setFiltersOpen(current => !current)}
              >
                <SlidersHorizontal size={15} /> Filtros
                {activeFilterCount > 0 && <b className="ats-count">{activeFilterCount}</b>}
                <ChevronDown size={13} />
              </button>
              {filtersOpen && (
                <div className="ats-popover" id="ats-adv-filters" role="dialog" aria-label="Filtros avanzados">
                  <div className="ats-pop-field">
                    <span>Proceso solicitante</span>
                    <Select
                      value={filters.processId || ''}
                      onChange={value => updateFilter('processId', value)}
                      placeholder="Todos los procesos"
                      options={catalogs.processes.map(item => ({ value: item.id, label: item.name }))}
                    />
                  </div>
                  <div className="ats-pop-field">
                    <span>Módulo ALMERA</span>
                    <Select
                      value={filters.moduleId || ''}
                      onChange={value => updateFilter('moduleId', value)}
                      placeholder="Todos los módulos"
                      options={catalogs.modules.map(item => ({ value: item.id, label: item.name }))}
                    />
                  </div>
                  <div className="ats-pop-dates">
                    <label><span>Desde</span><DatePicker value={filters.dateFrom || ''} onChange={value => updateFilter('dateFrom', value)} /></label>
                    <label><span>Hasta</span><DatePicker value={filters.dateTo || ''} onChange={value => updateFilter('dateTo', value)} /></label>
                  </div>
                  {activeFilterCount > 0 && (
                    <button className="ats-clear" onClick={() => { setFilters(current => ({ status: current.status })); }}>
                      <RotateCcw size={13} /> Limpiar filtros avanzados
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="ats-views" role="tablist" aria-label="Vista">
              {([
                ['board', 'Tablero', Columns3],
                ['database', 'Base de datos', LayoutList],
                ['balance', 'Balance', BarChart3],
                ['catalogs', 'Catálogos', Settings],
              ] as [View, string, typeof Columns3][]).map(([key, label, Icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={view === key}
                  className={view === key ? 'is-on' : ''}
                  onClick={() => setView(key)}
                  title={label}
                ><Icon size={14} /><span>{label}</span></button>
              ))}
            </div>
          </div>
        </section>

        {/* Chips de filtros avanzados activos, removibles sin abrir el popover. */}
        {activeFilterCount > 0 && (
          <div className="ats-active-filters">
            {filters.processId && <button className="ats-chip is-filter" onClick={() => updateFilter('processId', '')}>Proceso: {catalogs.processes.find(item => item.id === filters.processId)?.name || ''} <X size={12} /></button>}
            {filters.moduleId && <button className="ats-chip is-filter" onClick={() => updateFilter('moduleId', '')}>Módulo: {catalogs.modules.find(item => item.id === filters.moduleId)?.name || ''} <X size={12} /></button>}
            {filters.dateFrom && <button className="ats-chip is-filter" onClick={() => updateFilter('dateFrom', '')}>Desde {filters.dateFrom} <X size={12} /></button>}
            {filters.dateTo && <button className="ats-chip is-filter" onClick={() => updateFilter('dateTo', '')}>Hasta {filters.dateTo} <X size={12} /></button>}
          </div>
        )}

        {loadError && (
          <div className="ats-error" role="alert">
            <AlertTriangle size={16} />
            <span>{loadError}</span>
            <button className="ats-btn" onClick={() => { setLoading(true); void load() }}><RefreshCw size={14} /> Reintentar</button>
          </div>
        )}

        {/* ---- Capa 4: gestion ---- */}
        {view === 'board' && (
          loading ? <BoardSkeleton /> : (
            <section className="ats-board" aria-label="Tablero de asistencias">
              <BoardLane tone="danger" title="Vencidas" rows={lanes.overdue} selectedId={selectedId} onOpen={openDetail} empty="Nada vencido. Así se mantiene." />
              <BoardLane tone="neutral" title="Sin iniciar" rows={lanes.pending} selectedId={selectedId} onOpen={openDetail} empty="No hay solicitudes esperando arranque." />
              <BoardLane tone="info" title="En curso" rows={lanes.progress} selectedId={selectedId} onOpen={openDetail} empty="Nada en ejecución con estos filtros." />
              <BoardLane tone="success" title="Resueltas" rows={lanes.done} selectedId={selectedId} onOpen={openDetail} empty="Aún no hay asistencias resueltas aquí." />
            </section>
          )
        )}

        {view === 'database' && (
          /* Base de datos: TODAS las variables de cada asistencia en una tabla plana, como un
             registro maestro — el tablero es la consulta operativa; esto es el archivo completo.
             Los mismos filtros y busqueda de arriba aplican tambien aqui. */
          <section className="ats-listwrap" aria-label="Base de datos de asistencias">
            <div className="ats-db-caption">
              <span>
                <strong>{visibleRows.length}</strong> asistencia{visibleRows.length === 1 ? '' : 's'}
                {activeFilterCount > 0 || filters.status || search ? ' con la búsqueda y los filtros actuales' : ' en total, sin filtrar'}
              </span>
              {canExport && (
                <button className="ats-btn" onClick={() => void exportCsv()} disabled={busy} title="Exporta exactamente lo que muestra esta vista: búsqueda y filtros incluidos">
                  <Download size={14} /> Exportar esta vista (CSV)
                </button>
              )}
            </div>
            <table className="ats-table is-db">
              <thead>
                <tr>
                  <th>Estado</th><th>Código</th><th>Asunto</th><th>Proceso</th><th>Módulo</th><th>Solicitante</th>
                  <th>Responsable</th><th>Prioridad</th><th>Solicitada</th><th>Compromiso</th>
                  <th>Avance</th><th>Cerrada</th><th>Solución / observaciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(row => (
                  <tr key={row.id} className={`is-lane-${laneOf(row)}${row.id === selectedId ? ' is-selected' : ''}`} onClick={() => void openDetail(row.id)}>
                    <td><SemaphoreTile row={row} /></td>
                    <td><strong className="ats-code">{row.code}</strong></td>
                    <td className="ats-cell-wide" title={row.description}>
                      <strong>{row.subject}</strong>
                      {row.description && <small>{row.description.length > 70 ? `${row.description.slice(0, 70)}…` : row.description}</small>}
                    </td>
                    <td>{row.process_name}</td>
                    <td>{row.module_name}</td>
                    <td>
                      <strong>{row.requester_name}</strong>
                      {row.requester_position && <small>{row.requester_position}</small>}
                    </td>
                    <td>{row.responsible_name || 'Sin asignar'}</td>
                    <td><PriorityBadge priority={row.priority} /></td>
                    <td className="ats-cell-date">{formatDate(row.received_at)}</td>
                    <td className="ats-cell-date">
                      {formatDate(row.commitment_at)}
                      {row.overdue && <small className="is-danger">{timeToCommitment(row.commitment_at)}</small>}
                      {row.due_soon && !row.overdue && <small className="is-warning">{timeToCommitment(row.commitment_at)}</small>}
                    </td>
                    <td><span className="ats-progress"><i style={{ width: `${row.completion_percent}%` }} /></span><b className="ats-pct">{row.completion_percent}%</b></td>
                    <td className="ats-cell-date">{row.closed_at ? formatDate(row.closed_at) : '—'}</td>
                    <td className="ats-cell-wide" title={row.final_solution || row.general_observations || ''}>
                      {(() => {
                        const text = row.final_solution || row.general_observations || ''
                        return text ? (text.length > 60 ? `${text.slice(0, 60)}…` : text) : '—'
                      })()}
                    </td>
                  </tr>
                ))}
                {!loading && !visibleRows.length && (
                  <tr><td colSpan={13}>
                    <div className="ats-empty"><ClipboardCheck size={28} /><h3>Sin resultados</h3><p>No hay asistencias para la búsqueda y los filtros actuales.</p></div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {view === 'balance' && (
          <section className="ats-balance" aria-label="Balance">
            <RankPanel icon={BarChart3} title="Asistencias por módulo ALMERA" caption="Carga y porcentaje promedio" rows={dashboard.byModule} />
            <RankPanel icon={Map} title="Asistencias por proceso" caption="Procesos con mayor demanda" rows={dashboard.byProcess} />
          </section>
        )}

        {view === 'catalogs' && (
          <section className="ats-balance" aria-label="Catálogos">
            <div className="ats-panel">
              <header className="ats-panel-head"><Map size={16} /><div><h2>Procesos institucionales</h2><p>{catalogs.processes.length} procesos activos</p></div></header>
              <div className="ats-cataloglist">
                {catalogs.processes.map(item => (
                  <div key={item.id}><span className="ats-code">{item.code}</span><strong>{item.name}</strong><em>{item.classification.replaceAll('_', ' ')}</em></div>
                ))}
              </div>
            </div>
            <div className="ats-panel">
              <header className="ats-panel-head"><Settings size={16} /><div><h2>Módulos ALMERA</h2><p>{catalogs.modules.length} opciones de asistencia</p></div></header>
              <div className="ats-cataloglist">
                {catalogs.modules.map(item => (
                  <div key={item.id}><span className="ats-code">{item.code}</span><strong>{item.name}</strong></div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Ficha emergente: el registro completo de una vez, para leer desde la Base de datos.
          "Gestionar en el panel" salta al inspector, donde viven las acciones. */}
      {detail && detailPresentation === 'ficha' && (
        <AssistanceFicha detail={detail} close={() => setDetail(null)} manage={() => setDetailPresentation('inspector')} />
      )}

      {/* ---- Capa 5: inspector contextual ---- */}
      {detail && detailPresentation === 'inspector' && (
        <Inspector
          detail={detail}
          tab={inspectorTab}
          setTab={setInspectorTab}
          close={() => setDetail(null)}
          loading={detailLoading}
          canEdit={canEdit}
          canClose={canClose}
          busy={busy}
          catalogs={catalogs}
          action={action} setAction={setAction}
          meta={meta} setMeta={setMeta}
          closeForm={closeForm} setCloseForm={setCloseForm}
          reopenText={reopenText} setReopenText={setReopenText}
          files={files} setFiles={setFiles}
          evidenceDescription={evidenceDescription} setEvidenceDescription={setEvidenceDescription}
          addAction={() => void run(() => almeraService.addAction(detail.assistance.id, action), 'Avance y comentario guardados')}
          saveMeta={() => void run(() => almeraService.update(detail.assistance.id, { ...meta, responsibleMembershipId: meta.responsibleMembershipId || null }), 'Datos de seguimiento actualizados')}
          uploadEvidence={() => files && void run(() => almeraService.uploadEvidence(detail.assistance.id, files, evidenceDescription), 'Evidencia adjuntada')}
          closeAssistance={() => void run(() => almeraService.close(detail.assistance.id, { solution: closeForm.solution, closedAt: closeForm.closedAt || null }), 'Asistencia cerrada al 100%')}
          reopen={() => void run(() => almeraService.reopen(detail.assistance.id, reopenText.trim()), 'Asistencia reabierta')}
        />
      )}

      {/* Modal SOLO para la creacion, que es la unica decision que amerita bloquear la vista. */}
      {showCreate && (
        <div className="ats-overlay" onClick={() => !busy && setShowCreate(false)}>
          <div className="ats-modal" role="dialog" aria-modal="true" aria-labelledby="ats-create-title" onClick={event => event.stopPropagation()}>
            <header className="ats-modal-head">
              <div><p className="ats-eyebrow">Registro rápido</p><h2 id="ats-create-title">Nueva asistencia técnica</h2></div>
              <button className="ats-x" aria-label="Cerrar" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </header>
            <form onSubmit={submitCreate} className="ats-form">
              <label className="span-2"><span>Asunto *</span><input required maxLength={180} value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} placeholder="Resumen breve de la solicitud" /></label>
              <label><span>Fecha de solicitud *</span><input required type="datetime-local" value={form.receivedAt} onChange={event => setForm({ ...form, receivedAt: event.target.value })} /></label>
              <label><span>Fecha compromiso *</span><input required type="datetime-local" min={form.receivedAt} value={form.commitmentAt} onChange={event => setForm({ ...form, commitmentAt: event.target.value })} /></label>
              <label><span>Proceso solicitante *</span><select required value={form.processId} onChange={event => setForm({ ...form, processId: event.target.value })}><option value="">Seleccionar proceso</option>{catalogs.processes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label><span>Módulo ALMERA *</span><select required value={form.almeraModuleId} onChange={event => setForm({ ...form, almeraModuleId: event.target.value })}><option value="">Seleccionar módulo</option>{catalogs.modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label><span>Responsable</span><select value={form.responsibleMembershipId} onChange={event => setForm({ ...form, responsibleMembershipId: event.target.value })}><option value="">Sin asignar</option>{catalogs.responsibles.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
              <label><span>Prioridad</span><select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>{(['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const).map(item => <option key={item} value={item}>{PRIORITY_LABELS[item]}</option>)}</select></label>
              <label className="span-2"><span>Persona solicitante</span><input value={form.requesterName} onChange={event => setForm({ ...form, requesterName: event.target.value })} placeholder="Por defecto, el usuario actual" /></label>
              <label className="span-2"><span>Descripción de la solicitud *</span><textarea required rows={4} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="¿Qué necesita el proceso?" /></label>
              <div className="ats-modal-actions span-2">
                <button type="button" className="ats-btn" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button className="ats-btn is-primary" disabled={busy}>{busy ? 'Registrando…' : 'Registrar asistencia'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notificaciones no bloqueantes. */}
      <div aria-live="polite" className="ats-toasts">
        {notice && <div className="ats-toast is-ok"><CheckCircle2 size={15} /> {notice}</div>}
        {error && <div className="ats-toast is-bad"><AlertTriangle size={15} /> {error} <button aria-label="Descartar" onClick={() => setError('')}><X size={13} /></button></div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MetricCard({ icon: Icon, label, value, sub, tone }: {
  icon: typeof ClipboardCheck; label: string; value: number; sub: string; tone?: 'danger' | 'warning' | 'success'
}) {
  return (
    <article className={`ats-metric${tone ? ` is-${tone}` : ''}`} title={sub}>
      <span className="ats-metric-ic"><Icon size={16} /></span>
      <div>
        <span className="ats-metric-label">{label}</span>
        <strong className="ats-metric-value">{value}</strong>
        <span className="ats-metric-sub">{sub}</span>
      </div>
    </article>
  )
}

function BoardLane({ tone, title, rows, selectedId, onOpen, empty }: {
  tone: 'danger' | 'neutral' | 'info' | 'success'; title: string; rows: Assistance[]
  selectedId: string | null; onOpen: (id: string) => Promise<void>; empty: string
}) {
  const [limit, setLimit] = useState(12)
  return (
    <section className={`ats-lane is-${tone}`} aria-label={`${title}: ${rows.length}`}>
      <header className="ats-lane-head">
        <i className="ats-lane-dot" aria-hidden="true" />
        <h2>{title}</h2>
        <b>{rows.length}</b>
      </header>
      <div className="ats-lane-list">
        {rows.slice(0, limit).map(row => <TicketCard key={row.id} row={row} selected={row.id === selectedId} onOpen={onOpen} />)}
        {!rows.length && <p className="ats-lane-empty">{empty}</p>}
        {rows.length > limit && (
          <button className="ats-lane-more" onClick={() => setLimit(current => current + 12)}>
            Ver {Math.min(12, rows.length - limit)} más ({rows.length - limit} restantes)
          </button>
        )}
      </div>
    </section>
  )
}

function TicketCard({ row, selected, onOpen }: { row: Assistance; selected: boolean; onOpen: (id: string) => Promise<void> }) {
  const done = row.effective_status === 'COMPLETADA' || row.effective_status === 'CANCELADA'
  return (
    <article
      className={`ats-ticket${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={() => void onOpen(row.id)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void onOpen(row.id) } }}
    >
      <div className="ats-ticket-top">
        <span className="ats-code">{row.code}</span>
        <PriorityBadge priority={row.priority} />
      </div>
      <h3 className="ats-ticket-title">{row.subject}</h3>
      <p className="ats-ticket-ctx">{row.process_name} · {row.module_name}</p>
      {!done && row.completion_percent > 0 && (
        <span className="ats-progress is-thin"><i style={{ width: `${row.completion_percent}%` }} /></span>
      )}
      <footer className="ats-ticket-foot">
        <time className={row.overdue ? 'is-danger' : row.due_soon ? 'is-warning' : ''}>
          {done ? formatDate(row.closed_at || row.received_at) : timeToCommitment(row.commitment_at)}
        </time>
        <span className="ats-avatar" title={row.responsible_name || 'Sin asignar'}>{initials(row.responsible_name)}</span>
      </footer>
    </article>
  )
}

function BoardSkeleton() {
  return (
    <section className="ats-board" aria-hidden="true">
      {[0, 1, 2, 3].map(lane => (
        <div className="ats-lane" key={lane}>
          <header className="ats-lane-head"><i className="ats-lane-dot" /><span className="ats-skel" style={{ width: 90, height: 14 }} /></header>
          <div className="ats-lane-list">
            {[0, 1, 2].map(card => (
              <div className="ats-ticket" key={card}>
                <span className="ats-skel" style={{ width: '45%', height: 11 }} />
                <span className="ats-skel" style={{ width: '92%', height: 13, marginTop: 9 }} />
                <span className="ats-skel" style={{ width: '70%', height: 11, marginTop: 7 }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/** Semaforo de la Base de datos: un recuadro de vidrio teñido por el estado OPERATIVO (vencida
 *  manda sobre el estado nominal), con la etiqueta y el dato de tiempo que explica el color.
 *  Es color de FLUJO, no el semaforo de cumplimiento del sistema (§5.1): aqui no hay porcentaje
 *  que medir, hay una solicitud en un punto de su ciclo. */
function SemaphoreTile({ row }: { row: Assistance }) {
  const lane = laneOf(row)
  const tone = lane === 'overdue' ? 'danger' : lane === 'progress' ? 'info' : lane === 'done' ? (row.effective_status === 'CANCELADA' ? 'neutral' : 'success') : 'warning'
  const sub = lane === 'done'
    ? (row.closed_at ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(row.closed_at)) : 'Cerrada')
    : timeToCommitment(row.commitment_at)
  return (
    <span className={`ats-sem is-${tone}`}>
      <i aria-hidden="true" />
      <span className="ats-sem-tx">
        <b>{STATUS_LABELS[row.effective_status]}</b>
        <small>{sub}</small>
      </span>
    </span>
  )
}

function StatusBadge({ row }: { row: Assistance }) {
  const status = row.effective_status
  const cls = status === 'COMPLETADA' ? 'is-success' : status === 'VENCIDA' ? 'is-danger' : status === 'EN_CURSO' ? 'is-info' : status === 'CANCELADA' ? 'is-neutral' : 'is-warning'
  return <span className={`ats-badge ${cls}`}><i aria-hidden="true" />{STATUS_LABELS[status]}</span>
}

function PriorityBadge({ priority }: { priority: Assistance['priority'] }) {
  const cls = priority === 'CRITICA' ? 'is-danger' : priority === 'ALTA' ? 'is-warning' : priority === 'MEDIA' ? 'is-info' : 'is-neutral'
  return <span className={`ats-badge is-mini ${cls}`}>{PRIORITY_LABELS[priority]}</span>
}

function RankPanel({ icon: Icon, title, caption, rows }: {
  icon: typeof BarChart3; title: string; caption: string
  rows: { id: string; name: string; total: number; average_completion: string }[]
}) {
  const max = Math.max(1, ...rows.map(row => row.total))
  return (
    <div className="ats-panel">
      <header className="ats-panel-head"><Icon size={16} /><div><h2>{title}</h2><p>{caption}</p></div></header>
      <div className="ats-ranklist">
        {rows.slice(0, 19).map(row => (
          <article key={row.id}>
            <header><span>{row.name}</span><strong>{row.total}</strong></header>
            <div className="ats-progress"><i style={{ width: `${row.total / max * 100}%` }} /></div>
            <small>{row.average_completion}% de avance promedio</small>
          </article>
        ))}
        {!rows.length && <div className="ats-empty"><BarChart3 size={26} /><p>No hay datos para consolidar.</p></div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ficha emergente: TODO el registro de una vez, en lectura. Desde la Base de datos un registro
// se consulta como una ficha, no como un panel de trabajo; la gestion (avances, cierre,
// evidencias) sigue viviendo en el inspector, al que se salta con un boton.

function AssistanceFicha({ detail, close, manage }: { detail: AssistanceDetail; close: () => void; manage: () => void }) {
  const item = detail.assistance
  const completed = item.effective_status === 'COMPLETADA'
  return (
    <div className="ats-overlay" onClick={close}>
      <div className="ats-modal is-ficha" role="dialog" aria-modal="true" aria-label={`Ficha de ${item.code}`} onClick={event => event.stopPropagation()}>
        <header className="ats-modal-head">
          <div className="ats-insp-id">
            <span className="ats-code is-lg">{item.code}</span>
            <PriorityBadge priority={item.priority} />
            <SemaphoreTile row={item} />
          </div>
          <button className="ats-x" aria-label="Cerrar ficha" onClick={close}><X size={16} /></button>
        </header>
        <h2 className="ats-ficha-title">{item.subject}</h2>
        <p className="ats-insp-ctx">{item.process_name} · {item.module_name}</p>

        <div className="ats-ficha-grid">
          <section className="ats-ficha-main">
            <div className="ats-insp-section">
              <h3>Solicitud original</h3>
              <p className="ats-insp-desc">{item.description}</p>
              <dl className="ats-dl">
                <div><dt>Proceso</dt><dd>{item.process_name}</dd></div>
                <div><dt>Módulo</dt><dd>{item.module_name}</dd></div>
                <div><dt>Solicitada</dt><dd>{formatDate(item.received_at)}</dd></div>
                <div><dt>Compromiso</dt><dd>{formatDate(item.commitment_at)}</dd></div>
                <div><dt>Solicitante</dt><dd>{item.requester_name}{item.requester_position ? ` · ${item.requester_position}` : ''}</dd></div>
                <div><dt>Responsable</dt><dd>{item.responsible_name || 'Sin asignar'}</dd></div>
                {item.requester_contact && <div><dt>Contacto</dt><dd>{item.requester_contact}</dd></div>}
                {item.requester_channel && <div><dt>Canal</dt><dd>{item.requester_channel}</dd></div>}
                <div><dt>Avance</dt><dd>{item.completion_percent}%</dd></div>
                <div><dt>Cerrada</dt><dd>{item.closed_at ? formatDate(item.closed_at) : '—'}</dd></div>
                {item.general_observations && <div className="span-2"><dt>Observaciones generales</dt><dd>{item.general_observations}</dd></div>}
              </dl>
              {completed && item.final_solution && (
                <div className="ats-insp-done">
                  <CheckCircle2 size={15} />
                  <div><strong>Solución final</strong><p>{item.final_solution}</p><small>Cerrada: {formatDate(item.closed_at)}</small></div>
                </div>
              )}
            </div>

            <div className="ats-insp-section">
              <h3><History size={14} /> Bitácora ({detail.actions.length})</h3>
              <div className="ats-timeline">
                {detail.actions.map(entry => (
                  <div className="ats-tl-item" key={entry.id}>
                    <i aria-hidden="true" />
                    <div>
                      <header><strong>{entry.performed_by}</strong><time>{formatDate(entry.performed_at)}</time></header>
                      <p>{entry.description}</p>
                      {entry.result && <small>Resultado: {entry.result}</small>}
                      {entry.completion_percent != null && <span className="ats-badge is-mini is-info">Avance {entry.completion_percent}%</span>}
                    </div>
                  </div>
                ))}
                {!detail.actions.length && <p className="ats-muted">Aún no se han registrado actuaciones.</p>}
              </div>
            </div>
          </section>

          <aside className="ats-ficha-side">
            <div className="ats-insp-section">
              <h3><Paperclip size={14} /> Evidencias ({detail.evidences.length})</h3>
              <div className="ats-evidences">
                {detail.evidences.map(file => (
                  <a key={file.id} href={`/api/almera/assistances/${item.id}/evidences/${file.id}/download`}>
                    <FileText size={15} />
                    <span><strong>{file.original_name}</strong><small>{formatBytes(file.size_bytes)} · {file.uploaded_by}</small></span>
                    <Download size={13} />
                  </a>
                ))}
                {!detail.evidences.length && <p className="ats-muted">Sin evidencias adjuntas.</p>}
              </div>
            </div>
            {detail.history.length > 0 && (
              <div className="ats-insp-section">
                <h3><Timer size={14} /> Historial ({detail.history.length})</h3>
                <div className="ats-timeline is-compact">
                  {detail.history.map(entry => (
                    <div className="ats-tl-item" key={entry.id}>
                      <i aria-hidden="true" />
                      <div>
                        <header><strong>{entry.actor_name}</strong><time>{formatDate(entry.created_at)}</time></header>
                        <p>{entry.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className="ats-modal-actions">
          <button className="ats-btn" onClick={close}>Cerrar</button>
          <button className="ats-btn is-primary" onClick={manage}><PencilLine size={14} /> Gestionar en el panel</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inspector lateral: el detalle completo sin abandonar el tablero.

interface InspectorProps {
  detail: AssistanceDetail; tab: InspectorTab; setTab: (tab: InspectorTab) => void; close: () => void
  loading: boolean; canEdit: boolean; canClose: boolean; busy: boolean; catalogs: AlmeraCatalogs
  action: { description: string; result: string; completionPercent: number }
  setAction: React.Dispatch<React.SetStateAction<{ description: string; result: string; completionPercent: number }>>
  meta: { commitmentAt: string; responsibleMembershipId: string; observations: string }
  setMeta: React.Dispatch<React.SetStateAction<{ commitmentAt: string; responsibleMembershipId: string; observations: string }>>
  closeForm: { solution: string; closedAt: string }
  setCloseForm: React.Dispatch<React.SetStateAction<{ solution: string; closedAt: string }>>
  reopenText: string; setReopenText: (value: string) => void
  files: FileList | null; setFiles: (files: FileList | null) => void
  evidenceDescription: string; setEvidenceDescription: (value: string) => void
  addAction: () => void; saveMeta: () => void; uploadEvidence: () => void; closeAssistance: () => void; reopen: () => void
}

function Inspector(props: InspectorProps) {
  const { detail, tab, setTab, close, loading, canEdit, canClose, busy, catalogs } = props
  const item = detail.assistance
  const completed = item.effective_status === 'COMPLETADA'
  const tabs: [InspectorTab, string, typeof History][] = [
    ['resumen', 'Resumen', FileText],
    ['actividad', 'Actividad', History],
    ['evidencias', `Evidencias (${detail.evidences.length})`, Paperclip],
    ['gestion', 'Gestión', PencilLine],
  ]
  return (
    <>
      {/* Backdrop solo visible en pantallas angostas, donde el inspector flota encima. */}
      <button className="ats-inspector-backdrop" aria-label="Cerrar detalle" onClick={close} />
      <aside className="ats-inspector" aria-label={`Detalle de ${item.code}`}>
        <header className="ats-insp-head">
          <div className="ats-insp-id">
            <span className="ats-code is-lg">{item.code}</span>
            <PriorityBadge priority={item.priority} />
            <StatusBadge row={item} />
          </div>
          <button className="ats-x" aria-label="Cerrar detalle" onClick={close}><X size={16} /></button>
        </header>
        <h2 className="ats-insp-title">{item.subject}</h2>
        <p className="ats-insp-ctx">{item.process_name} · {item.module_name}</p>

        <div className="ats-insp-sla">
          <div>
            <span>Compromiso</span>
            <strong className={item.overdue ? 'is-danger' : item.due_soon ? 'is-warning' : ''}>{timeToCommitment(item.commitment_at)}</strong>
            <small>{formatDate(item.commitment_at)}</small>
          </div>
          <div>
            <span>Avance</span>
            <strong>{item.completion_percent}%</strong>
            <span className="ats-progress is-thin"><i style={{ width: `${item.completion_percent}%` }} /></span>
          </div>
          <div>
            <span>Responsable</span>
            <strong className="ats-insp-owner"><span className="ats-avatar">{initials(item.responsible_name)}</span>{item.responsible_name || 'Sin asignar'}</strong>
          </div>
        </div>

        <nav className="ats-insp-tabs" role="tablist">
          {tabs.map(([key, label, Icon]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </nav>

        <div className="ats-insp-body">
          {loading && <div className="ats-insp-loading"><Loader2 className="animate-spin" size={18} /></div>}

          {tab === 'resumen' && (
            <div className="ats-insp-section">
              <h3>Solicitud original</h3>
              <p className="ats-insp-desc">{item.description}</p>
              <dl className="ats-dl">
                <div><dt>Proceso</dt><dd>{item.process_name}</dd></div>
                <div><dt>Módulo</dt><dd>{item.module_name}</dd></div>
                <div><dt>Solicitada</dt><dd>{formatDate(item.received_at)}</dd></div>
                <div><dt>Solicitante</dt><dd>{item.requester_name}</dd></div>
                {item.general_observations && <div className="span-2"><dt>Observaciones</dt><dd>{item.general_observations}</dd></div>}
              </dl>
              {completed && (
                <div className="ats-insp-done">
                  <CheckCircle2 size={15} />
                  <div><strong>Completada</strong><p>{item.final_solution}</p><small>Cerrada: {formatDate(item.closed_at)}</small></div>
                </div>
              )}
            </div>
          )}

          {tab === 'actividad' && (
            <div className="ats-insp-section">
              {canEdit && !completed && (
                <div className="ats-insp-form">
                  <h3><Send size={14} /> Registrar avance</h3>
                  <textarea rows={3} value={props.action.description} onChange={event => props.setAction({ ...props.action, description: event.target.value })} placeholder="¿Qué se hizo? Queda en la bitácora." />
                  <div className="ats-range">
                    <label>Avance <b>{props.action.completionPercent}%</b>
                      <input type="range" min={0} max={99} value={props.action.completionPercent} onChange={event => props.setAction({ ...props.action, completionPercent: Number(event.target.value) })} />
                    </label>
                  </div>
                  <input value={props.action.result} onChange={event => props.setAction({ ...props.action, result: event.target.value })} placeholder="Resultado (opcional)" />
                  <button className="ats-btn is-primary" onClick={props.addAction} disabled={busy || !props.action.description.trim()}>
                    {busy ? 'Guardando…' : 'Guardar en bitácora'}
                  </button>
                </div>
              )}
              <h3><History size={14} /> Bitácora</h3>
              <div className="ats-timeline">
                {detail.actions.map(entry => (
                  <div className="ats-tl-item" key={entry.id}>
                    <i aria-hidden="true" />
                    <div>
                      <header><strong>{entry.performed_by}</strong><time>{formatDate(entry.performed_at)}</time></header>
                      <p>{entry.description}</p>
                      {entry.result && <small>Resultado: {entry.result}</small>}
                      {entry.completion_percent != null && <span className="ats-badge is-mini is-info">Avance {entry.completion_percent}%</span>}
                    </div>
                  </div>
                ))}
                {!detail.actions.length && <p className="ats-muted">Aún no se han registrado actuaciones.</p>}
              </div>
            </div>
          )}

          {tab === 'evidencias' && (
            <div className="ats-insp-section">
              {canEdit && !completed && (
                <div className="ats-insp-form">
                  <h3><Upload size={14} /> Adjuntar evidencia</h3>
                  <input value={props.evidenceDescription} onChange={event => props.setEvidenceDescription(event.target.value)} placeholder="Descripción opcional" />
                  <label className="ats-file">
                    <Paperclip size={15} />
                    <span>{props.files?.length ? `${props.files.length} archivo(s) seleccionado(s)` : 'PDF, imágenes, Word, Excel, CSV o texto'}</span>
                    <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt" onChange={event => props.setFiles(event.target.files)} />
                  </label>
                  <button className="ats-btn" disabled={busy || !props.files?.length} onClick={props.uploadEvidence}>
                    {busy ? 'Adjuntando…' : 'Adjuntar evidencia'}
                  </button>
                </div>
              )}
              <div className="ats-evidences">
                {detail.evidences.map(file => (
                  <a key={file.id} href={`/api/almera/assistances/${item.id}/evidences/${file.id}/download`}>
                    <FileText size={15} />
                    <span><strong>{file.original_name}</strong><small>{formatBytes(file.size_bytes)} · {file.uploaded_by}</small></span>
                    <Download size={13} />
                  </a>
                ))}
                {!detail.evidences.length && <p className="ats-muted">Sin evidencias adjuntas todavía.</p>}
              </div>
            </div>
          )}

          {tab === 'gestion' && (
            <div className="ats-insp-section">
              {!canEdit && !canClose && <p className="ats-muted">Tu rol no tiene permisos de gestión sobre esta asistencia; puedes consultarla pero no modificarla.</p>}
              {canEdit && !completed && (
                <div className="ats-insp-form">
                  <h3><CalendarClock size={14} /> Seguimiento</h3>
                  <label className="ats-lbl"><span>Fecha compromiso</span><input type="datetime-local" value={props.meta.commitmentAt} onChange={event => props.setMeta({ ...props.meta, commitmentAt: event.target.value })} /></label>
                  <label className="ats-lbl"><span>Responsable</span>
                    <select value={props.meta.responsibleMembershipId} onChange={event => props.setMeta({ ...props.meta, responsibleMembershipId: event.target.value })}>
                      <option value="">Sin asignar</option>
                      {catalogs.responsibles.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                    </select>
                  </label>
                  <label className="ats-lbl"><span>Observaciones generales</span><textarea rows={2} value={props.meta.observations} onChange={event => props.setMeta({ ...props.meta, observations: event.target.value })} /></label>
                  <button className="ats-btn" onClick={props.saveMeta} disabled={busy}>{busy ? 'Guardando…' : 'Actualizar seguimiento'}</button>
                </div>
              )}
              {canClose && !completed && (
                <div className="ats-insp-form is-closing">
                  <h3><CheckCircle2 size={14} /> Cierre manual</h3>
                  <label className="ats-lbl"><span>Descripción final de lo realizado</span><textarea rows={3} value={props.closeForm.solution} onChange={event => props.setCloseForm({ ...props.closeForm, solution: event.target.value })} /></label>
                  <label className="ats-lbl"><span>Fecha real de cierre</span><input type="datetime-local" value={props.closeForm.closedAt} onChange={event => props.setCloseForm({ ...props.closeForm, closedAt: event.target.value })} /></label>
                  <button className="ats-btn is-primary" disabled={busy || !props.closeForm.solution.trim()} onClick={props.closeAssistance} title={!props.closeForm.solution.trim() ? 'Describe primero lo realizado' : undefined}>
                    {busy ? 'Cerrando…' : 'Marcar completada al 100%'}
                  </button>
                </div>
              )}
              {canClose && completed && (
                <div className="ats-insp-form">
                  <h3><RotateCcw size={14} /> Reabrir</h3>
                  <p className="ats-muted">Reabrir exige una justificación; queda registrada en el historial.</p>
                  <textarea rows={2} value={props.reopenText} onChange={event => props.setReopenText(event.target.value)} placeholder="Justificación para reabrir" />
                  <button className="ats-btn" disabled={busy || !props.reopenText.trim()} onClick={props.reopen} title={!props.reopenText.trim() ? 'Escribe la justificación primero' : undefined}>
                    {busy ? 'Reabriendo…' : 'Reabrir con justificación'}
                  </button>
                </div>
              )}
              {detail.history.length > 0 && (
                <>
                  <h3><Timer size={14} /> Historial de cambios</h3>
                  <div className="ats-timeline is-compact">
                    {detail.history.map(entry => (
                      <div className="ats-tl-item" key={entry.id}>
                        <i aria-hidden="true" />
                        <div>
                          <header><strong>{entry.actor_name}</strong><time>{formatDate(entry.created_at)}</time></header>
                          <p>{entry.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
