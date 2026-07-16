import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/design-system'

export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: {
  title: string
  message: string
  confirmLabel: string
  onCancel(): void
  onConfirm(): Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="almera-modal" onClick={onCancel}>
      <div className="ds-card almera-dialog" style={{ width: 'min(420px, 100%)' }} onClick={event => event.stopPropagation()}>
        <div className="dialog-head"><h2>{title}</h2><button aria-label="Cerrar" onClick={onCancel}><X /></button></div>
        <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false) }}>
            {busy ? 'Eliminando...' : <><Trash2 size={15} /> {confirmLabel}</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
