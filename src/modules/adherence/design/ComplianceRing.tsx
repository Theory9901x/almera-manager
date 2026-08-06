import { useId } from 'react'
import { colorForPercent } from './scopeColors'
import { useCountUp } from './useCountUp'

/**
 * Anillo de cumplimiento. Se queda en SVG propio (no en el motor ECharts del design system,
 * ver Charts.tsx#RadialGauge) a proposito: la matriz llega a dibujar hasta 25 de estos a la vez
 * (uno por columna de HC) y montar 25 instancias de ECharts ahi seria notoriamente mas lento sin
 * aportar nada que este SVG no de ya. Lo que se mejora es el propio trazo: degradado + brillo
 * sutil en vez de un color plano, que es lo que hacia sentir "generico" al anillo grande de las
 * tarjetas de resumen.
 */
export function ComplianceRing({ percent, size = 34, strokeWidth = 4, showLabel = true, color: colorOverride }: { percent: number | null; size?: number; strokeWidth?: number; showLabel?: boolean; color?: string }) {
  const gradientId = useId()
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const hasData = percent !== null
  const animated = useCountUp(percent)
  const clamped = hasData ? Math.max(0, Math.min(100, animated)) : 0
  const offset = circumference - (clamped / 100) * circumference
  const color = colorOverride || colorForPercent(percent)

  return (
    <span className="compliance-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {/* Degradado del propio color hacia una version mas clara — nunca un tono inventado:
              el semaforo (§5.1) sigue siendo el que decide `color`, esto solo le da profundidad. */}
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.72" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--compliance-ring-track, #E2E8F0)" strokeWidth={strokeWidth}
          strokeDasharray={hasData ? undefined : `${circumference / 22} ${circumference / 22}`}
        />
        {hasData && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={`url(#${gradientId})`} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 400ms ease, stroke 200ms ease', filter: size >= 60 ? `drop-shadow(0 0 5px color-mix(in srgb, ${color} 55%, transparent))` : undefined }}
          />
        )}
      </svg>
      {showLabel && (
        <span className="compliance-ring-label" style={{ color: hasData ? color : 'var(--compliance-ring-track, #94A3B8)', fontSize: size * 0.28 }}>
          {hasData ? `${Math.round(animated)}` : '—'}
        </span>
      )}
    </span>
  )
}
