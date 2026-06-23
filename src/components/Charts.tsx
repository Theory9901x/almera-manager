// Pure-SVG chart components — no external dependencies

type Segment = { label: string; value: number; color: string }
type Bar     = { label: string; ok: number; total: number; color: string }

const toRad = (d: number) => (d * Math.PI) / 180
const f     = (n: number) => n.toFixed(1)

// ── PieDonut ─────────────────────────────────────────────────────────────────
export function PieDonut({
  segments,
  size   = 140,
  outerR = 52,
  innerR = 32,
  center,
  sub,
}: {
  segments: Segment[]
  size?:    number
  outerR?:  number
  innerR?:  number
  center?:  string | number
  sub?:     string
}) {
  const cx    = size / 2
  const cy    = size / 2
  const total = segments.reduce((s, x) => s + x.value, 0)
  const active = segments.filter(s => s.value > 0)

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#f1f5f9" strokeWidth={outerR - innerR + 2}/>
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill="#94a3b8">Sin datos</text>
      </svg>
    )
  }

  if (active.length === 1) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={outerR} fill={active[0].color} opacity={0.85}/>
        <circle cx={cx} cy={cy} r={innerR} fill="white"/>
        {center != null && (
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize="17" fontWeight="800" fill="#1e293b">{center}</text>
        )}
        {sub && (
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize="8" fill="#94a3b8">{sub.toUpperCase()}</text>
        )}
      </svg>
    )
  }

  const GAP = 2
  let angle = -90

  const paths = active.map(seg => {
    const sweep  = Math.max((seg.value / total) * 360 - GAP, 0.5)
    const startA = angle + GAP / 2
    angle += (seg.value / total) * 360
    const endA = startA + sweep
    const large = sweep > 180 ? 1 : 0

    const x1  = cx + outerR * Math.cos(toRad(startA)); const y1  = cy + outerR * Math.sin(toRad(startA))
    const x2  = cx + outerR * Math.cos(toRad(endA));   const y2  = cy + outerR * Math.sin(toRad(endA))
    const xi1 = cx + innerR * Math.cos(toRad(startA)); const yi1 = cy + innerR * Math.sin(toRad(startA))
    const xi2 = cx + innerR * Math.cos(toRad(endA));   const yi2 = cy + innerR * Math.sin(toRad(endA))

    return {
      seg,
      d: `M ${f(x1)} ${f(y1)} A ${outerR} ${outerR} 0 ${large} 1 ${f(x2)} ${f(y2)} L ${f(xi2)} ${f(yi2)} A ${innerR} ${innerR} 0 ${large} 0 ${f(xi1)} ${f(yi1)} Z`,
      pct: Math.round((seg.value / total) * 100),
    }
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map(({ seg, d, pct }, i) => (
        <path key={i} d={d} fill={seg.color} opacity={0.88}>
          <title>{seg.label}: {seg.value} · {pct}%</title>
        </path>
      ))}
      {center != null && (
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="17" fontWeight="800" fill="#1e293b">{center}</text>
      )}
      {sub && (
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize="8" fill="#94a3b8">{sub.toUpperCase()}</text>
      )}
    </svg>
  )
}

// ── ChartLegend ───────────────────────────────────────────────────────────────
export function ChartLegend({
  items,
}: {
  items: { label: string; value: number; color: string; pct?: number; sub?: string }[]
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: item.color }}/>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-600 leading-tight truncate flex-1">{item.label}</span>
              <span className="text-[11px] font-bold text-slate-700 flex-shrink-0">{item.value}</span>
              {item.pct !== undefined && (
                <span className="text-[10px] text-slate-400 w-7 text-right flex-shrink-0">{item.pct}%</span>
              )}
            </div>
            {item.sub && <p className="text-[10px] text-slate-400 leading-tight">{item.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── VBarChart ─────────────────────────────────────────────────────────────────
export function VBarChart({
  bars,
  chartHeight = 120,
}: {
  bars:        Bar[]
  chartHeight?: number
}) {
  const active = bars.filter(b => b.total > 0)
  if (active.length === 0) return null

  const PAD = { t: 24, r: 10, b: 46, l: 10 }
  const n   = active.length
  const W   = Math.max(n * 64 + PAD.l + PAD.r, 200)
  const H   = chartHeight + PAD.t + PAD.b
  const cH  = chartHeight
  const maxT = Math.max(...active.map(b => b.total))
  const gW  = (W - PAD.l - PAD.r) / n
  const bW  = Math.min(28, gW * 0.5)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
      {/* Gridlines */}
      {[0, 25, 50, 75, 100].map(p => {
        const y = PAD.t + cH - (p / 100) * cH
        return (
          <g key={p}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
              stroke={p === 0 ? '#e2e8f0' : '#f8fafc'} strokeWidth={p === 0 ? 1 : 0.5}/>
            {p > 0 && p < 100 && (
              <text x={PAD.l - 2} y={y + 3} textAnchor="end" fontSize="7" fill="#cbd5e1">{p}%</text>
            )}
          </g>
        )
      })}

      {active.map((b, i) => {
        const cx = PAD.l + i * gW + gW / 2
        const tH = maxT > 0 ? (b.total / maxT) * cH : 0
        const oH = b.total > 0 ? (b.ok / b.total) * tH : 0
        const pct = b.total > 0 ? Math.round((b.ok / b.total) * 100) : 0
        const barTop = PAD.t + cH - tH

        return (
          <g key={i}>
            {/* Total bar (background) */}
            <rect x={cx - bW / 2 - 3} y={barTop} width={bW + 6} height={tH} rx={3} fill="#f1f5f9"/>
            {/* Ok bar */}
            {oH > 0.5 && (
              <rect x={cx - bW / 2} y={PAD.t + cH - oH} width={bW} height={oH} rx={3} fill={b.color} opacity={0.85}/>
            )}
            {/* % label */}
            {b.total > 0 && (
              <text x={cx} y={barTop - 5} textAnchor="middle" fontSize="9" fontWeight="bold" fill={b.color}>{pct}%</text>
            )}
            {/* Category labels */}
            <text x={cx} y={PAD.t + cH + 13} textAnchor="middle" fontSize="9" fill="#64748b">{b.label}</text>
            <text x={cx} y={PAD.t + cH + 23} textAnchor="middle" fontSize="8" fill="#94a3b8">{b.ok}/{b.total}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── HBarChart ─────────────────────────────────────────────────────────────────
export function HBarChart({ bars }: { bars: Bar[] }) {
  const active = bars.filter(b => b.total > 0)
  if (active.length === 0) return null

  return (
    <div className="space-y-2.5">
      {active.map((b, i) => {
        const pct = b.total > 0 ? Math.round((b.ok / b.total) * 100) : 0
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-600 font-medium">{b.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">{b.ok}/{b.total}</span>
                <span className="text-[11px] font-bold" style={{ color: b.color }}>{pct}%</span>
              </div>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: b.color }}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}
