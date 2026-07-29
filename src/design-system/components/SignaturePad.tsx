import { useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'

// Lienzo de firma manuscrita para tablet. Usa Pointer Events (no touch/mouse por separado):
// una sola ruta de codigo cubre dedo, lapiz optico y raton, y `setPointerCapture` evita que el
// trazo se corte si el dedo se sale del lienzo a mitad de la firma.
//
// El canvas se dibuja a la densidad real del dispositivo (devicePixelRatio) y se exporta a un
// tamano logico fijo: si se exportara el canvas escalado, en una tablet retina cada firma
// pesaria el cuadruple sin verse mejor en el informe.
const LOGICAL_WIDTH = 600
const LOGICAL_HEIGHT = 180

export function SignaturePad({ onChange }: { onChange(dataUrl: string | null): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasStroke = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = LOGICAL_WIDTH * ratio
    canvas.height = LOGICAL_HEIGHT * ratio
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    context.lineWidth = 2.2
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#0f172a'
  }, [])

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    // El lienzo se muestra a un ancho responsive pero se dibuja en coordenadas logicas fijas,
    // asi que hay que convertir de pixeles de pantalla a esas coordenadas.
    return {
      x: ((event.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
    }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.setPointerCapture(event.pointerId)
    drawing.current = true
    const point = pointFrom(event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    // Un toque simple sin arrastre tambien debe dejar marca (un punto), no nada.
    context.lineTo(point.x + 0.1, point.y)
    context.stroke()
    hasStroke.current = true
    setEmpty(false)
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const point = pointFrom(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (hasStroke.current) onChange(canvasRef.current?.toDataURL('image/png') || null)
  }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
    hasStroke.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        className="signature-pad-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
      />
      {empty && <span className="signature-pad-hint">Firma aquí con el dedo o el lápiz</span>}
      <button type="button" className="signature-pad-clear" onClick={clear} title="Borrar firma">
        <Eraser size={13} /> Borrar
      </button>
    </div>
  )
}
