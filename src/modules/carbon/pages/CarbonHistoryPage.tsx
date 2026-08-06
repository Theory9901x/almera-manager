import { useEffect, useState } from 'react'
import { Card, EmptyState, Table, ToastProvider, useToast } from '@/design-system'
import { History } from 'lucide-react'
import { CarbonShell, carbonIdentity } from '../components/CarbonShell'
import { carbonService } from '../services/carbonService'
import type { AuditLogEntry } from '../types'

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Creó', UPDATED: 'Actualizó', VALIDATED: 'Validó', REJECTED: 'Rechazó', DELETED: 'Eliminó', GENERATED: 'Generó informe',
}
const ENTITY_LABEL: Record<string, string> = {
  CARBON_STATIONARY_RECORD: 'Combustión estacionaria', CARBON_MOBILE_RECORD: 'Combustión móvil', CARBON_ELECTRICITY_RECORD: 'Energía eléctrica',
  CARBON_PROFILE: 'Perfil institucional', CARBON_FUEL_FACTOR: 'Factor de combustible', CARBON_ELECTRICITY_FACTOR: 'Factor eléctrico',
  CARBON_BIOFUEL_BLEND: 'Corte de biocombustible', CARBON_REPORT: 'Informe PDF',
}

export default function CarbonHistoryPage() {
  return <ToastProvider><CarbonHistoryContent /></ToastProvider>
}

function CarbonHistoryContent() {
  const toast = useToast()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void carbonService.auditLog().then(setEntries).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el historial')).finally(() => setLoading(false))
  }, [])

  return (
    <CarbonShell title="Historial y trazabilidad" subtitle="Cada creación, edición, validación, rechazo, eliminación y generación de informe queda registrada">
      <Card accent={carbonIdentity.color} className="p-0">
        {loading ? <div className="hc2-skel-block" /> : !entries.length ? (
          <div className="p-8"><EmptyState icon={History} title="Sin movimientos todavía" /></div>
        ) : (
          <Table>
            <thead><tr><th>Fecha</th><th>Quién</th><th>Qué</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString('es-CO')}</td>
                  <td>{entry.actor_name}</td>
                  <td>{ENTITY_LABEL[entry.entity_type] || entry.entity_type}</td>
                  <td>{ACTION_LABEL[entry.action] || entry.action}</td>
                  <td className="text-xs text-[var(--muted)]">{Object.keys(entry.changes || {}).length ? JSON.stringify(entry.changes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </CarbonShell>
  )
}
