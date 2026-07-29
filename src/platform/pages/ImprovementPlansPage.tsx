import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ClipboardList, Download, Search, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Input, PageHeader, Select, moduleIdentity } from '@/design-system'

/** Estado normalizado, comun a los dos modulos. El color es de FLUJO, no del semaforo de
 *  cumplimiento (§5.1): un plan pendiente no es «malo», esta sin empezar. */
const STATUS = {
  PENDIENTE: { label: 'Pendiente', color: '#64748B' },
  EN_PROCESO: { label: 'En proceso', color: '#0284C7' },
  POR_VERIFICAR: { label: 'Por verificar', color: '#D97706' },
  CERRADO: { label: 'Cerrado', color: '#059669' },
} as const

type NormalizedStatus = keyof typeof STATUS

interface PlanRow {
  id: string
  code: string
  moduleKey: string
  moduleLabel: string
  source: string
  sourceLabel: string
  instrumentName: string
  subjectName: string
  subjectDocument: string
  description: string
  criterionText?: string
  domainName?: string
  itemNumber?: string
  responsibleName: string
  statusLabel: string
  normalizedStatus: NormalizedStatus
  progressPercent: number | null
  plannedEndDate: string | null
  closedAt: string | null
  createdAt: string
  createdByName: string
  period: string | null
  referenceDate: string | null
  center: string
  service: string
  href: string
}

interface ModuleSummary {
  moduleKey: string
  moduleLabel: string
  total: number
  pendientes: number
  enProceso: number
  porVerificar: number
  cerrados: number
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

const PAGE_SIZES = [25, 50, 100]

export default function ImprovementPlansPage() {
  const [rows, setRows] = useState<PlanRow[]>([])
  const [summary, setSummary] = useState<ModuleSummary[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  // El filtro por modulo es lo primero: el objetivo del apartado es NO mezclarlos.
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  // Paginacion EN EL SERVIDOR: con miles de planes, traerlos todos para filtrar en el navegador
  // es lo que hace que la pagina tarde en abrir aunque solo se miren 25.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)

  // La busqueda va con retardo: una peticion por pulsacion es un ataque a la propia base.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [search])

  // Cualquier cambio de filtro vuelve a la primera pagina: quedarse en la 7 de un resultado de 2
  // muestra una lista vacia que parece «no hay nada».
  useEffect(() => { setPage(1) }, [moduleFilter, statusFilter, debouncedSearch, pageSize])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (moduleFilter) params.set('module', moduleFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (debouncedSearch) params.set('search', debouncedSearch)
    let cancelled = false
    fetch(`/api/plans?${params}`, { credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'No fue posible cargar los planes de mejora')
        return data
      })
      .then(data => {
        if (cancelled) return
        setRows(data.rows); setSummary(data.summary)
        setTotal(data.total); setPages(data.pages)
        // El servidor acota la pagina al rango real; se acepta lo que devuelve.
        if (data.page !== page) setPage(data.page)
        setError('')
      })
      .catch(caught => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'No fue posible cargar los planes') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, pageSize, moduleFilter, statusFilter, debouncedSearch])

  /** Agrupado por modulo: cada grupo es su propia tabla, con su color y su etiqueta. */
  const groups = useMemo(() => {
    const byModule = new Map<string, PlanRow[]>()
    for (const row of rows) {
      const bucket = byModule.get(row.moduleKey) || []
      bucket.push(row)
      byModule.set(row.moduleKey, bucket)
    }
    return [...byModule.entries()].map(([moduleKey, moduleRows]) => ({
      moduleKey,
      moduleLabel: moduleRows[0].moduleLabel,
      identity: moduleIdentity(moduleKey),
      rows: moduleRows,
    }))
  }, [rows])

  // Rango que se esta viendo, para que «1–25 de 340» diga la verdad tambien en la ultima pagina.
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1
  const hasta = Math.min(page * pageSize, total)

  const [exporting, setExporting] = useState(false)

