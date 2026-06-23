import { useEffect, useState } from 'react'
import { useAppStore }    from '@/store/appStore'
import { useAuthStore }   from '@/store/authStore'
import { useUserFilter }  from '@/lib/useUserFilter'
import type { Auditoria, AuditoriaAdjunto } from '@/types'
import {
  ShieldAlert, Plus, X, Check, ChevronDown, ChevronUp,
  Paperclip, Calendar, User, AlertTriangle,
  CheckCircle2, Clock, Trash2, FileText, Pencil, Tag,
  ExternalLink,
} from 'lucide-react'

const SUBPROCESOS = [
  'Gestión del SOGS',
  'Métodos de Trabajo',
  'Gestión de IAAS',
  'Seguridad del Paciente',
  'Gestión de Auditorías',
]

const TIPOS   = ['interna', 'externa', 'seguimiento'] as const
const ESTADOS = ['abierta', 'en_proceso', 'cerrada']  as const

const TIPO_LABEL:   Record<string, string> = { interna: 'Interna', externa: 'Externa', seguimiento: 'Seguimiento' }
const ESTADO_LABEL: Record<string, string> = { abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada' }

const tipoCls = (t: string) =>
  t === 'interna'     ? 'bg-blue-50 text-blue-700 border-blue-200' :
  t === 'externa'     ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        'bg-violet-50 text-violet-700 border-violet-200'

const estadoCls = (e: string) =>
  e === 'cerrada'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
  e === 'en_proceso' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                       'bg-red-50 text-red-600 border-red-200'

const EMPTY_FORM = {
  subproceso: '', tipo: 'interna', hallazgo: '', descripcion: '',
  como_se_identifico: '', accion: '', responsable: '',
  fecha: new Date().toISOString().slice(0, 10), fecha_cierre: '',
  estado: 'abierta', notas: '',
}

type PendingFile = { ruta: string; nombre: string }

function InfoField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function AdjuntosList({ auditoriaId }: { auditoriaId: number }) {
  const [adjuntos, setAdjuntos] = useState<AuditoriaAdjunto[]>([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    window.api.auditorias.adjuntos.listar(auditoriaId).then(setAdjuntos)
  }, [auditoriaId])

  async function agregar() {
    const files = await window.api.auditorias.seleccionarAdjunto()
    if (!files.length) return
    setLoading(true)
    for (const f of files) {
      const nuevo = await window.api.auditorias.adjuntos.agregar(auditoriaId, f.ruta, f.nombre)
      setAdjuntos(a => [...a, nuevo])
    }
    setLoading(false)
  }

  async function eliminar(id: number) {
    await window.api.auditorias.adjuntos.eliminar(id)
    setAdjuntos(a => a.filter(x => x.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">
          Adjuntos ({adjuntos.length})
        </p>
        <button onClick={agregar} disabled={loading}
          className="flex items-center gap-1 text-[11px] text-almera-600 hover:text-almera-800 font-medium transition-colors">
          <Plus size={11}/> Añadir
        </button>
      </div>
      {adjuntos.length === 0 ? (
        <button onClick={agregar}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 hover:border-almera-300 hover:text-almera-500 transition-colors">
          <Paperclip size={13}/> Adjuntar archivos (PDF, imágenes, documentos...)
        </button>
      ) : (
        <div className="space-y-1.5">
          {adjuntos.map(a => (
            <div key={a.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <FileText size={12} className="text-slate-400 flex-shrink-0"/>
              <button onClick={() => window.api.auditorias.abrirAdjunto(a.ruta)}
                className="flex-1 text-xs text-slate-700 hover:text-almera-700 text-left truncate transition-colors font-medium">
                {a.nombre}
              </button>
              <button onClick={() => window.api.auditorias.abrirAdjunto(a.ruta)}
                className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
                <ExternalLink size={11}/>
              </button>
              <button onClick={() => eliminar(a.id)}
                className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
                <X size={11}/>
              </button>
            </div>
          ))}
          <button onClick={agregar}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-almera-600 transition-colors">
            <Paperclip size={11}/> Añadir más adjuntos
          </button>
        </div>
      )}
    </div>
  )
}

export default function Auditorias() {
  const { periodoActivo }           = useAppStore()
  const { usuario }                 = useAuthStore()
  const { filterByUser, createUid, filterKey } = useUserFilter()
  const [lista,     setLista]     = useState<Auditoria[]>([])
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState({ ...EMPTY_FORM })
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [expanded,  setExpanded]  = useState<number | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [editId,    setEditId]    = useState<number | null>(null)

  const pid = periodoActivo?.id

  useEffect(() => {
    if (pid) window.api.auditorias.listar(pid).then(data => setLista(filterByUser(data)))
  }, [pid, filterKey])

  const abiertas = lista.filter(a => a.estado !== 'cerrada')
  const cerradas = lista.filter(a => a.estado === 'cerrada')

  function resetForm() {
    setForm({ ...EMPTY_FORM, responsable: usuario?.nombre ?? '' })
    setEditId(null)
    setPendingFiles([])
  }

  function openCreate() { resetForm(); setShowForm(true) }

  function openEdit(a: Auditoria) {
    setForm({
      subproceso: a.subproceso ?? '', tipo: a.tipo, hallazgo: a.hallazgo,
      descripcion: a.descripcion ?? '', como_se_identifico: a.como_se_identifico ?? '',
      accion: a.accion ?? '', responsable: a.responsable ?? '',
      fecha: a.fecha, fecha_cierre: a.fecha_cierre ?? '', estado: a.estado, notas: a.notas ?? '',
    })
    setPendingFiles([])
    setEditId(a.id)
    setShowForm(true)
  }

  async function handleAddPendingFiles() {
    const files = await window.api.auditorias.seleccionarAdjunto()
    if (files.length) setPendingFiles(f => [...f, ...files])
  }

  async function handleSave() {
    if (!pid || !form.hallazgo.trim()) return
    setSaving(true)
    const data = { ...form, periodo_id: pid, usuario_id: createUid }
    let auditoria: Auditoria
    if (editId) {
      auditoria = await window.api.auditorias.actualizar(editId, data)
      setLista(l => l.map(a => a.id === editId ? auditoria : a))
    } else {
      auditoria = await window.api.auditorias.crear(data)
      setLista(l => [auditoria, ...l])
    }
    // Save pending attachments
    for (const f of pendingFiles) {
      await window.api.auditorias.adjuntos.agregar(auditoria.id, f.ruta, f.nombre)
    }
    setSaving(false)
    setShowForm(false)
    resetForm()
    setExpanded(auditoria.id)
  }

  async function handleEliminar(id: number) {
    if (!confirm('¿Eliminar esta auditoría y sus adjuntos?')) return
    await window.api.auditorias.eliminar(id)
    setLista(l => l.filter(a => a.id !== id))
    if (expanded === id) setExpanded(null)
  }

  async function toggleEstado(a: Auditoria) {
    const nuevoEstado = a.estado === 'abierta' ? 'en_proceso' : a.estado === 'en_proceso' ? 'cerrada' : 'abierta'
    const updated = await window.api.auditorias.actualizar(a.id, {
      subproceso: a.subproceso ?? '', tipo: a.tipo, hallazgo: a.hallazgo,
      descripcion: a.descripcion ?? '', como_se_identifico: a.como_se_identifico ?? '',
      accion: a.accion ?? '', responsable: a.responsable ?? '',
      fecha: a.fecha, fecha_cierre: a.fecha_cierre ?? '', estado: nuevoEstado, notas: a.notas ?? '',
    })
    setLista(l => l.map(x => x.id === a.id ? updated : x))
  }

  function renderCard(a: Auditoria, idx: number) {
    const isOpen     = expanded === a.id
    const isCerrada  = a.estado === 'cerrada'
    const isEnProceso = a.estado === 'en_proceso'

    return (
      <div key={a.id} className={`rounded-2xl border overflow-hidden transition-all shadow-sm ${
        isCerrada   ? 'border-emerald-100 bg-emerald-50/20' :
        isEnProceso ? 'border-amber-100 bg-amber-50/20'     : 'border-slate-200 bg-white'
      }`}>
        {/* Header row */}
        <div className="p-4 flex items-start gap-3">
          {/* Index + status icon */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center">{idx}</span>
            <button onClick={() => toggleEstado(a)} title="Cambiar estado" className="mt-0.5">
              {isCerrada
                ? <CheckCircle2 size={16} className="text-emerald-500"/>
                : isEnProceso
                  ? <Clock size={16} className="text-amber-500"/>
                  : <AlertTriangle size={16} className="text-red-400"/>
              }
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${tipoCls(a.tipo)}`}>
                {TIPO_LABEL[a.tipo]}
              </span>
              {a.subproceso && (
                <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <Tag size={8}/>{a.subproceso}
                </span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ml-auto ${estadoCls(a.estado)}`}>
                {ESTADO_LABEL[a.estado]}
              </span>
            </div>

            {/* Hallazgo */}
            <p className="text-sm font-semibold text-slate-800 leading-snug">{a.hallazgo}</p>

            {/* Meta info */}
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              {a.responsable && <span className="flex items-center gap-1"><User size={9}/>{a.responsable}</span>}
              <span className="flex items-center gap-1"><Calendar size={9}/>{a.fecha}</span>
              {a.fecha_cierre && (
                <span className="flex items-center gap-1 text-amber-500">
                  <Calendar size={9}/>Cierre: {a.fecha_cierre}
                </span>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <button onClick={() => setExpanded(isOpen ? null : a.id)}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
            {isOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>
        </div>

        {/* Expanded detail */}
        {isOpen && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4">
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Descripción" value={a.descripcion}/>
              <InfoField label="Cómo se identificó" value={a.como_se_identifico}/>
              <InfoField label="Acción correctiva / preventiva" value={a.accion}/>
              <InfoField label="Notas" value={a.notas}/>
            </div>

            {/* Adjuntos */}
            <div className="pt-2 border-t border-slate-100">
              <AdjuntosList auditoriaId={a.id} />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
              <button onClick={() => openEdit(a)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all font-medium">
                <Pencil size={12}/>Editar
              </button>
              <button onClick={() => handleEliminar(a.id)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-100 transition-all font-medium">
                <Trash2 size={12}/>Eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-md shadow-red-200">
            <ShieldAlert size={16} className="text-white"/>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Gestión de Auditorías</h2>
            <p className="text-xs text-slate-400">
              {abiertas.length} {abiertas.length === 1 ? 'abierta' : 'abiertas'} · {cerradas.length} cerradas
            </p>
          </div>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white text-sm font-semibold shadow-sm shadow-red-200 hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={14}/> Nueva auditoría
        </button>
      </div>

      {/* Summary pills */}
      {lista.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {(['abierta','en_proceso','cerrada'] as const).map(e => {
            const count = lista.filter(a => a.estado === e).length
            if (!count) return null
            return (
              <div key={e} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${estadoCls(e)}`}>
                {e === 'cerrada'    ? <CheckCircle2 size={12}/> :
                 e === 'en_proceso' ? <Clock size={12}/> : <AlertTriangle size={12}/>}
                {count} {ESTADO_LABEL[e]}
              </div>
            )
          })}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-red-50 to-rose-50">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="text-red-500"/>
              <span className="text-sm font-bold text-slate-800">{editId ? 'Editar auditoría' : 'Nueva auditoría'}</span>
            </div>
            <button onClick={() => { setShowForm(false); resetForm() }}
              className="p-1.5 rounded-xl hover:bg-white text-slate-400 hover:text-slate-600 transition-all">
              <X size={14}/>
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Tipo + Subproceso + Estado */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Tipo</label>
                <select className="input text-sm" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Subproceso</label>
                <select className="input text-sm" value={form.subproceso} onChange={e => setForm(f => ({ ...f, subproceso: e.target.value }))}>
                  <option value="">Sin especificar</option>
                  {SUBPROCESOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
                <select className="input text-sm" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  {ESTADOS.map(s => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
                </select>
              </div>
            </div>

            {/* Hallazgo */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Hallazgo <span className="text-red-400 normal-case">*</span>
              </label>
              <textarea rows={2} className="input text-sm resize-none"
                placeholder="Describe el hallazgo encontrado..."
                value={form.hallazgo} onChange={e => setForm(f => ({ ...f, hallazgo: e.target.value }))}/>
            </div>

            {/* Descripción + Cómo se identificó */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Descripción detallada</label>
                <textarea rows={3} className="input text-sm resize-none" placeholder="Detalles adicionales..."
                  value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Cómo se identificó</label>
                <textarea rows={3} className="input text-sm resize-none" placeholder="Método / contexto de identificación..."
                  value={form.como_se_identifico} onChange={e => setForm(f => ({ ...f, como_se_identifico: e.target.value }))}/>
              </div>
            </div>

            {/* Acción */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Acción correctiva / preventiva</label>
              <textarea rows={2} className="input text-sm resize-none" placeholder="Acciones tomadas o planificadas..."
                value={form.accion} onChange={e => setForm(f => ({ ...f, accion: e.target.value }))}/>
            </div>

            {/* Responsable + Fechas */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Responsable</label>
                <input type="text" className="input text-sm" placeholder="Nombre del responsable"
                  value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Fecha hallazgo</label>
                <input type="date" className="input text-sm" value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Fecha de cierre</label>
                <input type="date" className="input text-sm" value={form.fecha_cierre}
                  onChange={e => setForm(f => ({ ...f, fecha_cierre: e.target.value }))}/>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Notas adicionales</label>
              <input type="text" className="input text-sm" placeholder="Observaciones, seguimientos..."
                value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}/>
            </div>

            {/* Adjuntos en creación */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Adjuntos ({pendingFiles.length})
              </label>
              {pendingFiles.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <FileText size={12} className="text-slate-400 flex-shrink-0"/>
                      <span className="flex-1 text-xs text-slate-700 truncate">{f.nombre}</span>
                      <button onClick={() => setPendingFiles(pf => pf.filter((_, j) => j !== i))}
                        className="text-slate-300 hover:text-red-400 transition-colors">
                        <X size={11}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleAddPendingFiles}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 hover:border-almera-300 hover:text-almera-500 transition-colors">
                <Paperclip size={13}/> Adjuntar archivos
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
              <button onClick={() => { setShowForm(false); resetForm() }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.hallazgo.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white text-sm font-semibold disabled:opacity-50 hover:shadow-md transition-all">
                {saving
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Guardando...</>
                  : <><Check size={14}/>{editId ? 'Guardar cambios' : 'Registrar auditoría'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      {lista.length === 0 && !showForm ? (
        <div className="text-center py-16 text-slate-300 border-2 border-dashed border-slate-100 rounded-2xl">
          <ShieldAlert size={32} className="mx-auto mb-3 opacity-40"/>
          <p className="text-sm font-medium">Sin auditorías registradas</p>
          <p className="text-xs mt-1">Haz clic en «Nueva auditoría» para comenzar</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 items-start">
          {/* Abiertas / En proceso */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-400"/>
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Abiertas / En proceso</h3>
              <span className="ml-auto text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{abiertas.length}</span>
            </div>
            {abiertas.length === 0
              ? <div className="text-center py-10 text-slate-300 text-xs border-2 border-dashed border-slate-100 rounded-2xl">Sin auditorías abiertas</div>
              : abiertas.map((a, i) => renderCard(a, i + 1))
            }
          </div>

          {/* Cerradas */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-500"/>
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Cerradas</h3>
              <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-bold">{cerradas.length}</span>
            </div>
            {cerradas.length === 0
              ? <div className="text-center py-10 text-slate-300 text-xs border-2 border-dashed border-slate-100 rounded-2xl">Sin auditorías cerradas</div>
              : cerradas.map((a, i) => renderCard(a, i + 1))
            }
          </div>
        </div>
      )}
    </div>
  )
}
