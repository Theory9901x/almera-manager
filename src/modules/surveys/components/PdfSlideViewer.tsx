import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

// Visor propio en vez del iframe nativo del navegador: Chrome/Firefox/Safari cada uno muestra su
// propia barra de herramientas y panel de miniaturas de forma distinta (o no permite ocultarlos),
// asi que para que el personal del hospital vea SOLO la diapositiva, sin importar el navegador,
// se renderiza pagina por pagina a un <canvas> con PDF.js y una barra de navegacion propia.
export function PdfSlideViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    pdfjsLib.getDocument(url).promise.then(doc => {
      if (cancelled) return
      docRef.current = doc
      setPageCount(doc.numPages)
      setPageNumber(1)
      setLoading(false)
    }).catch(() => { if (!cancelled) { setError('No fue posible cargar la presentación'); setLoading(false) } })
    return () => {
      cancelled = true
      docRef.current?.destroy()
      docRef.current = null
    }
  }, [url])

  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!doc || !canvas || !container || loading) return
    let cancelled = false

    async function render() {
      const page = await doc!.getPage(pageNumber)
      if (cancelled) return
      const unscaled = page.getViewport({ scale: 1 })
      const scale = container!.clientWidth / unscaled.width
      const viewport = page.getViewport({ scale })
      const context = canvas!.getContext('2d')
      if (!context) return
      canvas!.width = viewport.width
      canvas!.height = viewport.height
      const task = page.render({ canvasContext: context, viewport })
      renderTaskRef.current = task
      await task.promise.catch(() => {})
    }
    void render()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
    }
  }, [pageNumber, loading])

  if (error) return <p className="survey-config-empty" style={{ padding: 24 }}>{error}</p>

  return (
    <div ref={containerRef} className="survey-pdf-viewer">
      {loading ? (
        <div className="survey-pdf-viewer-loading"><Loader2 size={20} className="animate-spin" /></div>
      ) : (
        <canvas ref={canvasRef} className="survey-pdf-viewer-canvas" />
      )}
      {pageCount > 1 && (
        <div className="survey-pdf-viewer-nav">
          <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber(current => current - 1)} aria-label="Diapositiva anterior"><ChevronLeft size={18} /></button>
          <span>{pageNumber} / {pageCount}</span>
          <button type="button" disabled={pageNumber >= pageCount} onClick={() => setPageNumber(current => current + 1)} aria-label="Siguiente diapositiva"><ChevronRight size={18} /></button>
        </div>
      )}
    </div>
  )
}
