import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Search } from 'lucide-react'

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`ds-field ${className}`.trim()}>
      <span className="ds-field-label">{label}</span>
      {children}
      {hint && <span className="ds-field-hint">{hint}</span>}
    </label>
  )
}

/* className se MEZCLA con las clases del sistema, no las reemplaza: antes un
   `<Textarea className="mt-3">` perdia ds-input entero y quedaba el control nativo sin estilo. */
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ds-input ${className}`.trim()} {...props} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ds-input ds-textarea ${className}`.trim()} {...props} />
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder?: string }) {
  return (
    <label className="ds-search-box">
      <Search size={15} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}
