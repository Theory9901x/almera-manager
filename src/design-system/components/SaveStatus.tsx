import { AlertTriangle, Check, Loader2 } from 'lucide-react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Indicador de guardado — para pantallas con autoguardado (sin boton "Guardar" por campo, como el
// constructor de encuestas) donde antes no habia forma de saber si un cambio realmente se guardo.
// Siempre visible mientras hay algo que reportar; en 'idle' no ocupa espacio.
export function SaveStatusIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <span className={`ds-save-status ds-save-status-${state}`}>
      {state === 'saving' && <><Loader2 size={13} className="animate-spin" /> Guardando...</>}
      {state === 'saved' && <><Check size={13} /> Guardado</>}
      {state === 'error' && <><AlertTriangle size={13} /> Error al guardar</>}
    </span>
  )
}
