import { useEffect, useRef, useState } from 'react'

// Anima un numero hacia su valor objetivo (conteo ascendente/descendente) en vez de saltar directo.
export function useCountUp(target: number | null, durationMs = 500) {
  const [value, setValue] = useState(target ?? 0)
  const frame = useRef<number>(0)
  const from = useRef(target ?? 0)

  useEffect(() => {
    if (target === null) { setValue(0); return }
    from.current = value
    const start = performance.now()
    const startValue = from.current
    const delta = target - startValue

    function tick(now: number) {
      const elapsed = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - elapsed) * (1 - elapsed)
      setValue(startValue + delta * eased)
      if (elapsed < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}
