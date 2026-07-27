import { useRef, useState } from 'react'
import { Camera, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react'
import { Button, Card, Textarea, moduleIdentity } from '@/design-system'
import type { ChecklistEvidence } from '../types'

const identity = moduleIdentity('checklists')

const MAX_MB = 10
const humanSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`

/**
 * Observaciones generales y evidencias de la ronda.
 *
 * "Tomar foto" usa `capture="environment"` en un input de archivo: en tablet abre la camara
 * trasera directamente, y en escritorio se comporta como un selector normal. No hace falta
 * getUserMedia ni permisos aparte, y funciona sin conexion igual que el resto del formulario.
 */
export function EvidencesCard({ auditId, evidences, notes, closed, evidenceUrl, onUpload, onRemove, onNotesChange }: {
  auditId: string
  evidences: ChecklistEvidence[]
  notes: string
  closed: boolean
  evidenceUrl(auditId: string, evidenceId: string): string
  onUpload(file: File): Promise<void>
  onRemove(evidenceId: string): Promise<void>
  onNotesChange(notes: string): void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    // Se comprueba aqui tambien, no solo en el servidor: subir 40 MB desde una tablet con datos
    // moviles para que el servidor lo rechace al final es tirar la conexion del auditor.
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`"${file.name}" pesa ${humanSize(file.size)}. El máximo son ${MAX_MB} MB.`)
      return
    }
    setError(null)
    setBusy(true)
    try { await onUpload(file) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible subir el archivo') }
    finally { setBusy(false) }
  }

  return (
    <div className="eval-footer">
      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Observaciones</p>
        <h2 className="mt-1 text-xl font-black">Observaciones generales</h2>
        <Textarea
          rows={5}
          className="mt-3"
          maxLength={4000}
          disabled={closed}
          value={notes}
          placeholder="Escribe aquí las observaciones generales sobre la ronda…"
          onChange={event => onNotesChange(event.target.value)}
        />
        <p className="eval-counter-hint">{notes.length} / 4000 caracteres</p>
      </Card>

      <Card accent={identity.color} className="p-5">
        <p className="ds-eyebrow">Respaldo</p>
        <h2 className="mt-1 text-xl font-black">Evidencias</h2>

        {!closed && (
          <>
            <div
              className={`eval-drop ${dragging ? 'is-over' : ''}`}
              onDragOver={event => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={event => { event.preventDefault(); setDragging(false); void handle(event.dataTransfer.files) }}
            >
              <Upload size={26} />
              <p><strong>Arrastra y suelta archivos aquí</strong><br />o elige una opción</p>
              <div className="eval-drop-actions">
                <Button variant="secondary" onClick={() => cameraInput.current?.click()} disabled={busy}>
                  <Camera size={15} /> Tomar foto
                </Button>
                <Button identity={identity} onClick={() => fileInput.current?.click()} disabled={busy}>
                  <Paperclip size={15} /> {busy ? 'Subiendo…' : 'Subir archivo'}
                </Button>
              </div>
              <small>JPG, PNG, WEBP, HEIC o PDF · máximo {MAX_MB} MB por archivo</small>
            </div>
            {/* Dos inputs y no uno: `capture` en el mismo campo obligaria a usar siempre la
                camara, y a veces el auditor quiere adjuntar un PDF que ya tiene. */}
            <input
              ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
              onChange={event => { void handle(event.target.files); event.target.value = '' }}
            />
            <input
              ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/heic,application/pdf" hidden
              onChange={event => { void handle(event.target.files); event.target.value = '' }}
            />
          </>
        )}

        {error && <p className="eval-drop-error">{error}</p>}

        {evidences.length > 0 ? (
          <ul className="eval-evidences">
            {evidences.map(evidence => {
              const isImage = evidence.mime_type.startsWith('image/')
              return (
                <li key={evidence.id}>
                  <a href={evidenceUrl(auditId, evidence.id)} target="_blank" rel="noreferrer" className="eval-evidence-link">
                    <span className="eval-evidence-icon">{isImage ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
                    <span className="min-w-0">
                      <strong>{evidence.original_name}</strong>
                      <small>{humanSize(evidence.size_bytes)}{evidence.uploaded_by_name ? ` · ${evidence.uploaded_by_name}` : ''}</small>
                    </span>
                  </a>
                  {!closed && (
                    <button className="row-action is-danger" title="Quitar" onClick={() => void onRemove(evidence.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="survey-config-hint mt-3">
            {closed ? 'Esta ronda no tiene evidencias adjuntas.' : 'Aún no hay evidencias. Adjunta fotos o documentos que respalden lo calificado.'}
          </p>
        )}
      </Card>
    </div>
  )
}
