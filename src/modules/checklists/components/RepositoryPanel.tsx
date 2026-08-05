import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ChevronLeft, ChevronRight, Download, Eye, Loader2, PenLine, Search, Trash2, X } from 'lucide-react'
import {
  Badge, Button, Card, ConfirmDialog, DatePicker, EmptyState, Field, Input, Select, Table,
  moduleIdentity, useToast,
} from '@/design-system'
// Semaforo del modulo: verde desde 85 % (ver src/modules/checklists/scale.ts).
import { checklistColor as semaphoreColor } from '../scale'
import { checklistsService } from '../services/checklistsService'
import type { DataCenterOptions, RepositoryFilters, RepositoryPage, RepositoryRow } from '../types'

const identity = moduleIdentity('checklists')

const STATUSES = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CERRADA', label: 'Cerradas' },
  { value: 'BORRADOR', label: 'Borradores' },
]

/**
 * Repositorio de auditorias guardadas.
 *
 * Contiene dato sensible (nombre y documento del paciente, cama, firmas), asi que lo que se ve
 * aqui NO lo decide esta pantalla: el servidor devuelve solo lo que el rol puede ver. Un auditor
 * recibe unicamente lo suyo aunque manipule la URL, y por eso el filtro "auditor" ni se dibuja
 * para el — no porque este oculto, sino porque no tendria efecto.
 *
 * La FECHA es el eje: se ordena por ella y su filtro va primero, porque la pregunta real es
 * "¿que audite el 15 de julio?".
 */
