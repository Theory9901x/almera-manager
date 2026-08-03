import { useEffect, useMemo, useState } from 'react'
import {
  Ban, ChevronLeft, ChevronRight, Eye, FilePlus2, FileText, Inbox, PackageOpen, Paperclip, Search, Send, X,
} from 'lucide-react'
import {
  Badge, Button, Card, DatePicker, DonutChart, EmptyState, Field, Input, ModuleHero, Select, StatCard,
  ToastProvider, moduleIdentity, useToast,
} from '@/design-system'
import { NewRadicadoDialog } from '../components/NewRadicadoDialog'
import { RadicadoDetailDialog } from '../components/RadicadoDetailDialog'
import { radicadosService } from '../services/radicadosService'
import type {
  CreateRadicadoInput, RadicadoCatalogos, RadicadoDetail, RadicadoFilters, RadicadoListPage, RadicadosDashboard,
} from '../types'

const identity = moduleIdentity('radicados')

const QUICK_FILTERS: { key: string; label: string; patch: RadicadoFilters }[] = [
  { key: 'TODOS', label: 'Todos', patch: {} },
  { key: 'INTERNOS', label: 'Internos', patch: { tipoId: undefined } },
  { key: 'RECIBIDOS', label: 'Recibidos', patch: { direccion: 'RECIBIDO' } },
  { key: 'ENVIADOS', label: 'Enviados', patch: { direccion: 'ENVIADO' } },
  { key: 'ANULADOS', label: 'Anulados', patch: { estado: 'ANULADO' } },
]

export function RadicadosDashboardPage(props: { canCreate: boolean; canVoid: boolean }) {
  return <ToastProvider><RadicadosDashboardContent {...props} /></ToastProvider>
}

