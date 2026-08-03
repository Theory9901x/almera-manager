import { useEffect, useMemo, useState } from 'react'
import {
  Ban, BarChart3, ChevronLeft, ChevronRight, Database, Eye, FileDown, FilePlus2, FileText, Inbox, LayoutDashboard,
  PackageOpen, Paperclip, Search, Send, X,
} from 'lucide-react'
import {
  BarChart, Badge, Button, Card, DatePicker, DonutChart, EmptyState, Field, Input, ModuleHero, Select, StatCard,
  ToastProvider, moduleIdentity, useToast,
} from '@/design-system'
import { NewRadicadoDialog } from '../components/NewRadicadoDialog'
import { RadicadoDetailDialog } from '../components/RadicadoDetailDialog'
import { radicadosService } from '../services/radicadosService'
import type {
  CreateRadicadoInput, RadicadoCatalogos, RadicadoDetail, RadicadoFilters, RadicadoListPage, RadicadosAnalytics,
  RadicadosDashboard,
} from '../types'

const identity = moduleIdentity('radicados')

const QUICK_FILTERS: { key: string; label: string; patch: RadicadoFilters }[] = [
  { key: 'TODOS', label: 'Todos', patch: {} },
  { key: 'INTERNOS', label: 'Internos', patch: { tipoId: undefined } },
  { key: 'RECIBIDOS', label: 'Recibidos', patch: { direccion: 'RECIBIDO' } },
  { key: 'ENVIADOS', label: 'Enviados', patch: { direccion: 'ENVIADO' } },
  { key: 'ANULADOS', label: 'Anulados', patch: { estado: 'ANULADO' } },
]

type Section = 'resumen' | 'base-datos' | 'consulta' | 'estadisticas'

export function RadicadosDashboardPage(props: { canCreate: boolean; canVoid: boolean; isSuperadmin: boolean }) {
  return <ToastProvider><RadicadosDashboardContent {...props} /></ToastProvider>
}

