import { useCountUp } from '../useCountUp'
import { semaphoreColor } from '../tokens'

export function ProgressBar({ percent, color: colorOverride, height = 8 }: { percent: number; color?: string; height?: number }) {
  const animated = useCountUp(percent)
  const color = colorOverride || semaphoreColor(percent)
  return (
    <div className="ds-progress-bar" style={{ height }}>
      <div className="ds-progress-bar-fill" style={{ width: `${Math.max(0, Math.min(100, animated))}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }} />
    </div>
  )
}