function RadicadosDashboardContent({ canCreate, canVoid }: { canCreate: boolean; canVoid: boolean }) {
  const toast = useToast()
  const [catalogos, setCatalogos] = useState<RadicadoCatalogos | null>(null)
  const [dashboard, setDashboard] = useState<RadicadosDashboard | null>(null)
  const [filters, setFilters] = useState<RadicadoFilters>({})
  const [searchDraft, setSearchDraft] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<RadicadoListPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [activeQuickFilter, setActiveQuickFilter] = useState('TODOS')
  const [selected, setSelected] = useState<RadicadoDetail | null>(null)

  useEffect(() => {
    radicadosService.catalogos().then(setCatalogos).catch(() => setCatalogos(null))
    loadDashboard()
  }, [])

  function loadDashboard() {
    radicadosService.dashboard().then(setDashboard).catch(() => setDashboard(null))
  }

  function load() {
    setLoading(true)
    radicadosService.list({ ...filters, page: String(page), pageSize: '25' })
      .then(setData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar los radicados'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [filters, page])

  const set = (patch: Partial<RadicadoFilters>) => { setPage(1); setFilters(current => ({ ...current, ...patch })) }

  function applyQuickFilter(key: string) {
    setActiveQuickFilter(key)
    setPage(1)
    const found = QUICK_FILTERS.find(item => item.key === key)
    if (key === 'INTERNOS') {
      const internoId = catalogos?.tipos.find(t => t.codigo === 'INT')?.id
      setFilters({ tipoId: internoId })
      return
    }
    setFilters(found?.patch || {})
  }

  const chips = useMemo(() => {
    const out: { key: keyof RadicadoFilters; label: string }[] = []
    if (filters.categoriaId) out.push({ key: 'categoriaId', label: `Categoría: ${catalogos?.categorias.find(c => c.id === filters.categoriaId)?.nombre || ''}` })
    if (filters.medioId) out.push({ key: 'medioId', label: `Medio: ${catalogos?.medios.find(m => m.id === filters.medioId)?.nombre || ''}` })
    if (filters.processId) out.push({ key: 'processId', label: `Proceso: ${catalogos?.procesos.find(p => p.id === filters.processId)?.name || ''}` })
    if (filters.dateFrom) out.push({ key: 'dateFrom', label: `Desde ${filters.dateFrom}` })
    if (filters.dateTo) out.push({ key: 'dateTo', label: `Hasta ${filters.dateTo}` })
    if (filters.search) out.push({ key: 'search', label: `Buscar: ${filters.search}` })
    return out
  }, [filters, catalogos])

  function clearAll() {
    setSearchDraft(''); setActiveQuickFilter('TODOS'); setPage(1); setFilters({})
  }

  async function createRadicado(input: CreateRadicadoInput) {
    setCreating(true)
    try {
      const created = await radicadosService.create(input)
      toast.push('success', `Radicado ${created.numero_radicado} generado`)
      setShowNew(false)
      load()
      loadDashboard()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el radicado') }
    finally { setCreating(false) }
  }

  async function openDetail(id: string) {
    try { setSelected(await radicadosService.detail(id)) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible abrir el radicado') }
  }

  function onDetailChanged() {
    if (selected) radicadosService.detail(selected.id).then(setSelected).catch(() => {})
    load()
    loadDashboard()
  }

  const mixTotal = dashboard?.mix.total || 0

  return (
    <div className="page-with-identity" style={{ ['--ds-accent' as string]: identity.color }}>
      <NewRadicadoDialog open={showNew} catalogos={catalogos} busy={creating} onCancel={() => setShowNew(false)} onCreate={createRadicado} />
      <RadicadoDetailDialog radicado={selected} canVoid={canVoid} onClose={() => setSelected(null)} onChanged={onDetailChanged} />

      <ModuleHero
        badge="Radicados"
        title="Correspondencia y radicación"
        subtitle="Consecutivo atómico por tipo y año, con trazabilidad completa de cada número"
        accent={identity.color}
        actions={canCreate ? <Button identity={identity} onClick={() => setShowNew(true)}><FilePlus2 size={16} /> Nuevo radicado</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 mt-5">
        <StatCard icon={Inbox} label="Radicados hoy" value={dashboard?.kpis.hoy ?? '—'} identity={identity} />
        <StatCard icon={Send} label="Recibidos hoy" value={dashboard?.kpis.recibidos_hoy ?? '—'} identity={identity} />
        <StatCard icon={FileText} label="Enviados hoy" value={dashboard?.kpis.enviados_hoy ?? '—'} identity={identity} />
        <StatCard icon={PackageOpen} label="Total este mes" value={dashboard?.kpis.mes ?? '—'} identity={identity} />
        <StatCard icon={Ban} label="Anulados este mes" value={dashboard?.kpis.anulados_mes ?? '—'} identity={identity} />
        <StatCard icon={Paperclip} label="Sin adjunto" value={dashboard?.kpis.pendientes_adjunto ?? '—'} detail="Radicados activos" identity={identity} />
      </div>

      {/* minmax(0,1fr) y no 1fr a secas: sin el minmax, la pista no baja de su min-content (la
          tabla de filtros con varias columnas), y empuja la barra lateral fuera del contenedor
          recortado por overflow-x:hidden mas arriba en el layout — se ve como si el riel
          derecho se "cortara", cuando en realidad la columna izquierda no se esta encogiendo. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] mt-5 items-start">
        <div className="space-y-4">
          <Card accent={identity.color} className="p-5">
            <div className="dc-filters-head">
              <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                <span><Search size={19} /></span>
                <div><h2>Consulta de radicados</h2><p>Filtros combinables sobre toda la base</p></div>
              </div>
              <Button variant="secondary" onClick={clearAll} disabled={!chips.length && activeQuickFilter === 'TODOS'}><X size={15} /> Limpiar</Button>
            </div>

            <div className="dc-chips" style={{ marginBottom: 12 }}>
              {QUICK_FILTERS.map(item => (
                <button key={item.key} className={`dc-chip ${activeQuickFilter === item.key ? 'is-active' : ''}`} onClick={() => applyQuickFilter(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="dc-filters">
              <Field label="Buscar" hint="Número, objeto, remitente o destinatario">
                <Input
                  value={searchDraft} placeholder="Ej. 2026-INT-000001"
                  onChange={event => setSearchDraft(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') set({ search: searchDraft.trim() || undefined }) }}
                  onBlur={() => set({ search: searchDraft.trim() || undefined })}
                />
              </Field>
              <Field label="Categoría">
                <Select
                  value={filters.categoriaId || 'ALL'}
                  onChange={value => set({ categoriaId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todas' }, ...(catalogos?.categorias || []).map(c => ({ value: c.id, label: c.nombre }))]}
                />
              </Field>
              <Field label="Medio">
                <Select
                  value={filters.medioId || 'ALL'}
                  onChange={value => set({ medioId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todos' }, ...(catalogos?.medios || []).map(m => ({ value: m.id, label: m.nombre }))]}
                />
              </Field>
              <Field label="Proceso">
                <Select
                  value={filters.processId || 'ALL'}
                  onChange={value => set({ processId: value === 'ALL' ? undefined : value })}
                  options={[{ value: 'ALL', label: 'Todos' }, ...(catalogos?.procesos || []).map(p => ({ value: p.id, label: p.name }))]}
                />
              </Field>
              <Field label="Desde"><DatePicker value={filters.dateFrom || ''} onChange={value => set({ dateFrom: value || undefined })} /></Field>
              <Field label="Hasta"><DatePicker value={filters.dateTo || ''} onChange={value => set({ dateTo: value || undefined })} /></Field>
            </div>

            {chips.length > 0 && (
              <div className="dc-chips" style={{ marginTop: 10 }}>
                {chips.map(chip => (
                  <button key={chip.key} className="dc-chip" onClick={() => set({ [chip.key]: undefined })}>{chip.label} <X size={13} /></button>
                ))}
              </div>
            )}
          </Card>

          <Card accent={identity.color} className="overflow-hidden">
            <div className="table-toolbar">
              <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                <span><Inbox size={19} /></span>
                <div><h2>Resultados</h2><p>{data ? `${data.total} radicado${data.total === 1 ? '' : 's'}` : '…'}</p></div>
              </div>
            </div>

            {!loading && data && data.rows.length === 0 && (
              <div className="p-5">
                <EmptyState icon={Inbox} title="Ningún radicado con estos filtros" description="Prueba a ampliar el rango de fechas o a quitar algún filtro." />
              </div>
            )}

            {!loading && data && data.rows.length > 0 && (
              <>
                <div className="ds-table-wrap">
                  <table className="ds-table">
                    <thead>
                      <tr>
                        <th>Número</th><th>Tipo</th><th>Categoría</th><th>Objeto / asunto</th>
                        <th>Remitente</th><th>Destinatario</th><th>Fecha</th><th>Estado</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map(row => (
                        <tr key={row.id} style={row.estado === 'ANULADO' ? { opacity: 0.6 } : undefined}>
                          <td className="tabular-col"><strong>{row.numero_radicado}</strong></td>
                          <td>{row.tipo_nombre}{row.direccion ? <small className="repo-code">{row.direccion === 'RECIBIDO' ? 'Recibido' : 'Enviado'}</small> : null}</td>
                          <td>{row.categoria_nombre}</td>
                          <td title={row.objeto}>{row.objeto.length > 48 ? `${row.objeto.slice(0, 48)}…` : row.objeto}</td>
                          <td>{row.remitente || '—'}</td>
                          <td>{row.destinatario || '—'}</td>
                          <td className="tabular-col">{new Date(row.fecha_radicado).toLocaleDateString('es-CO')}</td>
                          <td><Badge tone={row.estado === 'ANULADO' ? 'danger' : 'success'}>{row.estado === 'ANULADO' ? 'Anulado' : 'Activo'}</Badge></td>
                          <td>
                            <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} title="Ver el detalle completo" onClick={() => void openDetail(row.id)}>
                              <Eye size={13} /> Ver
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="repo-pager">
                  <span>Página {data.page} de {data.pages} · {data.total} en total</span>
                  <div className="repo-pager-actions">
                    <button className="row-action" disabled={data.page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={15} /> Anterior</button>
                    <button className="row-action" disabled={data.page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente <ChevronRight size={15} /></button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {canCreate && (
            <Card accent={identity.color} className="p-5 text-center">
              <FilePlus2 size={26} style={{ color: identity.color }} />
              <h3 style={{ marginTop: 8 }}>Nueva radicación</h3>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Genera el siguiente número disponible</p>
              <Button identity={identity} className="w-full mt-3" onClick={() => setShowNew(true)}>Radicar ahora</Button>
            </Card>
          )}

          <Card accent={identity.color} className="p-5">
            <h3 style={{ marginBottom: 12 }}>Radicados del mes</h3>
            {mixTotal > 0 ? (
              <DonutChart
                centerLabel="este mes"
                data={[
                  { label: 'Recibidos', value: dashboard?.mix.recibidos || 0, color: '#0EA5E9' },
                  { label: 'Enviados', value: dashboard?.mix.enviados || 0, color: identity.color },
                  { label: 'Internos', value: dashboard?.mix.internos || 0, color: '#94A3B8' },
                ]}
              />
            ) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aún no hay radicados este mes.</p>}
          </Card>

          <Card accent={identity.color} className="p-5">
            <h3 style={{ marginBottom: 8 }}>Últimos anulados</h3>
            {dashboard?.recentVoided.length ? dashboard.recentVoided.map(item => (
              <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-hairline)' }}>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{item.numero_radicado}</strong>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 0' }}>{item.motivo}</p>
              </div>
            )) : <p style={{ color: 'var(--muted)', fontSize: 13 }}>Ningún radicado anulado.</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
