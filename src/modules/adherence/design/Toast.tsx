import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'

export function ToastStack({ notice, error, onDismissError }: { notice: string; error: string; onDismissError(): void }) {
  return (
    <div className="adherence-toast-stack">
      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="adherence-toast adherence-toast-error"
          >
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button onClick={onDismissError} aria-label="Cerrar"><X size={14} /></button>
          </motion.div>
        )}
        {notice && (
          <motion.div
            key="notice"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="adherence-toast adherence-toast-success"
          >
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
