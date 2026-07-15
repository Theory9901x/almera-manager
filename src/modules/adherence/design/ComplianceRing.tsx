import { colorForPercent } from './scopeColors'
import { useCountUp } from './useCountUp'

export function ComplianceRing({ percent, size = 34, strokeWidth = 4, showLabel = true, color: colorOverride }: { percent: number | null; size?: number; strokeWidth?: number; showLabel?: boolean; color?: string }) {
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
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth}
          strokeDasharray={hasData ? undefined : `${circumference / 22} ${circumference / 22}`}
        />
        {hasData && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 400ms ease, stroke 200ms ease' }}
          />
        )}
      </svg>
      {showLabel && (
        <span className="compliance-ring-label" style={{ color: hasData ? color : '#94A3B8', fontSize: size * 0.28 }}>
          {hasData ? `${Math.round(animated)}` : '—'}
        </span>
      )}
    </span>
  )
}
