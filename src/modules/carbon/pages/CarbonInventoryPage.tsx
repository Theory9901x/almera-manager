import { useEffect, useState } from 'react'
import { Check, Paperclip, Trash2, X } from 'lucide-react'
import { Button, Card, ConfirmDialog, DatePicker, EmptyState, Field, Select, Table, Textarea, ToastProvider, useToast } from '@/design-system'
import { useAuth } from '@/platform/auth/AuthContext'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { RecordStatusBadge } from '../components/RecordStatusBadge'
import { carbonService } from '../services/carbonService'
import type { InventoryRow, RecordSource, RecordStatus } from '../types'

const SOURCE_LABEL: Record<RecordSource, string> = { STATIONARY: 'Combustión estacionaria', MOBILE: 'Combustión móvil', ELECTRICITY: 'Energía eléctrica' }
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' }, { value: 'BORRADOR', label: 'Borrador' }, { value: 'PENDIENTE', label: 'Pendiente de revisión' },
  { value: 'VALIDADO', label: 'Validado' }, { value: 'RECHAZADO', label: 'Rechazado' },
]
const SOURCE_OPTIONS = [{ value: '', label: 'Todas las fuentes' }, { value: 'STATIONARY', label: 'Combustión estacionaria' }, { value: 'MOBILE', label: 'Combustión móvil' }, { value: 'ELECTRICITY', label: 'Energía eléctrica' }]

const KIND_BY_SOURCE: Record<RecordSource, 'stationary' | 'mobile' | 'electricity'> = { STATIONARY: 'stationary', MOBILE: 'mobile', ELECTRICITY: 'electricity' }

export default function CarbonInventoryPage() {
  return <ToastProvider><CarbonInventoryContent /></ToastProvider>
}

function CarbonInventoryContent() {
  const toast = useToast()
  const { session } = useAuth()
  const canManage = Boolean(session?.permissions.includes('carbon.manage'))
  const isSuperadmin = session?.role.key === 'SUPERADMIN'

  const [rows, setRows] = useState<InventoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '', source: '' })
  const [rejecting, setRejecting] = useState<InventoryRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deleting, setDeleting] = useState<InventoryRow | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await carbonService.inventory({ ...filters, limit: 200 })
      setRows(result.rows)
      setTotal(result.total)
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el inventario') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [filters.dateFrom, filters.dateTo, filters.status, filters.source])

  async function validate(row: InventoryRow) {
    try { await carbonService.validateRecord(KIND_BY_SOURCE[row.source], row.id); toast.push('success', 'Registro validado'); void load() }
    catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible validar') }
  }

  async function confirmReject() {
    if (!rejecting || !rejectReason.trim()) return
    setBusy(true)
    try {
      await carbonService.rejectRecord(KIND_BY_SOURCE[rejecting.source], rejecting.id, rejectReason.trim())
      toast.push('success', 'Registro rechazado')
      setRejecting(null); setRejectReason('')
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible rechazar') }
    finally { setBusy(false) }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      await carbonService.deleteRecord(KIND_BY_SOURCE[deleting.source], deleting.id)
      toast.push('success', 'Registro eliminado')
      setDeleting(null)
      void load()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
    finally { setBusy(false) }
  }

  const totalTon = rows.reduce((sum, row) => sum + (row.status === 'VALIDADO' ? Number(row.co2e_kg) : 0), 0) / 1000

  return (
    <CarbonShell title="Inventario de emisiones" subtitle={`${total} registro(s) — ${totalTon.toFixed(3)} tCO2e validadas en la vista actual`}>
      <Card accent={carbonIdentity.color} className="p-4 hc2-filter-bar">
        <Field label="Desde"><DatePicker value={filters.dateFrom} onChange={value => setFilters({ ...filters, dateFrom: value })} /></Field>
        <Field label="Hasta"><DatePicker value={filters.dateTo} onChange={value => setFilters({ ...filters, dateTo: value })} /></Field>
        <Field label="Estado"><Select value={filters.status} onChange={value => setFilters({ ...filters, status: value })} options={STATUS_OPTIONS} /></Field>
        <Field label="Fuente"><Select value={filters.source} onChange={value => setFilters({ ...filters, source: value })} options={SOURCE_OPTIONS} /></Field>
      </Card>

      <Card accent={carbonIdentity.color} className="p-0">
        {!loading && !rows.length ? (
          <div className="p-8"><EmptyState title="Sin registros" description="Ajusta los filtros o registra la primera actividad desde Registro." /></div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Fecha</th><th>Fuente</th><th>Detalle</th><th className="text-right">Cantidad</th><th className="text-right">tCO2e</th>
                <th>Estado</th><th>Factura</th><th>Registró</th><th></th>{canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.source}-${row.id}`}>
                  <td>{new Date(row.record_date).toLocaleDateString('es-CO')}</td>
                  <td>{SOURCE_LABEL[row.source]}</td>
                  <td>{row.fuel_label}</td>
                  <td className="text-right">{Number(row.quantity).toLocaleString('es-CO', { maximumFractionDigits: 1 })} {row.quantity_unit}</td>
                  <td className="text-right">{(Number(row.co2e_kg) / 1000).toLocaleString('es-CO', { maximumFractionDigits: 3 })}</td>
                  <td><RecordStatusBadge status={row.status} /></td>
                  <td>{row.invoice_number || '—'}</td>
                  <td>{row.created_by_name}</td>
                  <td>{row.evidence_count > 0 && <Paperclip size={13} />}</td>
                  {canManage && (
                    <td className="hc2-row-actions">
                      {row.status === 'PENDIENTE' && (
                        <>
                          <Button variant="secondary" onClick={() => validate(row)}><Check size={13} /></Button>
                          <Button variant="secondary" onClick={() => setRejecting(row)}><X size={13} /></Button>
                        </>
                      )}
                      {isSuperadmin && <Button variant="secondary" onClick={() => setDeleting(row)}><Trash2 size={13} /></Button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(rejecting)}
        title="Rechazar registro"
        description={<Field label="Motivo del rechazo"><Textarea rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="Explica por qué se rechaza este registro" /></Field>}
        confirmLabel="Rechazar" tone="danger" busy={busy}
        onConfirm={() => void confirmReject()} onCancel={() => { setRejecting(null); setRejectReason('') }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Eliminar registro"
        description="Esta acción borra el registro y su evidencia de forma permanente. Solo un superadministrador puede hacerlo — úsalo para duplicados o datos de prueba."
        confirmLabel="Eliminar" tone="danger" busy={busy}
        onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)}
      />
    </CarbonShell>
  )
}
