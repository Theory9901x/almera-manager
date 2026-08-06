import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Card, EmptyState, Table, ToastProvider, useToast } from '@/design-system'
import { EnvironmentalShell } from '../components/EnvironmentalShell'
import { environmentalService } from '../services/environmentalService'
import type { AuditLogEntry } from '../types'

const ACTION_LABEL: Record<string, string> = { CREATED: 'Creó', UPDATED: 'Actualizó', VALIDATED: 'Validó', REJECTED: 'Rechazó', DELETED: 'Eliminó', GENERATED: 'Generó informe' }
const ENTITY_LABEL: Record<string, string> = { ENV_CONSUMPTION_RECORD: 'Registro de consumo', ENV_BASELINE: 'Línea base', ENV_TARGET: 'Meta', ENV_REPORT: 'Informe PDF' }

export default function EnvironmentalHistoryPage() {
  return <ToastProvider><EnvironmentalHistoryContent /></ToastProvider>
}

function EnvironmentalHistoryContent() {
  const toast = useToast()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void environmentalService.auditLog().then(setEntries).catch(cause => toast.push('error', cause instanceof Error ? cause.message : 'No fue posible cargar el historial')).finally(() => setLoading(false))
  }, [])

  return (
    <EnvironmentalShell title="Historial y trazabilidad" subtitle="Creación, edición, validación, rechazo, eliminación, cambios de línea base/meta y generación de informes">
      <Card accent="#2385D9" className="p-0">
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
    </EnvironmentalShell>
  )
}