export function RepositoryPanel({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [options, setOptions] = useState<DataCenterOptions | null>(null)
  const [filters, setFilters] = useState<RepositoryFilters>({})
  const [page, setPage] = useState(1)
  const [size, setSize] = useState('25')
  const [data, setData] = useState<RepositoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<RepositoryRow | null>(null)
  const [busy, setBusy] = useState(false)
  // Lo que se escribe se aplica al pulsar Enter o el boton: buscar en cada tecla dispararia una
  // consulta por letra sobre una tabla que puede tener miles de filas.
  const [subjectDraft, setSubjectDraft] = useState('')
  const [staffDraft, setStaffDraft] = useState('')

  useEffect(() => { checklistsService.dataCenterOptions().then(setOptions).catch(() => setOptions(null)) }, [])

  function load() {
    setLoading(true)
    checklistsService.repository({ ...filters, page: String(page), size })
      .then(setData)
      .catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el repositorio'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [filters, page, size])

  const set = (patch: Partial<RepositoryFilters>) => { setPage(1); setFilters(current => ({ ...current, ...patch })) }

  const chips = useMemo(() => {
    const out: { key: keyof RepositoryFilters; label: string }[] = []
    const name = (list: { id: string; name: string }[] | undefined, id?: string) => list?.find(x => x.id === id)?.name
    if (filters.dateFrom) out.push({ key: 'dateFrom', label: `Desde ${filters.dateFrom}` })
    if (filters.dateTo) out.push({ key: 'dateTo', label: `Hasta ${filters.dateTo}` })
    if (filters.center) out.push({ key: 'center', label: `Centro: ${filters.center === 'SIN' ? 'Sin centro' : filters.center}` })
    if (filters.areaId) out.push({ key: 'areaId', label: `Servicio: ${name(options?.areas, filters.areaId) || filters.areaId}` })
    if (filters.templateId) out.push({ key: 'templateId', label: `Lista: ${name(options?.templates, filters.templateId) || filters.templateId}` })
    if (filters.auditorId) out.push({ key: 'auditorId', label: `Auditor: ${name(options?.auditors, filters.auditorId) || filters.auditorId}` })
    if (filters.subject) out.push({ key: 'subject', label: `Sujeto: ${filters.subject}` })
    if (filters.staff) out.push({ key: 'staff', label: `Personal: ${filters.staff}` })
    if (filters.shift) out.push({ key: 'shift', label: `Turno: ${filters.shift}` })
    if (filters.status) out.push({ key: 'status', label: filters.status === 'CERRADA' ? 'Cerradas' : 'Borradores' })
    if (filters.maxPercent) out.push({ key: 'maxPercent', label: `Bajo ${filters.maxPercent} %` })
    return out
  }, [filters, options])

  function clearAll() {
    setSubjectDraft(''); setStaffDraft(''); setPage(1); setFilters({})
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      await checklistsService.removeAudit(pendingDelete.id)
      toast.push('success', 'Auditoría eliminada')
      setPendingDelete(null)
      load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
    finally { setBusy(false) }
  }

  return (
    <div className="dc-root">
      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title="¿Eliminar esta auditoría?"
        confirmLabel="Sí, eliminar"
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        description={pendingDelete && (
          <p>
            <strong>{pendingDelete.template_name}</strong> · {String(pendingDelete.audit_date).slice(0, 10)} ·
            {' '}{pendingDelete.area_name}. Se borran sus respuestas, sujetos y firmas.
            {' '}<strong>No se puede deshacer</strong> y queda constancia de quién la eliminó.
          </p>
        )}
      />

      <Card accent={identity.color} className="p-5">
        <div className="dc-filters-head">
          <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
            <span><Archive size={19} /></span>
            <div>
              <h2>Repositorio de auditorías</h2>
              <p>{canManage ? 'Todas las auditorías de la entidad' : 'Solo las auditorías que tú diligenciaste'}</p>
            </div>
          </div>
          <div className="dc-filters-actions">
            <Button variant="secondary" onClick={clearAll} disabled={!chips.length}><X size={15} /> Limpiar</Button>
          </div>
        </div>

        <div className="dc-filters">
          <Field label="Desde"><DatePicker value={filters.dateFrom || ''} onChange={value => set({ dateFrom: value || undefined })} /></Field>
          <Field label="Hasta"><DatePicker value={filters.dateTo || ''} onChange={value => set({ dateTo: value || undefined })} /></Field>
          {/* Centro y servicio como DOS campos, en ese orden — igual que al abrir la ronda. */}
          <Field label="Centro de atención">
            <Select
              value={filters.center || 'ALL'}
              onChange={value => {
                const next = value === 'ALL' ? undefined : value
                setPage(1)
                // El servicio elegido era de otra sede: se limpia junto con el cambio de centro.
                setFilters(current => ({ ...current, center: next, areaId: undefined }))
              }}
              options={[{ value: 'ALL', label: 'Todos' },
                ...(options?.centers || []).map(item => ({ value: item || 'SIN', label: item || 'Sin centro' }))]}
            />
          </Field>
          <Field label="Servicio">
            <Select
              value={filters.areaId || 'ALL'}
              onChange={value => set({ areaId: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: filters.center ? 'Todos los de la sede' : 'Todos' },
                ...(options?.areas || [])
                  .filter(a => !filters.center || (a.center || 'SIN') === filters.center)
                  .map(a => ({ value: a.id, label: filters.center ? a.name : `${a.center ? `${a.center} · ` : ''}${a.name}` }))]}
            />
          </Field>
          <Field label="Lista">
            <Select
              value={filters.templateId || 'ALL'}
              onChange={value => set({ templateId: value === 'ALL' ? undefined : value })}
              options={[{ value: 'ALL', label: 'Todas' }, ...(options?.templates || []).map(t => ({ value: t.id, label: t.name }))]}
            />
          </Field>
          <Field label="Sujeto auditado" hint="Nombre, documento o cama">
            <Input
              value={subjectDraft} placeholder="Ej. María José o 203-B"
              onChange={event => setSubjectDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') set({ subject: subjectDraft.trim() || undefined }) }}
              onBlur={() => set({ subject: subjectDraft.trim() || undefined })}
            />
          </Field>
          <Field label="Personal de turno" hint="Busca en la cabecera">
            <Input
              value={staffDraft} placeholder="Ej. Laura Méndez"
              onChange={event => setStaffDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') set({ staff: staffDraft.trim() || undefined }) }}
              onBlur={() => set({ staff: staffDraft.trim() || undefined })}
            />
          </Field>
          <Field label="Estado">
            <Select
              value={filters.status || 'ALL'}
              onChange={value => set({ status: value === 'ALL' ? undefined : value })}
              options={STATUSES}
            />
          </Field>
          {/* El filtro por auditor solo se dibuja para calidad: al auditor el servidor le
              devolveria lo mismo con o sin el, asi que ponerlo seria mentirle. */}
          {canManage && (
            <Field label="Auditor">
              <Select
                value={filters.auditorId || 'ALL'}
                onChange={value => set({ auditorId: value === 'ALL' ? undefined : value })}
                options={[{ value: 'ALL', label: 'Todos' }, ...(options?.auditors || []).map(a => ({ value: a.id, label: a.name }))]}
              />
            </Field>
          )}
        </div>

        {chips.length > 0 && (
          <div className="dc-chips">
            {chips.map(chip => (
              <button key={chip.key} className="dc-chip" onClick={() => {
                if (chip.key === 'subject') setSubjectDraft('')
                if (chip.key === 'staff') setStaffDraft('')
                set({ [chip.key]: undefined })
              }}>
                {chip.label} <X size={13} />
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card accent={identity.color} className="overflow-hidden">
        <div className="table-toolbar">
          <div className="almera-panel-title" style={{ ['--ds-accent' as string]: identity.color }}>
            <span><Search size={19} /></span>
            <div>
              <h2>Resultados</h2>
              <p>{data ? `${data.total} auditoría${data.total === 1 ? '' : 's'}` : '…'}</p>
            </div>
          </div>
        </div>

        {loading && <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin" size={22} /></div>}

        {!loading && data && data.rows.length === 0 && (
          <div className="p-5">
            <EmptyState
              icon={Archive}
              title="Ninguna auditoría con estos filtros"
              description={canManage
                ? 'Prueba a ampliar el rango de fechas o a quitar algún filtro.'
                : 'Aquí solo aparecen las auditorías que tú diligenciaste. Si esperabas ver otras, pídeselas al equipo de calidad.'}
              action={chips.length ? <Button variant="secondary" onClick={clearAll}><X size={15} /> Limpiar filtros</Button> : undefined}
            />
          </div>
        )}

        {!loading && data && data.rows.length > 0 && (
          <>
            <div className="checklists-table repo-table">
              <Table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Lista</th><th>Servicio</th><th>Turno</th>
                    <th>Sujetos auditados</th><th>Auditor</th><th>Adherencia</th>
                    <th>Firmas</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(row => (
                    <tr key={row.id}>
                      <td className="tabular-col"><strong>{String(row.audit_date).slice(0, 10)}</strong></td>
                      <td>
                        {row.template_name}
                        {row.template_code ? <small className="repo-code">{row.template_code} v{row.template_version}</small> : null}
                      </td>
                      <td>{row.area_name}</td>
                      <td>{row.shift || '—'}</td>
                      <td className="repo-subjects" title={row.subjects || ''}>
                        {row.subjects || '—'}
                        {row.subject_count > 1 ? <small className="repo-code">{row.subject_count} {row.subject_label?.toLowerCase()}s</small> : null}
                      </td>
                      <td>{row.auditor_name}</td>
                      <td className="tabular-col">
                        {row.adherence_percent === null
                          ? <span style={{ color: 'var(--muted)' }}>—</span>
                          : <strong style={{ color: semaphoreColor(Number(row.adherence_percent)) }}>{Number(row.adherence_percent).toFixed(1)} %</strong>}
                      </td>
                      <td className="tabular-col">{row.signature_count || '—'}</td>
                      <td><Badge tone={row.status === 'CERRADA' ? 'info' : 'neutral'}>{row.status === 'CERRADA' ? 'Cerrada' : 'Borrador'}</Badge></td>
                      <td>
                        <div className="row-action-group">
                          <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} title="Ver el detalle completo"
                                  onClick={() => navigate(`/app/listas-chequeo/auditorias/${row.id}`)}>
                            <Eye size={13} /> Ver
                          </button>
                          {row.status === 'CERRADA' && (
                            <a className="row-action" style={{ ['--row-accent' as string]: identity.color }} title="Descargar su informe PDF"
                               href={`/api/checklists/audits/${row.id}/report.pdf`} target="_blank" rel="noreferrer">
                              <Download size={13} />
                            </a>
                          )}
                          <button className="row-action" style={{ ['--row-accent' as string]: identity.color }} title="Abrir para editar"
                                  onClick={() => navigate(`/app/listas-chequeo/auditorias/${row.id}`)}>
                            <PenLine size={13} />
                          </button>
                          {canManage && (
                            <button className="row-action is-danger" title="Eliminar" onClick={() => setPendingDelete(row)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="repo-pager">
              <span>Página {data.page} de {data.pages} · {data.total} en total</span>
              <div className="repo-pager-actions">
                <div className="w-[130px]">
                  <Select
                    value={size}
                    onChange={value => { setSize(value); setPage(1) }}
                    options={[{ value: '10', label: '10 por página' }, { value: '25', label: '25 por página' }, { value: '50', label: '50 por página' }]}
                  />
                </div>
                <button className="row-action" disabled={data.page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft size={15} /> Anterior
                </button>
                <button className="row-action" disabled={data.page >= data.pages} onClick={() => setPage(p => p + 1)}>
                  Siguiente <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
