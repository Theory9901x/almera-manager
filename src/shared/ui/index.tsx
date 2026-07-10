import { Search } from 'lucide-react'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent'

export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button className={`ui-button ui-button-${variant} ${className}`} {...props}>{children}</button>
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-symbol ${compact ? 'is-compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path className="brand-symbol-top" d="M47 14 32 5 10 18v22l14 9 9-6-14-9V23l13-8 10 6 5-7Z" />
        <path className="brand-symbol-bottom" d="m17 50 15 9 22-13V24l-14-9-9 6 14 9v11l-13 8-10-6-5 7Z" />
        <path className="brand-symbol-line" d="M35 27h11l4-4h7M29 37H18l-4 4H7" />
        <circle className="brand-symbol-node" cx="58" cy="23" r="2.5" />
        <circle className="brand-symbol-node" cx="6" cy="41" r="2.5" />
      </svg>
    </span>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`ui-card ${className}`}>{children}</section>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function SectionHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="section-actions">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, detail, tone = 'neutral' }: { label: string; value: string | number; detail?: string; tone?: Tone }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </article>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`ui-badge tone-${tone}`}>{children}</span>
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone = status.includes('CLOSED') || status.includes('APPROVED') || status.includes('Activo') ? 'success'
    : status.includes('PENDING') || status.includes('Pendiente') ? 'warning'
    : status.includes('RETURNED') || status.includes('Inactivo') ? 'danger'
    : 'info'
  return <Badge tone={tone}>{status}</Badge>
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="ui-field"><span>{label}</span>{children}</label>
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder: string }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>
}
