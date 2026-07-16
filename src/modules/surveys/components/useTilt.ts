import { useEffect, useRef } from 'react'

// Tilt 3D sutil (maximo 5 grados) que sigue al puntero dentro de la tarjeta y vuelve a plano al
// salir. Solo GPU-friendly transforms (perspective/rotate/translateZ). Se desactiva en touch y bajo
// prefers-reduced-motion (seccion 10.6): profundidad con intencion, nunca decoracion forzada.
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced) return

    let frame = 0
    function onMove(event: PointerEvent) {
      if (!node) return
      const rect = node.getBoundingClientRect()
      const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width
      const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rx = Math.max(-1, Math.min(1, -dy)) * 3.5
        const ry = Math.max(-1, Math.min(1, dx)) * 3.5
        node.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg)`
      })
    }
    function onLeave() {
      if (node) node.style.transform = ''
    }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    return () => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(frame)
    }
  }, [])

  return ref
}
