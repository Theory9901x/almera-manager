import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Search } from 'lucide-react'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="ds-field">
      <span className="ds-field-label">{label}</span>
      {children}
      {hint && <span className="ds-field-hint">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ds-input" {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="ds-input ds-textarea" {...props} />
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder?: string }) {
  return (
    <label className="ds-search-box">
      <Search size={15} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}
