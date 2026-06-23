import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Indicador } from '@/types'
import { useUserFilter } from '@/lib/useUserFilter'
import Badge, { badgeEstadoIndicador } from '@/components/Badge'
import { Plus, Trash2, Pencil, Search } from 'lucide-react'

const ESTADOS = ['al_dia', 'en_riesgo', 'critico'] as const
const CATEGORIAS = ['calidad', 'proceso', 'resultado'] as const

const ESTADO_LABEL: Record<string, string> = {
  al_dia: 'Al día', en_riesgo: 'En riesgo', critico: 'Crítico'
}

const EMPTY: Partial<Indicador> = {
  codigo: '', nombre: '', categoria: 'proceso',
  estado: 'al_dia', meta: '', resultado: '', observaciones: ''
}

export default function TablaIndicadores() {
  const { periodoActivo } = useAppStore()
  const { filterByUser, createUid, filterKey } = useUserFilter()
  const [items,    setItems]    = useState<Indicador[]>([])
  const [filtro,   setFiltro]   = useState('')
  const [form,     setForm]     = useState<Partial<Indicador>>(EMPTY)
  const [editId,   setEditId]   = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function cargar() {
    if (!periodoActivo) return
    setLoading(true)
    const all = await window.api.indicadores.listar(periodoActivo.id)
    setItems(filterByUser(all))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [periodoActivo, filterKey])

  async function guardar() {
    if (!periodoActivo || !form.nombre) return
    const data = { ...form, periodo_id: periodoActivo.id, usuario_id: createUid }
    if (editId) {
      await window.api.indicadores.actualizar(editId, data)
    } else {
      await window.api.indicadores.crear(data)
    }
    setShowForm(false); setEditId(null); setForm(EMPTY); cargar()
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar este indicador?')) return
    await window.api.indicadores.eliminar(id)
    cargar()
  }

  function editar(item: Indicador) {
    setForm(item); setEditId(item.id); setShowForm(true)
  }

  const filtrados = items.filter(i =>
    i.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
    (i.codigo ?? '').toLowerCase().includes(filtro.toLowerCase())
  )

  if (!periodoActivo) return (
    <p className="text-slate-400 text-sm">Selecciona un período primero.</p>
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar indicador..."
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          />
        </div>
        <button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo indicador
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card p-5 space-y-4 border-almera-200 bg-almera-50/40">
          <h3 className="text-sm font-semibold text-slate-700">
            {editId ? 'Editar indicador' : 'Nuevo indicador'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Código</label>
              <input className="input" placeholder="Ej: IND-01" value={form.codigo ?? ''}
                onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
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
            <label className="label">Nombre del indicador *</label>
            <input className="input" placeholder="Nombre completo" value={form.nombre ?? ''}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.categoria ?? ''}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value as any }))}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Meta</label>
              <input className="input" placeholder="Meta del período" value={form.meta ?? ''}
                onChange={e => setForm(f => ({ ...f, meta: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Resultado</label>
            <input className="input" placeholder="Resultado obtenido" value={form.resultado ?? ''}
              onChange={e => setForm(f => ({ ...f, resultado: e.target.value }))} />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <textarea className="input" rows={2} placeholder="Notas adicionales" value={form.observaciones ?? ''}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="btn-secondary">Cancelar</button>
            <button onClick={guardar} className="btn-primary">Guardar</button>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-almera-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Código</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Meta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Resultado</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-xs">
                  Sin indicadores registrados. Haz clic en «Nuevo indicador» para comenzar.
                </td></tr>
              ) : filtrados.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{item.codigo ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium">{item.nombre}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs capitalize">{item.categoria ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={badgeEstadoIndicador(item.estado)}>{ESTADO_LABEL[item.estado]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{item.meta ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{item.resultado ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => editar(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-almera-600 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => eliminar(item.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