  /**
   * Exporta el conjunto FILTRADO COMPLETO, no la pagina que se ve. Con paginacion en el servidor,
   * exportar lo que hay en memoria daria 25 filas y el usuario creeria que eso es todo.
   */
  const exportCsv = async () => {
    setExporting(true)
    try {
      const all: PlanRow[] = []
      for (let current = 1; ; current += 1) {
        const params = new URLSearchParams({ page: String(current), pageSize: '100' })
        if (moduleFilter) params.set('module', moduleFilter)
        if (statusFilter) params.set('status', statusFilter)
        if (debouncedSearch) params.set('search', debouncedSearch)
        const response = await fetch(`/api/plans?${params}`, { credentials: 'same-origin' })
        if (!response.ok) throw new Error('No fue posible exportar')
        const data = await response.json()
        all.push(...data.rows)
        if (current >= data.pages || !data.rows.length) break
      }
      const header = ['ID', 'Modulo', 'Origen', 'Instrumento', 'Sujeto', 'Responsable', 'Descripcion', 'Estado', 'Avance', 'Fecha limite', 'Centro', 'Servicio', 'Creado']
      const lines = all.map(row => [
        row.code, row.moduleLabel, row.sourceLabel, row.instrumentName, row.subjectName, row.responsibleName,
        row.description, row.statusLabel, row.progressPercent === null ? '' : `${row.progressPercent}%`,
        row.plannedEndDate ? String(row.plannedEndDate).slice(0, 10) : '',
        row.center, row.service, String(row.createdAt).slice(0, 10),
      ])
      // El punto y coma es el separador que Excel en español espera; con coma parte mal las celdas.
      const csv = [header, ...lines]
        .map(cells => cells.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\r\n')
      // BOM: sin el, Excel en Windows abre el archivo en la codificacion del sistema y los
      // acentos llegan hechos un jeroglifico.
      const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'planes-de-mejora.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible exportar')
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Seguimiento"
        title="Planes de mejora"
        description="Todos los planes del sistema, separados por módulo. Cada uno se atiende en el módulo donde nació."
        identity={moduleIdentity('dashboard')}
      />

      {error && <div className="almera-alert"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}

      {/* Una tarjeta por modulo, con SU color: es la categorizacion, no una decoracion. */}
      {summary.length > 0 && (
        <div className="pmx-cards">
          {summary.map(item => {
            const identity = moduleIdentity(item.moduleKey)
            const active = moduleFilter === item.moduleKey
            return (
              <button
                key={item.moduleKey}
                className={`pmx-card${active ? ' is-on' : ''}`}
                style={{ ['--pmx-accent' as string]: identity.color }}
                onClick={() => setModuleFilter(active ? '' : item.moduleKey)}
              >
                <span className="pmx-tag">{item.moduleLabel}</span>
                <strong>{item.total}</strong>
                <div className="pmx-mini">
                  <span><i style={{ background: STATUS.PENDIENTE.color }} />{item.pendientes} pendientes</span>
                  <span><i style={{ background: STATUS.EN_PROCESO.color }} />{item.enProceso} en proceso</span>
                  {item.porVerificar > 0 && <span><i style={{ background: STATUS.POR_VERIFICAR.color }} />{item.porVerificar} por verificar</span>}
                  <span><i style={{ background: STATUS.CERRADO.color }} />{item.cerrados} cerrados</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="surface-panel">
        <div className="pmx-filters">
          <label className="pmx-search">
            <Search size={15} />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ID, persona, instrumento o texto del plan" />
          </label>
          <Select
            value={moduleFilter}
            onChange={setModuleFilter}
            placeholder="Todos los módulos"
            options={[{ value: '', label: 'Todos los módulos' }, ...summary.map(item => ({ value: item.moduleKey, label: item.moduleLabel }))]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Todos los estados"
            options={[
              { value: '', label: 'Todos los estados' },
              ...(Object.keys(STATUS) as NormalizedStatus[]).map(key => ({ value: key, label: STATUS[key].label })),
            ]}
          />
          <button className="row-action" onClick={() => void exportCsv()} disabled={exporting || !total}>
            <Download size={15} />{exporting ? 'Exportando…' : `Exportar ${total}`}
          </button>
        </div>

        {loading ? (
          <p className="pmx-empty">Cargando planes…</p>
        ) : !groups.length ? (
          <div className="almera-empty">
            <ClipboardList size={30} />
            <p>{rows.length ? 'Ningún plan coincide con el filtro.' : 'Todavía no hay planes de mejora registrados.'}</p>
          </div>
        ) : (
          <div className="pmx-groups">
            {groups.map(group => (
              <section key={group.moduleKey} className="pmx-group" style={{ ['--pmx-accent' as string]: group.identity.color }}>
                <header className="pmx-group-head">
                  <span className="pmx-tag">{group.moduleLabel}</span>
                  <span className="pmx-group-count">{group.rows.length} {group.rows.length === 1 ? 'plan' : 'planes'}</span>
                </header>
                <div className="pmx-tablewrap">
                  <table className="pmx-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Origen</th>
                        <th>Instrumento</th>
                        <th>Sujeto</th>
                        <th>Descripción</th>
                        <th>Responsable</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map(row => {
                        const status = STATUS[row.normalizedStatus] || STATUS.PENDIENTE
                        return (
                          <tr key={`${row.moduleKey}-${row.id}`}>
                            <td className="pmx-code">{row.code}</td>
                            <td><span className="pmx-src">{row.sourceLabel}</span></td>
                            <td className="pmx-instr">
                              {row.instrumentName}
                              {row.period ? <small>{row.period}</small> : null}
                              {row.center || row.service ? <small>{[row.center, row.service].filter(Boolean).join(' · ')}</small> : null}
                            </td>
                            <td>{row.subjectName}</td>
                            {/* El recorte va en un div, no en la celda: `line-clamp` sobre un <td>
                                no recorta limpio y deja media linea asomando. */}
                            <td><div className="pmx-desc" title={row.description}>{row.description}</div></td>
                            <td>{row.responsibleName}</td>
                            {/* Solo los planes de matrices tienen plazo. En Listas se muestra la
                                fecha de la auditoria y se dice que lo es: llamarla «límite» hacía
                                leer un plazo donde no hay ninguno. */}
                            <td className="pmx-date">
                              {formatDate(row.plannedEndDate || row.referenceDate)}
                              <small>{row.plannedEndDate ? 'límite' : 'auditoría'}</small>
                            </td>
                            <td>
                              {/* El color va por atributo, no en linea: un color en linea no se
                                  puede tematizar, y el gris del pendiente se pierde en oscuro. */}
                              <span className="pmx-status" data-status={row.normalizedStatus}>
                                {row.statusLabel}
                              </span>
                              {row.progressPercent !== null ? <small className="pmx-pct">{row.progressPercent}%</small> : null}
                            </td>
                            <td>
                              {/* Se atiende EN SU MODULO: aqui solo se encuentra. */}
                              <Link className="pmx-go" to={row.href} title={`Abrir en ${row.moduleLabel}`}>
                                <ArrowUpRight size={15} />
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Paginacion. Se muestra siempre que haya mas de una pagina, y el conteo va aunque no la
            haya: saber que son 12 de 12 es informacion, no ruido. */}
        {total > 0 && (
          <div className="pmx-pager">
            <span className="pmx-pager-count">
              {desde}–{hasta} de {total} {total === 1 ? 'plan' : 'planes'}
            </span>
            <label className="pmx-pager-size">
              <span>Por página</span>
              <Select
                value={String(pageSize)}
                onChange={value => setPageSize(Number(value))}
                options={PAGE_SIZES.map(size => ({ value: String(size), label: String(size) }))}
              />
            </label>
            {pages > 1 && (
              <div className="pmx-pager-nav">
                <button onClick={() => setPage(1)} disabled={page === 1} title="Primera página">
                  <ChevronsLeft size={15} />
                </button>
                <button onClick={() => setPage(page - 1)} disabled={page === 1} title="Anterior">
                  <ChevronLeft size={15} />
                </button>
                <span className="pmx-pager-page">Página <b>{page}</b> de {pages}</span>
                <button onClick={() => setPage(page + 1)} disabled={page >= pages} title="Siguiente">
                  <ChevronRight size={15} />
                </button>
                <button onClick={() => setPage(pages)} disabled={page >= pages} title="Última página">
                  <ChevronsRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
