import type { ComponentType, ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useCountUp } from '@/design-system'

export type KpiStatus = 'favorable' | 'warning' | 'critical' | 'neutral'

const STATUS_LABEL: Record<KpiStatus, string> = { favorable: 'Favorable', warning: 'Atención', critical: 'Crítico', neutral: 'Sin meta' }

/**
 * Tarjeta KPI del dashboard: valor con count-up, comparacion %, flecha de tendencia y estado
 * (favorable/atencion/critico). El "sin dato" es un estado explicito, no un card vacio silencioso.
 */
export function KpiCard({ icon: Icon, label, value, unit, trendPercent, status = 'neutral', detail, loading, tooltip }: {
  icon?: ComponentType<{ size?: number | string }>
  label: string
  value: number | null
  unit?: string
  trendPercent?: number | null
  status?: KpiStatus
  detail?: ReactNode
  loading?: boolean
  tooltip?: string
}) {
  const animated = useCountUp(value)
  const digits = value != null && Math.abs(value) < 10 ? 2 : value != null && Math.abs(value) < 1000 ? 1 : 0

  if (loading) {
    return <div className="hc2-kpi hc2-kpi-skeleton"><div className="hc2-skel-line short" /><div className="hc2-skel-line long" /></div>
  }

  return (
    <div className={`hc2-kpi hc2-kpi-${status}`} title={tooltip}>
      <div className="hc2-kpi-top">
        {Icon && <span className="hc2-kpi-icon"><Icon size={16} /></span>}
        <span className="hc2-kpi-label">{label}</span>
      </div>
      {value == null ? (
        <div className="hc2-kpi-empty">Sin dato aún</div>
      ) : (
        <div className="hc2-kpi-value">
          {animated.toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits })}
          {unit && <span className="hc2-kpi-unit">{unit}</span>}
        </div>
      )}
      <div className="hc2-kpi-foot">
        {trendPercent != null && (
          <span className={`hc2-kpi-trend ${trendPercent > 0.5 ? 'is-up' : trendPercent < -0.5 ? 'is-down' : 'is-flat'}`}>
            {trendPercent > 0.5 ? <ArrowUpRight size={12} /> : trendPercent < -0.5 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(trendPercent).toFixed(1)}%
          </span>
        )}
        <span className="hc2-kpi-status">{STATUS_LABEL[status]}</span>
      </div>
      {detail && <div className="hc2-kpi-detail">{detail}</div>}
    </div>
  )
}
