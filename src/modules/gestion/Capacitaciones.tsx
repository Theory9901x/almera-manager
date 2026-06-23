import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Capacitacion } from '@/types'
import { Plus, Trash2, FileText, ExternalLink, Check, X, Clock } from 'lucide-react'
import { useUserFilter } from '@/lib/useUserFilter'

const EMPTY = { titulo: '', descripcion: '', fecha: new Date().toISOString().split('T')[0], acta_ruta: '', acta_nombre: '' }

const SESION_CONFIG = [
  { key: 'sesion1', label: 'Sesión 1' },
  { key: 'sesion2', label: 'Sesión 2' },
  { key: 'sesion3', label: 'Sesión 3' },
]

function SesionBtn({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const cfg = {
    completado: { icon: Check, cls: 'bg-green-500 text-white border-green-500', next: 'falta_sesion' },
    falta_sesion: { icon: X, cls: 'bg-red-400 text-white border-red-400', next: 'pendiente' },
    pendiente: { icon: Clock, cls: 'bg-slate-100 text-slate-400 border-slate-200', next: 'completado' },
  } as any
  const c = cfg[valor] ?? cfg.pendiente
  const Icon = c.icon
  return (
    <button onClick={() => onChange(c.next)}
      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 ${c.cls}`}
      title={valor}>
      <Icon size={14} />
    </button>
  )
}

export default function Capacitaciones() {
  const { periodoActivo } = useAppStore()
  const { filterByUser, createUid, filterKey } = useUserFilter()
  const [items,    setItems]    = useState<Capacitacion[]>([])
  const [form,     setForm]     = useState({ ...EMPTY })
  const [showForm, setShowForm] = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function cargar() {
    if (!periodoActivo) return
    setLoading(true)
    const all = await window.api.capacitaciones.listar(periodoActivo.id)
    setItems(filterByUser(all))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [periodoActivo, filterKey])

  async function seleccionarActa() {
    const archivo = await window.api.capacitaciones.seleccionarActa()
    if (archivo) setForm(f => ({ ...f, acta_ruta: archivo.ruta, acta_nombre: archivo.nombre }))
  }

  async function guardar() {
    if (!periodoActivo || !form.titulo) return
    await window.api.capacitaciones.crear({ ...form, periodo_id: periodoActivo.id, usuario_id: createUid })
    setShowForm(false); setForm({ ...EMPTY }); cargar()
  }

  async function toggleSesion(id: number, sesion: string, valorActual: string) {
    const siguiente = valorActual === 'pendiente' ? 'completado' : valorActual === 'completado' ? 'falta_sesion' : 'pendiente'
    await window.api.capacitaciones.actualizarSesion(id, sesion, siguiente)
    cargar()
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta capacitación?')) return
    await window.api.capacitaciones.eliminar(id); cargar()
  }

  function adherencia(item: Capacitacion) {
    const total = [item.sesion1, item.sesion2, item.sesion3]
    const completadas = total.filter(s => s === 'completado').length
    return Math.round((completadas / total.length) * 100)
  }

  const completas   = items.filter(i => i.sesion1 === 'completado' && i.sesion2 === 'completado' && i.sesion3 === 'completado').length
  const pctCompleto = items.length > 0 ? Math.round((completas / items.length) * 100) : 0

  if (!periodoActivo) return <p className="text-slate-400 text-sm">Selecciona un período primero.</p>

  return (
    <div className="space-y-4">

      {/* Barra de adherencia global */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Adherencia — Capacitaciones</h3>
            <p className="text-xs text-slate-400">{completas} de {items.length} completamente finalizadas (3/3 sesiones)</p>
          </div>
          <span className={`text-2xl font-bold ${pctCompleto >= 80 ? 'text-violet-600' : pctCompleto >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
            {pctCompleto}%
          </span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${pctCompleto >= 80 ? 'bg-violet-500' : pctCompleto >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
            style={{ width: `${pctCompleto}%` }} />
        </div>
        {items.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {['sesion1','sesion2','sesion3'].map((s, i) => {
              const okCount = items.filter(x => (x as any)[s] === 'completado').length
              const pct = Math.round((okCount / items.length) * 100)
              return (
                <div key={s} className="bg-slate-50 rounded-xl p-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">Sesión {i + 1}</p>
                  <p className="text-base font-bold text-slate-700">{pct}%</p>
                  <p className="text-[10px] text-slate-400">{okCount}/{items.length}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nueva capacitación
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-almera-200 p-6 space-y-4 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800">Registrar capacitación</h3>
          <div>
            <label className="label">Título *</label>
            <input className="input" placeholder="Nombre de la capacitación" value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={2} placeholder="Descripción, objetivos..." value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <label className="label">Acta de capacitación</label>
              <button onClick={seleccionarActa} className="btn-secondary w-full flex items-center gap-2 justify-center">
                <FileText size={14} /> {form.acta_nombre || 'Cargar acta'}
              </button>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} className="btn-primary">Guardar</button>
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5">
        <span className="font-medium">Estado sesiones:</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"><Check size={10} className="text-white" /></span> Completada</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-red-400 flex items-center justify-center"><X size={10} className="text-white" /></span> Falta sesión</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center"><Clock size={10} className="text-slate-500" /></span> Pendiente</span>
        <span className="text-slate-400 ml-2">Haz clic en el círculo para cambiar el estado</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-28 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <p className="text-slate-400 text-sm">Sin capacitaciones registradas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const adh = adherencia(item)
            return (
              <div key={item.id} className="bg-white rounded-2xl border border-slate-100 p-5 hover:border-almera-200 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold text-slate-800">{item.titulo}</p>
                        <span className="text-xs text-slate-400">{item.fecha}</span>
                      </div>
                      {item.descripcion && <p className="text-xs text-slate-500 mt-0.5">{item.descripcion}</p>}
                    </div>

                    {/* Sesiones + adherencia */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3">
                        {SESION_CONFIG.map(s => (
                          <div key={s.key} className="flex flex-col items-center gap-1">
                            <SesionBtn
                              valor={(item as any)[s.key]}
                              onChange={_v => toggleSesion(item.id, s.key, (item as any)[s.key])} />
                            <span className="text-[10px] text-slate-400">{s.label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500">Adherencia</span>
                          <span className="text-xs font-bold text-slate-700">{adh}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${adh === 100 ? 'bg-green-500' : adh >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                            style={{ width: `${adh}%` }} />
                        </div>
                      </div>
                    </div>

                    {item.acta_nombre && (
                      <button onClick={() => window.api.capacitaciones.abrirActa(item.acta_ruta!)}
                        className="flex items-center gap-1.5 text-xs text-almera-600 hover:text-almera-800 transition-colors">
                        <FileText size={12} /> {item.acta_nombre} <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                  <button onClick={() => eliminar(item.id)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}