import { useRef, useState } from 'react'
import { ExternalLink, FileText, Loader2, Presentation, X } from 'lucide-react'
import { surveysService } from '../services/surveysService'

const ACCEPT = '.ppt,.pptx,.pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf'

// Presentacion de apoyo por pagina (guias clinicas): sube el archivo de inmediato, igual que
// ImageUploadButton, y guarda solo la URL + nombre original resultantes en la pagina.
export function PageAttachmentButton({ surveyId, url, name, onChange }: {
  surveyId: string
  url?: string | null
  name?: string | null
  onChange(attachment: { url: string | null; name: string | null }): void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const result = await surveysService.uploadMedia(surveyId, file)
      onChange({ url: result.url, name: result.originalName || file.name })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible subir el archivo')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (url) {
    return (
      <div className="survey-attachment-chip">
        <FileText size={15} />
        <span className="min-w-0 flex-1 truncate">{name || 'Presentación adjunta'}</span>
        <a href={url} target="_blank" rel="noreferrer" title="Abrir en una pestaña nueva"><ExternalLink size={13} /></a>
        <button type="button" onClick={() => onChange({ url: null, name: null })} aria-label="Quitar presentación"><X size={13} /></button>
      </div>
    )
  }

  return (
    <label className="survey-attachment-upload">
      <input ref={inputRef} type="file" accept={ACCEPT} onChange={event => handleFile(event.target.files?.[0])} hidden />
      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />}
      {uploading ? 'Subiendo…' : 'Adjuntar presentación (PPT o PDF, máx. 60MB)'}
      {error && <span className="survey-field-error">{error}</span>}
    </label>
  )
}
