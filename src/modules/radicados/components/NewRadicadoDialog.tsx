import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilePlus2, X } from 'lucide-react'
import { Button, DatePicker, Field, Input, Select, Textarea, moduleIdentity } from '@/design-system'
import type { CreateRadicadoInput, RadicadoCatalogos, RadicadoDireccion } from '../types'

const identity = moduleIdentity('radicados')

const EMPTY_FORM: CreateRadicadoInput = { tipoId: '', categoriaId: '', medioId: '', objeto: '' }

/** Formulario de radicación. Objeto y tipo son lo primero: de ahí depende si aparece o no el
 *  campo de dirección (solo Externo lo tiene — Interno no participa de Recibido/Enviado). */
export function NewRadicadoDialog({ open, catalogos, busy, onCancel, onCreate }: {
  open: boolean
  catalogos: RadicadoCatalogos | null
  busy?: boolean
  onCancel(): void
  onCreate(input: CreateRadicadoInput): void
}) {
  const [form, setForm] = useState<CreateRadicadoInput>(EMPTY_FORM)
  const [touched, setTouched] = useState(false)
  // "No aplica" en Proceso: oculta el select y pide a mano a quien se dirige (proceso_detalle).
  const [procesoNoAplica, setProcesoNoAplica] = useState(false)

  useEffect(() => {
    if (open) { setForm(EMPTY_FORM); setTouched(false); setProcesoNoAplica(false) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const tipoSeleccionado = catalogos?.tipos.find(t => t.id === form.tipoId)
  // "Externo" es el unico codigo del catalogo base que trae direccion Recibido/Enviado. Un tipo
  // nuevo que la entidad agregue no la tendra a menos que su codigo tambien sea EXT.
  const esExterno = tipoSeleccionado?.codigo === 'EXT'

  const missingTipo = !form.tipoId
  const missingCategoria = !form.categoriaId
  const missingMedio = !form.medioId
  const missingObjeto = !form.objeto.trim()
  const missingDireccion = esExterno && !form.direccion
  const canSubmit = !missingTipo && !missingCategoria && !missingMedio && !missingObjeto && !missingDireccion

  function toggleNoAplica(next: boolean) {
    setProcesoNoAplica(next)
    setForm(current => ({
      ...current,
      processId: next ? undefined : current.processId,
      procesoDetalle: next ? current.procesoDetalle : undefined,
    }))
  }

  function submit() {
    setTouched(true)
    if (canSubmit) onCreate(form)
  }

  return createPortal(
    <div className="ds-confirm-backdrop" onClick={() => !busy && onCancel()}>
      <div className="ds-confirm start-audit radicado-form" role="dialog" aria-modal="true" aria-labelledby="new-radicado-title" onClick={event => event.stopPropagation()}>
        <button className="ds-confirm-close" onClick={onCancel} aria-label="Cerrar"><X size={16} /></button>
        <div className="ds-confirm-icon" style={{ background: `${identity.color}1f`, color: identity.color }}>
          <FilePlus2 size={22} />
        </div>
        <h2 id="new-radicado-title">Nuevo radicado</h2>
        <p className="ds-confirm-body">
          El número se genera al confirmar y ya no se puede editar. Si te equivocas, el radicado se
          anula dejando el motivo — el número no se reutiliza.
        </p>

        <div className="radicado-form-grid">
          <Field label="Tipo *" hint={touched && missingTipo ? 'Elige el tipo' : undefined}>
            <Select
              value={form.tipoId || 'NONE'}
              onChange={value => setForm(current => ({ ...current, tipoId: value === 'NONE' ? '' : value, direccion: undefined }))}
              options={[{ value: 'NONE', label: 'Selecciona el tipo' }, ...(catalogos?.tipos.filter(t => t.activo) || []).map(t => ({ value: t.id, label: t.nombre }))]}
            />
          </Field>
          {esExterno && (
            <Field label="Recibido o enviado *" hint={touched && missingDireccion ? 'Elige uno de los dos' : undefined}>
              <Select
                value={form.direccion || 'NONE'}
                onChange={value => setForm(current => ({ ...current, direccion: value === 'NONE' ? undefined : value as RadicadoDireccion }))}
                options={[{ value: 'NONE', label: 'Selecciona' }, { value: 'RECIBIDO', label: 'Recibido' }, { value: 'ENVIADO', label: 'Enviado' }]}
              />
            </Field>
          )}
          <Field label="Categoría / tipo documental *" hint={touched && missingCategoria ? 'Elige la categoría' : undefined}>
            <Select
              value={form.categoriaId || 'NONE'}
              onChange={value => setForm(current => ({ ...current, categoriaId: value === 'NONE' ? '' : value }))}
              options={[{ value: 'NONE', label: 'Selecciona la categoría' }, ...(catalogos?.categorias.filter(c => c.activo) || []).map(c => ({ value: c.id, label: c.nombre }))]}
            />
          </Field>
          <Field label="Medio *" hint={touched && missingMedio ? 'Elige el medio' : undefined}>
            <Select
              value={form.medioId || 'NONE'}
              onChange={value => setForm(current => ({ ...current, medioId: value === 'NONE' ? '' : value }))}
              options={[{ value: 'NONE', label: 'Selecciona el medio' }, ...(catalogos?.medios.filter(m => m.activo) || []).map(m => ({ value: m.id, label: m.nombre }))]}
            />
          </Field>

          <div className="ds-field span-2">
            <div className="radicado-proceso-toggle">
              <span className="ds-field-label">Proceso</span>
              <button
                type="button"
                className={`radicado-noaplica-btn${procesoNoAplica ? ' is-active' : ''}`}
                onClick={() => toggleNoAplica(!procesoNoAplica)}
              >
                No aplica
              </button>
            </div>
            {procesoNoAplica ? (
              <Input
                placeholder="A quién se dirige"
                value={form.procesoDetalle || ''}
                onChange={event => setForm(current => ({ ...current, procesoDetalle: event.target.value }))}
              />
            ) : (
              <Select
                value={form.processId || 'NONE'}
                onChange={value => setForm(current => ({ ...current, processId: value === 'NONE' ? undefined : value }))}
                options={[{ value: 'NONE', label: 'Sin proceso' }, ...(catalogos?.procesos || []).map(p => ({ value: p.id, label: `${p.code} · ${p.name}` }))]}
              />
            )}
          </div>

          <Field label="Fecha del documento" hint="Opcional: si difiere de hoy">
            <DatePicker value={form.fechaDocumento || ''} onChange={value => setForm(current => ({ ...current, fechaDocumento: value || undefined }))} />
          </Field>

          <Field label="Objeto / asunto *" hint={touched && missingObjeto ? 'Describe el objeto del radicado' : undefined} className="span-3">
            <Textarea
              value={form.objeto}
              placeholder="Ej. Solicitud de historia clínica"
              onChange={event => setForm(current => ({ ...current, objeto: event.target.value }))}
            />
          </Field>

          <Field label="Subproceso / quién elabora" hint="Opcional" className="span-2">
            <Textarea
              value={form.subproceso || ''}
              onChange={event => setForm(current => ({ ...current, subproceso: event.target.value }))}
            />
          </Field>

          <Field label="Remitente / quien diligencia" hint="Opcional">
            <Input value={form.remitente || ''} onChange={event => setForm(current => ({ ...current, remitente: event.target.value }))} />
          </Field>

          <Field label="Destinatario" hint="Opcional" className="span-3">
            <Textarea
              value={form.destinatario || ''}
              onChange={event => setForm(current => ({ ...current, destinatario: event.target.value }))}
            />
          </Field>
        </div>

        <div className="ds-confirm-actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button identity={identity} disabled={busy} onClick={submit}>
            <FilePlus2 size={15} /> {busy ? 'Generando…' : 'Generar radicado'}
          </Button>
        </div>
        {touched && !canSubmit && <p className="start-audit-error">Completa los campos obligatorios antes de generar el número.</p>}
      </div>
    </div>,
    document.body,
  )
}
