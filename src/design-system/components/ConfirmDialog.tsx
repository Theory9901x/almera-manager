import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from './Button'

/**
 * Confirmacion explicita para acciones que no se pueden deshacer.
 *
 * Se hizo compartido y no local al modulo porque borrar registros aparece en varios sitios y
 * el patron tiene que ser el mismo: si en una pantalla borrar pide confirmacion y en otra no,
 * la gente aprende a no leer el aviso.
 *
 * Va en un portal sobre <body>: dentro del arbol quedaria atrapado por el `overflow` y el
 * `backdrop-filter` de las tarjetas de vidrio, que crean contexto de apilamiento.
 */
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger', busy = false, onConfirm, onCancel }: {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  busy?: boolean
  onConfirm(): void
  onCancel(): void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // El foco entra en CANCELAR, no en confirmar: si al abrirse el foco cayera en el boton
    // destructivo, un Enter arrastrado desde la tecla anterior borraria sin leer.
    const timer = setTimeout(() => dialogRef.current?.querySelector<HTMLButtonElement>('.ds-button-secondary')?.focus(), 30)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="ds-confirm-backdrop" onClick={() => !busy && onCancel()}>
      <div
        ref={dialogRef}
        className="ds-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ds-confirm-title"
        onClick={event => event.stopPropagation()}
      >
        <button className="ds-confirm-close" onClick={onCancel} aria-label="Cerrar"><X size={16} /></button>
        <div className={`ds-confirm-icon ${tone === 'danger' ? 'is-danger' : ''}`}><AlertTriangle size={22} /></div>
        <h2 id="ds-confirm-title">{title}</h2>
        {description && <div className="ds-confirm-body">{description}</div>}
        <div className="ds-confirm-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Procesando…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
