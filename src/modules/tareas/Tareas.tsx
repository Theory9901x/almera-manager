import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Tarea } from '@/types'
import { Plus, Trash2, Pencil, Check, Calendar, AlertCircle, ChevronDown, ChevronUp, Paperclip, ExternalLink } from 'lucide-react'

const EMPTY = { titulo: '', descripcion: '', prioridad: 'media', estado: 'pendiente', fecha_limite: '', adjunto_ruta: '', adjunto_nombre: '' }

export default function Tareas() {
  const { periodoActivo } = useAppStore()
  const [tareas,       setTareas]       = useState<Tarea[]>([])
  const [form,         setForm]         = useState({ ...EMPTY })
  const [editId,       setEditId]       = useState<number | null>(null)
  const [showForm,     setShowForm]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [expandedId,   setExpandedId]   = useState<number | null>(null)
  const [completandoId, setCompletandoId] = useState<number | null>(null)
  const [notaCierre,   setNotaCierre]   = useState('')

  async function cargar() {
    setLoading(true)
    setTareas(await window.api.tareas.listar(periodoActivo?.id))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [periodoActivo])

  async function guardar() {
    if (!form.titulo) return
    const data = { ...form, periodo_id: periodoActivo?.id }
    if (editId) await window.api.tareas.actualizar(editId, data)
    else        await window.api.tareas.crear(data)
    setShowForm(false); setEditId(null); setForm({ ...EMPTY }); cargar()
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta tarea?')) return
    await window.api.tareas.eliminar(id); cargar()
  }

  async function seleccionarAdjunto() {
    const archivo = await window.api.tareas.seleccionarAdjunto()
    if (archivo) setForm(f => ({ ...f, adjunto_ruta: archivo.ruta, adjunto_nombre: archivo.nombre }))
  }

  function editar(t: Tarea) {
    setForm({ titulo: t.titulo, descripcion: t.descripcion ?? '', prioridad: (t as any).prioridad ?? 'media', estado: (t as any).estado ?? 'pendiente', fecha_limite: t.fecha_limite ?? '', adjunto_ruta: t.adjunto_ruta ?? '', adjunto_nombre: t.adjunto_nombre ?? '' })
    setEditId(t.id); setShowForm(true); setCompletandoId(null)
  }

  const hoy = new Date().toISOString().split('T')[0]
  const pendientes  = tareas.filter(t => (t as any).estado !== 'completada')
  const completadas = tareas.filter(t => (t as any).estado === 'completada')
  const vencidas    = pendientes.filter(t => t.fecha_limite && t.fecha_limite < hoy)
  const cumplimiento = tareas.length > 0 ? Math.round((completadas.length / tareas.length) * 100) : 0

  return (
    <div className="space-y-5">

      {/* Barra de cumplimiento */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Cumplimiento de tareas</h3>
            <p className="text-xs text-slate-400">{completadas.length} de {tareas.length} completadas</p>
          </div>
          <span className={`text-2xl font-bold ${cumplimiento >= 80 ? 'text-green-600' : cumplimiento >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {cumplimiento}%
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${cumplimiento >= 80 ? 'bg-green-500' : cumplimiento >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${cumplimiento}%` }} />
        </div>
      </div>

      {/* Alerta vencidas */}
      {vencidas.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={18} />
          <span>{vencidas.length} tarea{vencidas.length > 1 ? 's' : ''} vencida{vencidas.length > 1 ? 's' : ''} sin completar</span>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true) }}
          className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva tarea
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-almera-200 p-6 space-y-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800">{editId ? 'Editar tarea' : 'Nueva tarea'}</h3>
          <div>
            <label className="label">Título *</label>
            <input className="input" placeholder="¿Qué me toca hacer?" value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={3} placeholder="Detalla la tarea, contexto o instrucciones..." value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="max-w-xs">
            <label className="label">Prioridad</label>
            <select className="input" value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value }))}>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input" value={form.fecha_limite}
                onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
            </div>
            <div>
              <label className="label">Adjunto (trazabilidad)</label>
              <button onClick={seleccionarAdjunto} className="btn-secondary w-full flex items-center gap-2 justify-center">
                <Paperclip size={14} /> {form.adjunto_nombre || 'Adjuntar archivo'}
              </button>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} className="btn-primary">Guardar tarea</button>
          </div>
        </div>
      )}

      {/* Listas */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-20 animate-pulse" />)}</div>
      ) : (
        <>
          {/* Pendientes */}
          {pendientes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pendientes ({pendientes.length})</h3>
              {pendientes.map(t => {
                const vencida = t.fecha_limite && t.fecha_limite < hoy
                return (
                  <div key={t.id} className={`bg-white rounded-2xl border p-4 transition-all ${vencida ? 'border-red-200' : 'border-slate-100 hover:border-almera-200 hover:shadow-sm'}`}>
                    {/* Header row */}
                    <div className="flex items-start gap-3">
                      {completandoId === t.id ? (
                        <div className="w-6 h-6 rounded-full border-2 border-green-400 bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check size={12} className="text-green-500" />
                        </div>
                      ) : (
                        <button onClick={() => { setCompletandoId(t.id); setNotaCierre('') }}
                          className="w-6 h-6 rounded-full border-2 border-slate-300 hover:border-green-500 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors hover:bg-green-50">
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {(t as any).prioridad && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                              (t as any).prioridad === 'alta' ? 'text-red-500 bg-red-50 border-red-200' :
                              (t as any).prioridad === 'media' ? 'text-amber-600 bg-amber-50 border-amber-200' :
                              'text-slate-500 bg-slate-50 border-slate-200'
                            }`}>{(t as any).prioridad}</span>
                          )}
                          {t.fecha_limite && (
                            <div className={`flex items-center gap-1 text-xs ${vencida ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                              <Calendar size={11} /> {t.fecha_limite} {vencida && '— VENCIDA'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                          {expandedId === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button onClick={() => editar(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-almera-600 transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => eliminar(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>

                    {/* Nota de cierre inline form */}
                    {completandoId === t.id && (
                      <div className="mt-3 ml-9 space-y-2">
                        <label className="text-xs text-slate-500 font-medium">Nota de cierre (opcional)</label>
                        <textarea className="input text-sm" rows={2} placeholder="¿Cómo se completó esta tarea? Resultados, observaciones..."
                          value={notaCierre} onChange={e => setNotaCierre(e.target.value)} />
                        <div className="flex gap-2">
                          <button onClick={() => setCompletandoId(null)} className="btn-secondary text-xs py-1.5 px-3">Cancelar</button>
                          <button onClick={async () => {
                            await window.api.tareas.toggleCompletar(t.id, notaCierre || undefined)
                            setCompletandoId(null); setNotaCierre(''); cargar()
                          }} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                            <Check size={12} /> Marcar completada
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Expand detail */}
                    {expandedId === t.id && completandoId !== t.id && (
                      <div className="mt-3 ml-9 pt-3 border-t border-slate-100 space-y-2">
                        {t.descripcion && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Descripción</p>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{t.descripcion}</p>
                          </div>
                        )}
                        <div className="flex gap-4">
                          {(t as any).prioridad && <div><p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Prioridad</p><p className="text-sm text-slate-600">{(t as any).prioridad}</p></div>}
                          {t.fecha_limite && <div><p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Fecha límite</p><p className="text-sm text-slate-600">{t.fecha_limite}</p></div>}
                        </div>
                        {t.adjunto_nombre && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">Adjunto</p>
                            <button onClick={() => window.api.tareas.abrirAdjunto(t.adjunto_ruta!)}
                              className="flex items-center gap-2 text-sm text-almera-600 hover:text-almera-800 bg-almera-50 hover:bg-almera-100 px-3 py-2 rounded-lg transition-all">
                              <Paperclip size={13} /> {t.adjunto_nombre} <ExternalLink size={11} className="ml-auto" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Completadas */}
          {completadas.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completadas ({completadas.length})</h3>
              {completadas.map(t => (
                <div key={t.id} className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={13} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800">{t.titulo}</p>
                      {t.completada_en && <p className="text-xs text-emerald-600 mt-0.5">Completada: {t.completada_en.split(' ')[0]}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-400 transition-colors">
                        {expandedId === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button onClick={() => eliminar(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-emerald-300 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {expandedId === t.id && (
                    <div className="mt-3 ml-9 pt-3 border-t border-emerald-200 space-y-2">
                      {t.descripcion && (
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium">Descripción</p>
                          <p className="text-sm text-emerald-900 mt-1 leading-relaxed">{t.descripcion}</p>
                        </div>
                      )}
                      {t.notas_cierre && (
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium">Nota de cierre</p>
                          <p className="text-sm text-emerald-900 mt-1 leading-relaxed">{t.notas_cierre}</p>
                        </div>
                      )}
                      <div className="flex gap-4">
                        {(t as any).prioridad && <div><p className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium">Prioridad</p><p className="text-sm text-emerald-800">{(t as any).prioridad}</p></div>}
                        {t.fecha_limite && <div><p className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium">Fecha límite</p><p className="text-sm text-emerald-800">{t.fecha_limite}</p></div>}
                      </div>
                      {t.adjunto_nombre && (
                        <div>
                          <p className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium mb-1">Adjunto</p>
                          <button onClick={() => window.api.tareas.abrirAdjunto(t.adjunto_ruta!)}
                            className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-2 rounded-lg transition-all">
                            <Paperclip size={13} /> {t.adjunto_nombre} <ExternalLink size={11} className="ml-auto" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tareas.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
              <p className="text-slate-400 text-sm">Sin tareas registradas. Crea tu primera tarea arriba.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
