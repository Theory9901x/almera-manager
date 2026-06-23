import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { PlanMejora, Indicador } from '@/types'
import Badge from '@/components/Badge'
import { Plus, Trash2, Pencil } from 'lucide-react'

const ESTADOS = ['pendiente', 'en_curso', 'completado'] as const
const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', en_curso: 'En curso', completado: 'Completado'
}
const ESTADO_BADGE: Record<string, 'amarillo' | 'azul' | 'verde'> = {
  pendiente: 'amarillo', en_curso: 'azul', completado: 'verde'
}
const EMPTY = {
  indicador_id: undefined as number | undefined,
  descripcion: '', responsable: '', fecha_limite: '',
  estado: 'pendiente' as const, avance: 0
}

export default function PlanesMejora() {
  const { periodoActivo } = useAppStore()
  const [planes,     setPlanes]     = useState<PlanMejora[]>([])
  const [indicadores,setIndicadores]= useState<Indicador[]>([])
  const [form,       setForm]       = useState({ ...EMPTY })
  const [editId,     setEditId]     = useState<number | null>(null)
  const [showForm,   setShowForm]   = useState(false)

  async function cargar() {
    if (!periodoActivo) return
    const [p, i] = await Promise.all([
      window.api.planes.listar(periodoActivo.id),
      window.api.indicadores.listar(periodoActivo.id),
    ])
    setPlanes(p); setIndicadores(i)
  }

  useEffect(() => { cargar() }, [periodoActivo])

  async function guardar() {
    if (!periodoActivo || !form.descripcion) return
    const data = { ...form, periodo_id: periodoActivo.id }
    if (editId) await window.api.planes.actualizar(editId, data)
    else        await window.api.planes.crear(data)
    setShowForm(false); setEditId(null); setForm({ ...EMPTY }); cargar()
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar este plan?')) return
    await window.api.planes.eliminar(id); cargar()
  }

  if (!periodoActivo) return <p className="text-slate-400 text-sm">Selecciona un período primero.</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setForm({ ...EMPTY }); setEditId(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo plan
        </button>
      </div>

      {showForm && (
        <div className="card p-5 space-y-3 bg-almera-50/40 border-almera-200">
          <h3 className="text-sm font-semibold text-slate-700">{editId ? 'Editar plan' : 'Nuevo plan de mejora'}</h3>
          <div>
            <label className="label">Indicador relacionado</label>
            <select className="input" value={form.indicador_id ?? ''}
              onChange={e => setForm(f => ({ ...f, indicador_id: Number(e.target.value) || undefined }))}>
              <option value="">— Sin indicador —</option>
              {indicadores.map(i => <option key={i.id} value={i.id}>{i.codigo ? `${i.codigo} — ` : ''}{i.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Descripción *</label>
            <textarea className="input" rows={2} value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Responsable</label>
              <input className="input" value={form.responsable}
                onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input" value={form.fecha_limite}
                onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
            </div>
            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.estado}
                onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}>
                {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Avance: {form.avance}%</label>
            <input type="range" min="0" max="100" step="5" value={form.avance} className="w-full"
              onChange={e => setForm(f => ({ ...f, avance: Number(e.target.value) }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} className="btn-primary">Guardar</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {planes.length === 0
          ? <p className="text-slate-400 text-sm text-center py-8">Sin planes de mejora registrados.</p>
          : planes.map(p => (
            <div key={p.id} className="card p-4 flex items-start gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={ESTADO_BADGE[p.estado]}>{ESTADO_LABEL[p.estado]}</Badge>
                  {p.indicador_nombre && (
                    <span className="text-xs text-slate-400">{p.indicador_nombre}</span>
                  )}
                </div>
                <p className="text-sm text-slate-700">{p.descripcion}</p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  {p.responsable && <span>Responsable: {p.responsable}</span>}
                  {p.fecha_limite && <span>Límite: {p.fecha_limite}</span>}
                </div>
                {/* Barra de avance */}
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-almera-500 rounded-full transition-all"
                      style={{ width: `${p.avance}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-8">{p.avance}%</span>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => { setForm({ ...p } as any); setEditId(p.id); setShowForm(true) }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-almera-600 transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => eliminar(p.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
