import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Asistencia } from '@/types'
import { Plus, Trash2, Pencil, Paperclip, ExternalLink, Search, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import { GESTIONS_ALMERA, PROCESOS_MAP } from '@/lib/constants'

const EMPTY = { proceso: '', gestion: '', persona: '', que_se_hizo: '', como_se_hizo: '', fecha: new Date().toISOString().split('T')[0], evidencia_ruta: '', evidencia_nombre: '', cumplido: 0 }

export default function Asistencias() {
  const { periodoActivo } = useAppStore()
  const [items,      setItems]      = useState<Asistencia[]>([])
  const [form,       setForm]       = useState({ ...EMPTY })
  const [editId,     setEditId]     = useState<number | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [filtro,     setFiltro]     = useState('')
  const [loading,    setLoading]    = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  async function cargar() {
    if (!periodoActivo) return
    setLoading(true)
    setItems(await window.api.asistencias.listar(periodoActivo.id))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [periodoActivo])

  async function seleccionarEvidencia() {
    const archivo = await window.api.asistencias.seleccionarEvidencia()
    if (archivo) setForm(f => ({ ...f, evidencia_ruta: archivo.ruta, evidencia_nombre: archivo.nombre }))
  }

  async function guardar() {
    if (!periodoActivo || !form.proceso || !form.persona || !form.que_se_hizo) return
    const data = { ...form, periodo_id: periodoActivo.id }
    if (editId) await window.api.asistencias.actualizar(editId, data)
    else        await window.api.asistencias.crear(data)
    setShowForm(false); setEditId(null); setForm({ ...EMPTY }); cargar()
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta asistencia?')) return
    await window.api.asistencias.eliminar(id); cargar()
  }

  function editar(item: Asistencia) {
    setForm({
      proceso: item.proceso,
      gestion: item.gestion ?? '',
      persona: item.persona,
      que_se_hizo: item.que_se_hizo,
      como_se_hizo: item.como_se_hizo ?? '',
      fecha: item.fecha,
      evidencia_ruta: item.evidencia_ruta ?? '',
      evidencia_nombre: item.evidencia_nombre ?? '',
      cumplido: item.cumplido,
    })
    setEditId(item.id); setShowForm(true)
  }

  const filtrados = items.filter(i =>
    i.proceso.toLowerCase().includes(filtro.toLowerCase()) ||
    i.persona.toLowerCase().includes(filtro.toLowerCase()) ||
    i.que_se_hizo.toLowerCase().includes(filtro.toLowerCase()) ||
    (i.gestion ?? '').toLowerCase().includes(filtro.toLowerCase()))

  const cumplidas   = items.filter(i => i.cumplido).length
  const pctCumplido = items.length > 0 ? Math.round((cumplidas / items.length) * 100) : 0

  if (!periodoActivo) return <p className="text-slate-400 text-sm">Selecciona un período primero.</p>

  return (
    <div className="space-y-4">

      {/* Barra de adherencia global */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Adherencia — Asistencias técnicas</h3>
            <p className="text-xs text-slate-400">{cumplidas} de {items.length} cumplidas</p>
          </div>
          <span className={`text-2xl font-bold ${pctCumplido >= 80 ? 'text-blue-600' : pctCumplido >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {pctCumplido}%
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${pctCumplido >= 80 ? 'bg-blue-500' : pctCumplido >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${pctCumplido}%` }} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por proceso, persona, módulo..." value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
        <button onClick={() => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 ml-auto">
          <Plus size={16} /> Nueva asistencia
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-almera-200 p-6 space-y-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800">{editId ? 'Editar asistencia' : 'Registrar asistencia técnica'}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Módulo Almera</label>
              <select className="input" value={form.gestion} onChange={e => setForm(f => ({ ...f, gestion: e.target.value }))}>
                <option value="">— Seleccionar módulo —</option>
                {GESTIONS_ALMERA.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Proceso *</label>
              <select className="input" value={form.proceso} onChange={e => setForm(f => ({ ...f, proceso: e.target.value }))}>
                <option value="">— Seleccionar proceso —</option>
                {PROCESOS_MAP.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Persona atendida *</label>
            <input className="input" placeholder="Nombre completo" value={form.persona}
              onChange={e => setForm(f => ({ ...f, persona: e.target.value }))} />
          </div>
          <div>
            <label className="label">¿Qué se hizo? *</label>
            <textarea className="input" rows={3} placeholder="Describe la asistencia realizada..." value={form.que_se_hizo}
              onChange={e => setForm(f => ({ ...f, que_se_hizo: e.target.value }))} />
          </div>
          <div>
            <label className="label">¿Cómo se hizo?</label>
            <textarea className="input" rows={2} placeholder="Metodología, herramientas utilizadas..." value={form.como_se_hizo}
              onChange={e => setForm(f => ({ ...f, como_se_hizo: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <label className="label">Evidencia</label>
              <div className="flex gap-2">
                <button onClick={seleccionarEvidencia} className="btn-secondary flex items-center gap-2 flex-1 justify-center">
                  <Paperclip size={14} /> {form.evidencia_nombre || 'Adjuntar archivo'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} className="btn-primary">Guardar asistencia</button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-24 animate-pulse" />)}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-400 text-sm">Sin asistencias registradas. Haz clic en «Nueva asistencia» para comenzar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-100 p-5 hover:border-almera-200 hover:shadow-sm transition-all">
              {/* Card header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    {item.gestion && (
                      <span className="text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2.5 py-1 rounded-full font-medium">{item.gestion}</span>
                    )}
                    <span className="text-xs bg-almera-50 text-almera-700 border border-almera-100 px-2.5 py-1 rounded-full font-medium">{item.proceso}</span>
                    <span className="text-xs bg-slate-50 text-slate-600 border border-slate-100 px-2.5 py-1 rounded-full">{item.persona}</span>
                    <span className="text-xs text-slate-400">{item.fecha}</span>
                    <button
                      onClick={async () => { await window.api.asistencias.actualizar(item.id, { ...item, cumplido: item.cumplido ? 0 : 1 }); cargar() }}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${item.cumplido ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-green-300 hover:text-green-600'}`}>
                      {item.cumplido ? <CheckCircle2 size={11} /> : <Circle size={11} />}
                      {item.cumplido ? 'Cumplido' : 'Pendiente'}
                    </button>
                  </div>
                  <p className="text-sm text-slate-700 font-medium line-clamp-2">{item.que_se_hizo}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0 items-center">
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    {expandedId === item.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button onClick={() => editar(item)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-almera-600 transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => eliminar(item.id)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === item.id && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Módulo Almera</p>
                      <p className="text-sm text-slate-700">{item.gestion || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Proceso</p>
                      <p className="text-sm text-slate-700">{item.proceso}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Persona atendida</p>
                      <p className="text-sm text-slate-700">{item.persona}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Fecha</p>
                      <p className="text-sm text-slate-700">{item.fecha}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">¿Qué se hizo?</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{item.que_se_hizo}</p>
                  </div>
                  {item.como_se_hizo && (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">¿Cómo se hizo?</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{item.como_se_hizo}</p>
                    </div>
                  )}
                  {item.evidencia_nombre && (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Evidencia adjunta</p>
                      <button onClick={() => window.api.asistencias.abrirEvidencia(item.evidencia_ruta!)}
                        className="flex items-center gap-2 text-sm text-almera-600 hover:text-almera-800 bg-almera-50 hover:bg-almera-100 px-3 py-2 rounded-lg transition-all">
                        <Paperclip size={14} />
                        {item.evidencia_nombre}
                        <ExternalLink size={12} className="ml-auto" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
