import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, Download, Loader2, Paperclip, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { Badge, Button, Field, Input, moduleIdentity, useToast } from '@/design-system'
import { radicadosService } from '../services/radicadosService'
import type { RadicadoDetail } from '../types'

const identity = moduleIdentity('radicados')

const ACCION_LABELS: Record<string, string> = {
  CREADO: 'Generado',
  ANULADO: 'Anulado',
  ADJUNTO_SUBIDO: 'Adjunto subido',
  ELIMINADO: 'Eliminado',
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Detalle de un radicado: info completa + adjuntos + trazabilidad + anulación/eliminación. El
 *  radicado en sí no tiene ningún campo editable — solo se le pueden AGREGAR adjuntos, anularlo
 *  o (superadmin) eliminarlo. Anular y eliminar son acciones DISTINTAS: anular invalida un
 *  número a la vista, con su motivo; eliminar lo saca de las vistas normales (datos de prueba,
 *  duplicados por error de captura) sin borrarlo — sigue en la base y en esta misma auditoría. */
export function RadicadoDetailDialog({ radicado, canVoid, canDelete, onClose, onChanged }: {
  radicado: RadicadoDetail | null
  canVoid: boolean
  canDelete: boolean
  onClose(): void
  /** `closing: true` cuando el cambio va a cerrar el dialogo (eliminar): evita que el refetch
   *  del detalle, que resuelve DESPUES de `onClose`, reabra el dialogo con el registro recien
   *  eliminado — una carrera real que se veia en pantalla antes de este flag. */
  onChanged(options?: { closing?: boolean }): void
}) {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [showVoidForm, setShowVoidForm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMotivo, setDeleteMotivo] = useState('')
  const [showDeleteForm, setShowDeleteForm] = useState(false)

  if (!radicado) return null

  async function uploadFile(file: File) {
    if (!radicado) return
    setUploading(true)
    try {
      await radicadosService.uploadAdjunto(radicado.id, file)
      toast.push('success', 'Adjunto subido')
      onChanged()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible subir el adjunto') }
    finally { setUploading(false) }
  }

  async function confirmVoid() {
    if (!radicado || !motivo.trim()) return
    setVoiding(true)
    try {
      await radicadosService.anular(radicado.id, motivo.trim())
      toast.push('success', 'Radicado anulado')
      setShowVoidForm(false)
      setMotivo('')
      onChanged()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible anular') }
    finally { setVoiding(false) }
  }

  async function confirmDelete() {
    if (!radicado || !deleteMotivo.trim()) return
    setDeleting(true)
    try {
      await radicadosService.eliminar(radicado.id, deleteMotivo.trim())
      toast.push('success', 'Radicado eliminado')
      setShowDeleteForm(false)
      setDeleteMotivo('')
      onChanged({ closing: true })
      onClose()
    } catch (cause) { toast.push('error', cause instanceof Error ? cause.message : 'No fue posible eliminar') }
    finally { setDeleting(false) }
  }

  return createPortal(
    <div className="ds-confirm-backdrop" onClick={onClose}>
      <div className="ds-confirm start-audit" style={{ maxWidth: 620 }} role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <button className="ds-confirm-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        <div className="ds-confirm-icon" style={{ background: `${identity.color}1f`, color: identity.color }}>
          <ShieldCheck size={22} />
        </div>
        <h2 style={{ fontVariantNumeric: 'tabular-nums' }}>{radicado.numero_radicado}</h2>
        <p className="ds-confirm-body">
          {radicado.deleted_at && <Badge tone="danger">Eliminado</Badge>}
          {' '}<Badge tone={radicado.estado === 'ANULADO' ? 'danger' : 'success'}>{radicado.estado === 'ANULADO' ? 'Anulado' : 'Activo'}</Badge>
          {' '}· {radicado.tipo_nombre}{radicado.direccion ? ` · ${radicado.direccion === 'RECIBIDO' ? 'Recibido' : 'Enviado'}` : ''} · {radicado.categoria_nombre}
        </p>

        <div className="start-audit-form" style={{ textAlign: 'left' }}>
          <Field label="Objeto / asunto"><p>{radicado.objeto}</p></Field>
          <Field label="Medio"><p>{radicado.medio_nombre}</p></Field>
          {radicado.process_name && <Field label="Proceso"><p>{radicado.process_code} · {radicado.process_name}</p></Field>}
          <Field label="Remitente"><p>{radicado.remitente || '—'}</p></Field>
          <Field label="Destinatario"><p>{radicado.destinatario || '—'}</p></Field>
          <Field label="Generado por"><p>{radicado.created_by_name} · {new Date(radicado.fecha_radicado).toLocaleString('es-CO')}</p></Field>
        </div>

        {radicado.anulacion && (
          <div className="ds-confirm-body" style={{ background: 'var(--surface-soft)', borderRadius: 12, padding: 12, marginTop: 8 }}>
            <strong>Motivo de anulación:</strong> {radicado.anulacion.motivo}
            <br /><small>{radicado.anulacion.anulado_by_name} · {new Date(radicado.anulacion.anulado_at).toLocaleString('es-CO')}</small>
          </div>
        )}

        {radicado.deleted_at && (
          <div className="ds-confirm-body" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderRadius: 12, padding: 12, marginTop: 8 }}>
            <strong>Motivo de eliminación:</strong> {radicado.deleted_reason}
            <br /><small>{radicado.deleted_by_name} · {new Date(radicado.deleted_at).toLocaleString('es-CO')}</small>
          </div>
        )}

        <div className="start-audit-form" style={{ marginTop: 16 }}>
          <p className="ds-eyebrow"><Paperclip size={13} /> Adjuntos ({radicado.adjuntos.length})</p>
          {radicado.adjuntos.map(adjunto => (
            <a key={adjunto.id} className="row-action" style={{ ['--row-accent' as string]: identity.color, justifyContent: 'space-between' }}
               href={radicadosService.adjuntoUrl(radicado.id, adjunto.id)} target="_blank" rel="noreferrer">
              <span>{adjunto.original_name} <small>({formatBytes(adjunto.size_bytes)})</small></span>
              <Download size={13} />
            </a>
          ))}
          <input ref={fileInput} type="file" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.target.value = '' }} />
          <Button variant="secondary" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {uploading ? 'Subiendo…' : 'Agregar adjunto'}
          </Button>
        </div>

        <div className="start-audit-form" style={{ marginTop: 16 }}>
          <p className="ds-eyebrow">Trazabilidad</p>
          {radicado.auditoria.map(entry => (
            <p key={entry.id} style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <strong>{ACCION_LABELS[entry.accion] || entry.accion}</strong> — {entry.actor_name} · {new Date(entry.created_at).toLocaleString('es-CO')}
              {entry.detalle ? <>: {entry.detalle}</> : null}
            </p>
          ))}
        </div>

        {canVoid && radicado.estado === 'ACTIVO' && !radicado.deleted_at && (
          <div className="ds-confirm-actions" style={{ marginTop: 16 }}>
            {!showVoidForm ? (
              <Button variant="danger" onClick={() => setShowVoidForm(true)}><Ban size={15} /> Anular</Button>
            ) : (
              <div style={{ width: '100%' }}>
                <Field label="Motivo de la anulación *"><Input value={motivo} onChange={event => setMotivo(event.target.value)} placeholder="Explica el error a corregir" /></Field>
                <div className="ds-confirm-actions" style={{ marginTop: 8 }}>
                  <Button variant="secondary" onClick={() => setShowVoidForm(false)} disabled={voiding}>Cancelar</Button>
                  <Button variant="danger" disabled={voiding || !motivo.trim()} onClick={() => void confirmVoid()}>
                    {voiding ? 'Anulando…' : 'Confirmar anulación'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Eliminar es EXCLUSIVO de superadmin y funciona sobre CUALQUIER radicado, activo o
            anulado — a diferencia de anular, que solo aplica a uno activo. */}
        {canDelete && !radicado.deleted_at && (
          <div className="ds-confirm-actions" style={{ marginTop: canVoid && radicado.estado === 'ACTIVO' ? 8 : 16 }}>
            {!showDeleteForm ? (
              <Button variant="danger" onClick={() => setShowDeleteForm(true)}><Trash2 size={15} /> Eliminar</Button>
            ) : (
              <div style={{ width: '100%' }}>
                <Field label="Motivo de la eliminación *" hint="Datos de prueba, duplicado por error de captura, etc.">
                  <Input value={deleteMotivo} onChange={event => setDeleteMotivo(event.target.value)} placeholder="Explica por qué se elimina" />
                </Field>
                <div className="ds-confirm-actions" style={{ marginTop: 8 }}>
                  <Button variant="secondary" onClick={() => setShowDeleteForm(false)} disabled={deleting}>Cancelar</Button>
                  <Button variant="danger" disabled={deleting || !deleteMotivo.trim()} onClick={() => void confirmDelete()}>
                    {deleting ? 'Eliminando…' : 'Confirmar eliminación'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
