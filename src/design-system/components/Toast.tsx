import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { toastMotion } from '../motion'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem { id: number; tone: ToastTone; message: string }

interface ToastContextValue { push(tone: ToastTone, message: string): void }
const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastTone, typeof CheckCircle2> = { success: CheckCircle2, error: AlertTriangle, info: Info }

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++
    setItems(current => [...current, { id, tone, message }])
    window.setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 3500)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ds-toast-stack">
        <AnimatePresence>
          {items.map(item => {
            const Icon = ICONS[item.tone]
            return (
              <motion.div key={item.id} variants={toastMotion} initial="hidden" animate="visible" exit="exit" className={`ds-toast ds-toast-${item.tone}`}>
                <Icon size={16} />
                <span>{item.message}</span>
                <button onClick={() => setItems(current => current.filter(other => other.id !== item.id))} aria-label="Cerrar"><X size={14} /></button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider')
  return context
}
