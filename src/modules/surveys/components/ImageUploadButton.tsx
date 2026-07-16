import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { surveysService } from '../services/surveysService'

// Boton compacto para adjuntar la imagen de una opcion (seleccion con imagenes / emparejamiento).
// Sube el archivo de inmediato y guarda solo la URL publica resultante en la config de la pregunta.
export function ImageUploadButton({ surveyId, value, onChange }: { surveyId: string; value?: string; onChange(url: string | undefined): void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const result = await surveysService.uploadMedia(surveyId, file)
      onChange(result.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible subir la imagen')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (value) {
    return (
      <span className="survey-image-thumb">
        <img src={value} alt="" />
        <button type="button" onClick={() => onChange(undefined)} aria-label="Quitar imagen"><X size={11} /></button>
      </span>
    )
  }

  return (
    <label className="survey-image-upload">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => handleFile(event.target.files?.[0])} hidden />
      {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
      {error && <span className="survey-field-error" style={{ position: 'absolute' }}>{error}</span>}
    </label>
  )
}
