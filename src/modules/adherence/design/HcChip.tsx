import { Trash2 } from 'lucide-react'

export function HcChip({ number, onRemove, disabled }: { number: string; onRemove?(): void; disabled?: boolean }) {
  return (
    <span className="hc-chip">
      <span className="hc-chip-label">HC {number}</span>
      {onRemove && !disabled && (
        <button type="button" className="hc-chip-remove" onClick={onRemove} aria-label={`Quitar HC ${number}`}>
          <Trash2 size={11} />
        </button>
      )}
    </span>
  )
}
