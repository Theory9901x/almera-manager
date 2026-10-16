import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { moduleIdentity } from '@/design-system'
import {
  IMPACT_LEVELS, PROBABILITY_LEVELS, RISK_TYPES, ZONES, impactLevel, probabilityLevel, zoneOf,
  type RiskTypeKey, type ZoneKey,
} from '../../../../shared/riskScoring.mjs'
import type { HeatGrid } from '../types'

export const identity = moduleIdentity('risks')

export const TYPE_COLORS: Record<RiskTypeKey, string> = {
  GESTION: '#2563eb',
  CORRUPCION: '#be123c',
  SEGURIDAD_DIGITAL: '#0891b2',
  FISCAL: '#7c3aed',
}

export const ACTION_STATUS_LABELS = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', TERMINADA: 'Terminada', CANCELADA: 'Cancelada' } as const
export const MAT_STATUS_LABELS = { REPORTADA: 'Reportada', EN_ANALISIS: 'En análisis', EN_TRATAMIENTO: 'En tratamiento', CERRADA: 'Cerrada' } as const
export const LINE_LABELS = { PRIMERA: 'Primera línea', SEGUNDA: 'Segunda línea', TERCERA: 'Tercera línea' } as const
export const LINE_HINTS = {
  PRIMERA: 'Líder del proceso: autoevaluación de sus riesgos y controles.',
  SEGUNDA: 'Planeación / calidad: monitoreo y asesoría de la gestión del riesgo.',
  TERCERA: 'Control Interno: evaluación independiente, corte cuatrimestral.',
} as const
export const CONCLUSION_LABELS = { ADECUADO: 'Adecuado', REQUIERE_AJUSTES: 'Requiere ajustes', CRITICO: 'Crítico' } as const
export const TEST_LABELS = { EFECTIVO: 'Efectivo', PARCIAL: 'Parcialmente efectivo', NO_EFECTIVO: 'No efectivo' } as const
export const PARTY_LABELS: Record<string, string> = {
  LIDER_PROCESO: 'Líder del proceso',
  SEGUNDA_LINEA: 'Segunda línea (planeación / calidad)',
  CONTROL_INTERNO: 'Oficina de Control Interno',
  GERENCIA: 'Gerencia',
  COMITE_CONTROL_INTERNO: 'Comité Institucional de Coordinación de Control Interno',
  FISCALIA: 'Fiscalía General de la Nación',
  PROCURADURIA: 'Procuraduría General de la Nación',
  CONTRALORIA: 'Contraloría',
  SUPERSALUD: 'Superintendencia Nacional de Salud',
  OTRO_ENTE: 'Otro ente de control',
}
export const EXTERNAL_PARTIES = ['FISCALIA', 'PROCURADURIA', 'CONTRALORIA', 'SUPERSALUD', 'OTRO_ENTE']

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value).slice(0, 10)) && String(value).length <= 10
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(new Date(value))
}
export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
export function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value))
}
/** Fecha ISO local de hoy (AAAA-MM-DD) para valores por defecto de los DatePicker. */
export function todayIso() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Insignia de zona. El color viaja como VARIABLE para que el tema oscuro pueda ajustar el texto. */
export function ZoneBadge({ zone, size = 'md', label }: { zone: ZoneKey | null | undefined; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  if (!zone) return <span className={`rsk-zone is-empty is-${size}`}>Sin valorar</span>
  const def = ZONES[zone]
  return (
    <span className={`rsk-zone is-${size} is-${zone.toLowerCase()}`} style={{ ['--zone' as string]: def.color }}>
      <i aria-hidden="true" />{label ? `${label} · ` : ''}{def.name}
    </span>
  )
}

export function TypeBadge({ type }: { type: RiskTypeKey }) {
  return <span className="rsk-type" style={{ ['--type' as string]: TYPE_COLORS[type] }}>{RISK_TYPES[type]?.short || type}</span>
}

export function LevelPair({ probability, impact }: { probability: number | null | undefined; impact: number | null | undefined }) {
  return (
    <span className="rsk-levels">
      <span title="Probabilidad">{probabilityLevel(probability)?.name || '—'}</span>
      <span className="rsk-levels-sep">×</span>
      <span title="Impacto">{impactLevel(impact)?.name || '—'}</span>
    </span>
  )
}

/**
 * Mapa de calor 5x5. Dos usos:
 *  - tablero: `grid` con los riesgos de cada celda (burbuja con el conteo, clic filtra);
 *  - ficha de un riesgo: `markers` con la posicion inherente/residual de ESE riesgo.
 */
export function HeatMap({ grid, markers, onCellClick, selected, compact = false, title }: {
  grid?: HeatGrid
  markers?: { probability: number; impact: number; label: string; tone: 'inherent' | 'residual' }[]
  onCellClick?: (probability: number, impact: number) => void
  selected?: { probability: number; impact: number } | null
  compact?: boolean
  title?: string
}) {
  return (
    <div className={`rsk-heat ${compact ? 'is-compact' : ''}`}>
      {title && <p className="rsk-heat-title">{title}</p>}
      <div className="rsk-heat-body">
        <span className="rsk-heat-axis is-y">Probabilidad</span>
        <div className="rsk-heat-grid">
          {PROBABILITY_LEVELS.slice().reverse().map(prob => (
            <div className="rsk-heat-row" key={prob.level}>
              <span className="rsk-heat-label is-row">{prob.name}<small>{prob.percent}%</small></span>
              {IMPACT_LEVELS.map(imp => {
                const zone = zoneOf(prob.level, imp.level) as ZoneKey
                const chips = grid?.[prob.level]?.[imp.level] || []
                const cellMarkers = (markers || []).filter(marker => marker.probability === prob.level && marker.impact === imp.level)
                const isSelected = selected?.probability === prob.level && selected?.impact === imp.level
                const clickable = Boolean(onCellClick && chips.length)
                return (
                  <button
                    type="button"
                    key={imp.level}
                    className={`rsk-heat-cell is-${zone.toLowerCase()} ${chips.length ? 'has-risks' : ''} ${isSelected ? 'is-selected' : ''}`}
                    style={{ ['--zone' as string]: ZONES[zone].color }}
                    onClick={() => clickable && onCellClick!(prob.level, imp.level)}
                    disabled={!clickable}
                    title={`${prob.name} × ${imp.name} = ${ZONES[zone].name}${chips.length ? ` · ${chips.length} riesgo(s)` : ''}`}
                  >
                    {chips.length > 0 && <span className="rsk-heat-count">{chips.length}</span>}
                    {cellMarkers.map(marker => <span key={marker.label} className={`rsk-heat-marker is-${marker.tone}`}>{marker.label}</span>)}
                  </button>
                )
              })}
            </div>
          ))}
          <div className="rsk-heat-row is-foot">
            <span className="rsk-heat-label is-row" />
            {IMPACT_LEVELS.map(imp => <span key={imp.level} className="rsk-heat-label is-col">{imp.name}<small>{imp.percent}%</small></span>)}
          </div>
        </div>
      </div>
      <span className="rsk-heat-axis is-x">Impacto</span>
    </div>
  )
}

/** Barra apilada de distribucion por zona. */
export function ZoneBar({ data }: { data: { zone: ZoneKey; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (!total) return <div className="rsk-zonebar is-empty" />
  return (
    <div className="rsk-zonebar">
      {data.filter(item => item.value > 0).map(item => (
        <span key={item.zone} style={{ flexGrow: item.value, ['--zone' as string]: ZONES[item.zone].color }} title={`${ZONES[item.zone].name}: ${item.value}`}>{item.value}</span>
      ))}
    </div>
  )
}

export function Progress({ value, tone }: { value: number; tone?: 'danger' | 'ok' }) {
  return <span className={`rsk-progress ${tone ? `is-${tone}` : ''}`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>
}

/** Ventana modal del modulo. Va por encima de todo (`--z-overlay`) y cierra con Escape. */
export function RiskModal({ title, eyebrow, onClose, children, footer, size = 'md' }: {
  title: string
  eyebrow?: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [onClose])
  return (
    <div className="rsk-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`rsk-modal is-${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="rsk-modal-head">
          <div>
            {eyebrow && <p className="rsk-eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="rsk-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="rsk-modal-body">{children}</div>
        {footer && <footer className="rsk-modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

/** Grupo de opciones tipo tarjeta (segmentado), para elecciones con explicacion corta. */
export function ChoiceCards<T extends string>({ value, onChange, options, columns = 4 }: {
  value: T | null | undefined
  onChange(value: T): void
  options: { value: T; label: string; hint?: string; color?: string; disabled?: boolean }[]
  columns?: number
}) {
  return (
    <div className="rsk-choices" style={{ ['--cols' as string]: columns }}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          className={`rsk-choice ${value === option.value ? 'is-on' : ''}`}
          style={option.color ? { ['--choice' as string]: option.color } : undefined}
          onClick={() => !option.disabled && onChange(option.value)}
          disabled={option.disabled}
        >
          <strong>{option.label}</strong>
          {option.hint && <span>{option.hint}</span>}
        </button>
      ))}
    </div>
  )
}