function RadicadosDashboardContent({ canCreate, canVoid, isSuperadmin }: { canCreate: boolean; canVoid: boolean; isSuperadmin: boolean }) {
  const toast = useToast()
  const [section, setSection] = useState<Section>('resumen')
  const [catalogos, setCatalogos] = useState<RadicadoCatalogos | null>(null)
  const [dashboard, setDashboard] = useState<RadicadosDashboard | null>(null)
  const [analytics, setAnalytics] = useState<RadicadosAnalytics | null>(null)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<RadicadoDetail | null>(null)

  // Base de datos: SIN filtros y sin nada mas — el listado completo, tal cual, con todas las
  // columnas de trazabilidad. Es un espacio propio a proposito: mezclarlo con la consulta hacia
  // imposible ver "todo lo que hay" sin que un filtro puesto antes lo recortara en silencio.
  // "Ver eliminados" es la unica excepcion, y solo para superadmin: sin ella, un eliminado no
  // tendria forma de auditarse de nuevo aunque siga completo en la base.
  const [dbPage, setDbPage] = useState(1)
  const [dbData, setDbData] = useState<RadicadoListPage | null>(null)
  const [dbLoading, setDbLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)

  // Consulta: filtros combinables, aparte de la base de datos completa.
  const [filters, setFilters] = useState<RadicadoFilters>({})
  const [searchDraft, setSearchDraft] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<RadicadoListPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeQuickFilter, setActiveQuickFilter] = useState('TODOS')

  useEffect(() => {
    radicadosService.catalogos().then(setCatalogos).catch(() => setCatalogos(null))
    loadDashboard()
  }, [])

  function loadDashboard() {
    radicadosService.dashboard().then(setDashboard).catch(() => setDashboard(null))
  }

  function loadDb() {
    setDbLoading(true)
    radicadosService.list({ page: String(dbPage), pageSize: '50', includeDeleted: showDeleted ? 'true' : undefined })
      .then(setDbData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar la base de datos'))
      .finally(() => setDbLoading(false))
  }
  useEffect(() => { if (section === 'base-datos') loadDb() }, [section, dbPage, showDeleted])

  function loadAnalytics() {
    radicadosService.analytics().then(setAnalytics).catch(() => setAnalytics(null))
  }
  useEffect(() => { if (section === 'estadisticas' && !analytics) loadAnalytics() }, [section])

  function load() {
    setLoading(true)
    radicadosService.list({ ...filters, page: String(page), pageSize: '25' })
      .then(setData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar los radicados'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (section === 'consulta') load() }, [section, filters, page])

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

  const [exportingPdf, setExportingPdf] = useState(false)
  async function exportPdf(filters: RadicadoFilters) {
    setExportingPdf(true)
    try { await radicadosService.exportPdf(filters) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible exportar el informe') }
    finally { setExportingPdf(false) }
  }

  async function createRadicado(input: CreateRadicadoInput) {
    setCreating(true)
    try {
      const created = await radicadosService.create(input)
      toast.push('success', `Radicado ${created.numero_radicado} generado`)
      setShowNew(false)
      loadDashboard()
      if (section === 'base-datos') loadDb()
      if (section === 'consulta') load()
      if (section === 'estadisticas') loadAnalytics()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible generar el radicado') }
    finally { setCreating(false) }
  }

  async function openDetail(id: string) {
    try { setSelected(await radicadosService.detail(id)) }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible abrir el radicado') }
  }

  function onDetailChanged(options?: { closing?: boolean }) {
    if (selected && !options?.closing) radicadosService.detail(selected.id).then(setSelected).catch(() => {})
    loadDashboard()
    if (section === 'base-datos') loadDb()
    if (section === 'consulta') load()
    if (section === 'estadisticas') loadAnalytics()
  }

  const mixTotal = dashboard?.mix.total || 0

  return (
    <div className="page-with-identity" style={{ ['--ds-accent' as string]: identity.color }}>
      <NewRadicadoDialog open={showNew} catalogos={catalogos} busy={creating} onCancel={() => setShowNew(false)} onCreate={createRadicado} />
      <RadicadoDetailDialog radicado={selected} canVoid={canVoid} canDelete={isSuperadmin} onClose={() => setSelected(null)} onChanged={onDetailChanged} />

      <ModuleHero
        badge="Radicados"
        title="Correspondencia y radicación"
        subtitle="Consecutivo atómico por tipo y año, con trazabilidad completa de cada número"
        accent={identity.color}
        actions={(
          <>
            {/* Visible siempre, sin importar la pestana activa: es la queja real que motivo
                este boton — desde el Resumen no habia forma de llegar al informe sin saber
                que existia dentro de Base de datos. Exporta la base completa, igual que el
                boton de esa pestana. */}
            <Button variant="secondary" className="btn-on-hero-secondary" disabled={exportingPdf} onClick={() => void exportPdf({})}>
              <FileDown size={16} /> {exportingPdf ? 'Generando…' : 'Informe PDF'}
            </Button>
            {canCreate && <Button identity={identity} onClick={() => setShowNew(true)}><FilePlus2 size={16} /> Nuevo radicado</Button>}
          </>
        )}
      />

      <div className="surface-panel is-header mt-5" style={{ ['--ds-accent' as string]: identity.color }}>
        <nav className="ds-tabs" aria-label="Secciones de radicados">
          <button
            className={`ds-tabs-item ${section === 'resumen' ? 'is-active' : ''}`}
            style={section === 'resumen' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('resumen')}
          ><LayoutDashboard size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Resumen</button>
          <button
            className={`ds-tabs-item ${section === 'base-datos' ? 'is-active' : ''}`}
            style={section === 'base-datos' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('base-datos')}
          ><Database size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Base de datos</button>
          <button
            className={`ds-tabs-item ${section === 'consulta' ? 'is-active' : ''}`}
            style={section === 'consulta' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('consulta')}
          ><Search size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Consulta</button>
          <button
            className={`ds-tabs-item ${section === 'estadisticas' ? 'is-active' : ''}`}
            style={section === 'estadisticas' ? ({ ['--tab-accent' as string]: identity.color }) : undefined}
            onClick={() => setSection('estadisticas')}
          ><BarChart3 size={13} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />Estadísticas</button>
        </nav>

        <div className="mt-5 space-y-5">
          {section === 'resumen' && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard icon={Inbox} label="Radicados hoy" value={dashboard?.kpis.hoy ?? '—'} identity={identity} />
                <StatCard icon={Send} label="Recibidos hoy" value={dashboard?.kpis.recibidos_hoy ?? '—'} identity={identity} />
                <StatCard icon={FileText} label="Enviados hoy" value={dashboard?.kpis.enviados_hoy ?? '—'} identity={identity} />
                <StatCard icon={PackageOpen} label="Total este mes" value={dashboard?.kpis.mes ?? '—'} identity={identity} />
                <StatCard icon={Ban} label="Anulados este mes" value={dashboard?.kpis.anulados_mes ?? '—'} identity={identity} />
                <StatCard icon={Paperclip} label="Sin adjunto" value={dashboard?.kpis.pendientes_adjunto ?? '—'} detail="Radicados activos" identity={identity} />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
            </>
          )}

          {section === 'base-datos' && (
            <Card accent={identity.color} className="overflow-hidden">
              <div className="table-toolbar">
                <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                  <span><Database size={19} /></span>
                  <div>
                    <h2>{showDeleted ? 'Radicados eliminados' : 'Base de datos de radicados'}</h2>
                    <p>{dbData ? `${dbData.total} radicado${dbData.total === 1 ? '' : 's'}${showDeleted ? '' : ' en total, sin filtrar'}` : '…'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* El boton de informe general vive en el hero (arriba, visible en cualquier
                      pestana) — aqui solo queda el que es propio de esta pestana. */}
                  {/* Alterna entre la base activa y la papelera, nunca las dos mezcladas — igual
                      que el servidor, que responde una u otra segun includeDeleted. */}
                  {isSuperadmin && (
                    <Button
                      variant={showDeleted ? 'primary' : 'secondary'}
                      identity={identity}
                      onClick={() => { setShowDeleted(current => !current); setDbPage(1) }}
                    >
                      {showDeleted ? 'Ver activos' : 'Ver eliminados'}
                    </Button>
                  )}
                </div>
              </div>

              {!dbLoading && dbData && dbData.rows.length === 0 && (
                <div className="p-5">
                  <EmptyState
                    icon={Database}
                    title={showDeleted ? 'Ningún radicado eliminado' : 'Todavía no hay radicados'}
                    description={showDeleted ? 'Los radicados que un superadmin elimine aparecerán aquí.' : 'El primero que generes aparecerá aquí.'}
                  />
                </div>
              )}

              {!dbLoading && dbData && dbData.rows.length > 0 && (
                <>
                  <div className="ds-table-wrap">
                    <table className="ds-table">
                      <thead>
                        <tr>
                          <th>Número</th><th>Tipo</th><th>Categoría</th><th>Medio</th><th>Proceso</th>
                          <th>Objeto / asunto</th><th>Remitente</th><th>Destinatario</th>
                          <th>Fecha radicado</th><th>Fecha documento</th><th>Generado por</th>
                          <th>Adjuntos</th><th>Estado</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbData.rows.map(row => (
                          <tr key={row.id} style={row.estado === 'ANULADO' ? { opacity: 0.6 } : undefined}>
                            <td className="tabular-col"><span className="radicado-number-chip" style={{ ['--plate-accent' as string]: identity.color }}>{row.numero_radicado}</span></td>
                            <td>{row.tipo_nombre}{row.direccion ? <small className="repo-code">{row.direccion === 'RECIBIDO' ? 'Recibido' : 'Enviado'}</small> : null}</td>
                            <td>{row.categoria_nombre}</td>
                            <td>{row.medio_nombre}</td>
                            <td>{row.process_code || '—'}</td>
                            <td title={row.objeto}>{row.objeto.length > 40 ? `${row.objeto.slice(0, 40)}…` : row.objeto}</td>
                            <td>{row.remitente || '—'}</td>
                            <td>{row.destinatario || '—'}</td>
                            <td className="tabular-col">{new Date(row.fecha_radicado).toLocaleString('es-CO')}</td>
                            <td className="tabular-col">{row.fecha_documento ? new Date(row.fecha_documento).toLocaleDateString('es-CO') : '—'}</td>
                            <td>{row.created_by_name}</td>
                            <td className="tabular-col">{row.adjuntos_count}</td>
                            <td>
                              {row.deleted_at
                                ? <Badge tone="danger">Eliminado</Badge>
                                : <Badge tone={row.estado === 'ANULADO' ? 'danger' : 'success'}>{row.estado === 'ANULADO' ? 'Anulado' : 'Activo'}</Badge>}
                            </td>
                            <td>
                              <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} title="Ver el detalle y la trazabilidad completa" onClick={() => void openDetail(row.id)}>
                                <Eye size={13} /> Ver
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="repo-pager">
                    <span>Página {dbData.page} de {dbData.pages} · {dbData.total} en total</span>
                    <div className="repo-pager-actions">
                      <button className="row-action" disabled={dbData.page <= 1} onClick={() => setDbPage(p => Math.max(1, p - 1))}><ChevronLeft size={15} /> Anterior</button>
                      <button className="row-action" disabled={dbData.page >= dbData.pages} onClick={() => setDbPage(p => p + 1)}>Siguiente <ChevronRight size={15} /></button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}

          {section === 'consulta' && (
            <>
              <Card accent={identity.color} className="p-5">
                <div className="dc-filters-head">
                  <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
                    <span><Search size={19} /></span>
                    <div><h2>Consulta de radicados</h2><p>Filtros combinables sobre toda la base</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" disabled={exportingPdf} onClick={() => void exportPdf(filters)}>
                      <FileDown size={15} /> {exportingPdf ? 'Generando…' : 'Informe PDF'}
                    </Button>
                    <Button variant="secondary" onClick={clearAll} disabled={!chips.length && activeQuickFilter === 'TODOS'}><X size={15} /> Limpiar</Button>
                  </div>
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
                              <td className="tabular-col"><span className="radicado-number-chip" style={{ ['--plate-accent' as string]: identity.color }}>{row.numero_radicado}</span></td>
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
            </>
          )}

          {section === 'estadisticas' && (
            <>
              <Card accent={identity.color} className="p-5">
                <p className="ds-eyebrow">Por mes</p>
                <h2 className="mt-1 text-lg font-black">Radicados generados (últimos 12 meses)</h2>
                {analytics && analytics.monthly.some(item => item.value > 0) ? (
                  <div className="mt-3"><BarChart data={analytics.monthly} color={identity.color} height={260} /></div>
                ) : <div className="mt-3"><EmptyState icon={BarChart3} title="Sin datos suficientes" description="Cuando haya radicados generados, su evolución mensual aparecerá aquí." /></div>}
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card accent={identity.color} className="p-5">
                  <p className="ds-eyebrow">Interno o externo</p>
                  <h3 className="mt-1 text-sm font-bold">Por dirección</h3>
                  {analytics && analytics.byDireccion.length ? (
                    <div className="mt-3">
                      <DonutChart
                        height={220}
                        centerLabel="radicados"
                        data={analytics.byDireccion.map((item, index) => ({ ...item, color: [identity.color, '#0EA5E9', '#94A3B8'][index] || '#CBD5E1' }))}
                      />
                    </div>
                  ) : <div className="mt-3"><EmptyState icon={BarChart3} title="Sin datos suficientes" /></div>}
                </Card>

                <Card accent={identity.color} className="p-5">
                  <p className="ds-eyebrow">Catálogo</p>
                  <h3 className="mt-1 text-sm font-bold">Por tipo de radicado</h3>
                  {analytics && analytics.byTipo.length ? (
                    <div className="mt-3">
                      <DonutChart
                        height={220}
                        centerLabel="radicados"
                        data={analytics.byTipo.map((item, index) => ({ ...item, color: [identity.color, '#0EA5E9', '#94A3B8', '#F59E0B'][index] || '#CBD5E1' }))}
                      />
                    </div>
                  ) : <div className="mt-3"><EmptyState icon={BarChart3} title="Sin datos suficientes" /></div>}
                </Card>
              </div>

              <Card accent={identity.color} className="p-5">
                <p className="ds-eyebrow">Trazabilidad institucional</p>
                <h3 className="mt-1 text-sm font-bold">Por proceso</h3>
                {analytics && analytics.byProceso.some(item => item.value > 0) ? (
                  <div className="mt-3"><BarChart data={analytics.byProceso} orientation="horizontal" color={identity.color} height={Math.max(160, analytics.byProceso.length * 34)} /></div>
                ) : <div className="mt-3"><EmptyState icon={BarChart3} title="Sin datos suficientes" description="Los radicados sin proceso asignado no cuentan aquí." /></div>}
              </Card>

              <Card accent={identity.color} className="p-5">
                <p className="ds-eyebrow">Catálogo</p>
                <h3 className="mt-1 text-sm font-bold">Por categoría / tipo documental</h3>
                {analytics && analytics.byCategoria.length ? (
                  <div className="mt-3"><BarChart data={analytics.byCategoria} orientation="horizontal" color={identity.color} height={Math.max(160, analytics.byCategoria.length * 34)} /></div>
                ) : <div className="mt-3"><EmptyState icon={BarChart3} title="Sin datos suficientes" /></div>}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
