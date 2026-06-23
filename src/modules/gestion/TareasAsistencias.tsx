import { useEffect, useState } from 'react'
import { useAppStore }   from '@/store/appStore'
import { useUserFilter } from '@/lib/useUserFilter'
import type { Asistencia, Tarea, TareaAdjunto, AsistenciaAdjunto } from '@/types'
import {
  Plus, Trash2, Pencil, Paperclip, ExternalLink, Search,
  CheckCircle2, Circle, Calendar, AlertCircle, Check,
  ClipboardList, CheckSquare, X, ArrowUpDown,
  User, Layers, FileText, Clock, ListTodo,
} from 'lucide-react'
import { GESTIONS_ALMERA, PROCESOS_MAP } from '@/lib/constants'

const SUBPROCESOS = [
  'Gestión del SOGS', 'Métodos de Trabajo', 'Gestión de IAAS',
  'Seguridad del Paciente', 'Gestión de Auditorías',
]

type Mode     = 'todo' | 'tareas' | 'asistencias'
type SortKey  = 'fecha' | 'tipo' | 'prioridad'
type FormType = 'tarea' | 'asistencia'
type Item     = { kind: 'tarea'; data: Tarea } | { kind: 'asistencia'; data: Asistencia }

const EMPTY_T = { titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '', adjunto_ruta: '', adjunto_nombre: '', subproceso: '' }
const EMPTY_A = { proceso: 'Gestión de Calidad y Mejoramiento Institucional', subproceso: '', gestion: '', persona: '', que_se_hizo: '', como_se_hizo: '', fecha: new Date().toISOString().split('T')[0], evidencia_ruta: '', evidencia_nombre: '', cumplido: 0 }

const prioCls  = (p: string) => p === 'alta' ? 'bg-red-50 text-red-600 border-red-200' : p === 'media' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'
const prioIcon = (p: string) => p === 'alta' ? '↑' : p === 'media' ? '→' : '↓'
const pctCol   = (p: number) => p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'
const pctCls   = (p: number) => p >= 80 ? 'text-emerald-600' : p >= 50 ? 'text-amber-500' : 'text-red-500'

// ─── Pequeños helpers UI ──────────────────────────────────────────────────────
function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold whitespace-nowrap ${cls}`}>{children}</span>
}
function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{children}</p>
}
function Ring({ pct, color, size = 56, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c - (pct/100)*c} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)' }}/>
    </svg>
  )
}

// ─── Paneles de adjuntos (vista expandida) ────────────────────────────────────
function TareaAdjuntosPanel({ tareaId }: { tareaId: number }) {
  const [adj, setAdj] = useState<TareaAdjunto[]>([])
  useEffect(() => { window.api.tareas.adjuntos.listar(tareaId).then(setAdj) }, [tareaId])
  async function agregar() {
    const files = await window.api.tareas.seleccionarAdjunto()
    for (const f of files) {
      const nuevo = await window.api.tareas.adjuntos.agregar(tareaId, f.ruta, f.nombre)
      setAdj(a => [...a, nuevo])
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <SL>Adjuntos ({adj.length})</SL>
        <button onClick={agregar} className="flex items-center gap-0.5 text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold"><Plus size={10}/> Añadir</button>
      </div>
      {adj.length === 0
        ? <button onClick={agregar} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"><Paperclip size={11}/> Adjuntar archivos...</button>
        : <>
            {adj.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 group/adj">
                <FileText size={10} className="text-slate-400 flex-shrink-0"/>
                <button onClick={() => window.api.tareas.abrirAdjunto(a.ruta)} className="flex-1 text-[11px] text-slate-600 hover:text-emerald-700 text-left truncate">{a.nombre}</button>
                <button onClick={() => window.api.tareas.abrirAdjunto(a.ruta)} className="text-slate-300 hover:text-slate-500 opacity-0 group-hover/adj:opacity-100"><ExternalLink size={9}/></button>
                <button onClick={async () => { await window.api.tareas.adjuntos.eliminar(a.id); setAdj(x => x.filter(y => y.id !== a.id)) }} className="text-slate-300 hover:text-red-400 opacity-0 group-hover/adj:opacity-100"><X size={9}/></button>
              </div>
            ))}
            <button onClick={agregar} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-600 transition-colors pt-0.5"><Paperclip size={9}/> Añadir más</button>
          </>
      }
    </div>
  )
}

function AsistAdjuntosPanel({ asistenciaId }: { asistenciaId: number }) {
  const [adj, setAdj] = useState<AsistenciaAdjunto[]>([])
  useEffect(() => { window.api.asistencias.adjuntos.listar(asistenciaId).then(setAdj) }, [asistenciaId])
  async function agregar() {
    const files = await window.api.asistencias.seleccionarEvidencia()
    for (const f of files) {
      const nuevo = await window.api.asistencias.adjuntos.agregar(asistenciaId, f.ruta, f.nombre)
      setAdj(a => [...a, nuevo])
    }
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <SL>Evidencias ({adj.length})</SL>
        <button onClick={agregar} className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800 font-semibold"><Plus size={10}/> Añadir</button>
      </div>
      {adj.length === 0
        ? <button onClick={agregar} className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-slate-200 rounded-lg text-[10px] text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors"><Paperclip size={11}/> Adjuntar evidencias...</button>
        : <>
            {adj.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 group/adj">
                <FileText size={10} className="text-slate-400 flex-shrink-0"/>
                <button onClick={() => window.api.asistencias.abrirEvidencia(a.ruta)} className="flex-1 text-[11px] text-slate-600 hover:text-blue-700 text-left truncate">{a.nombre}</button>
                <button onClick={() => window.api.asistencias.abrirEvidencia(a.ruta)} className="text-slate-300 hover:text-slate-500 opacity-0 group-hover/adj:opacity-100"><ExternalLink size={9}/></button>
                <button onClick={async () => { await window.api.asistencias.adjuntos.eliminar(a.id); setAdj(x => x.filter(y => y.id !== a.id)) }} className="text-slate-300 hover:text-red-400 opacity-0 group-hover/adj:opacity-100"><X size={9}/></button>
              </div>
            ))}
            <button onClick={agregar} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors pt-0.5"><Paperclip size={9}/> Añadir más</button>
          </>
      }
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function TareasAsistencias() {
  const { periodoActivo }                      = useAppStore()
  const { filterByUser, createUid, filterKey } = useUserFilter()

  const [tareas,      setTareas]      = useState<Tarea[]>([])
  const [asistencias, setAsistencias] = useState<Asistencia[]>([])
  const [mode,        setMode]        = useState<Mode>('todo')
  const [sortKey,     setSortKey]     = useState<SortKey>('fecha')
  const [filtro,      setFiltro]      = useState('')
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  const [showForm,        setShowForm]        = useState(false)
  const [formType,        setFormType]        = useState<FormType>('tarea')
  const [editId,          setEditId]          = useState<number | null>(null)
  const [formT,           setFormT]           = useState({ ...EMPTY_T })
  const [formA,           setFormA]           = useState({ ...EMPTY_A })
  const [completandoId,   setCompletandoId]   = useState<number | null>(null)
  const [notaCierre,      setNotaCierre]      = useState('')
  const [cierreAdjunto,   setCierreAdjunto]   = useState<{ ruta: string; nombre: string } | null>(null)
  const [pendingAdjuntos, setPendingAdjuntos] = useState<{ ruta: string; nombre: string }[]>([])

  async function cargar() {
    if (!periodoActivo) return
    setLoading(true)
    const [t, a] = await Promise.all([
      window.api.tareas.listar(periodoActivo.id),
      window.api.asistencias.listar(periodoActivo.id),
    ])
    setTareas(filterByUser(t))
    setAsistencias(filterByUser(a))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [periodoActivo, filterKey])

  const hoy   = new Date().toISOString().split('T')[0]
  const tComp = tareas.filter(t => (t as any).estado === 'completada').length
  const tVenc = tareas.filter(t => (t as any).estado !== 'completada' && t.fecha_limite && t.fecha_limite < hoy).length
  const pctT  = tareas.length > 0 ? Math.round(tComp / tareas.length * 100) : 0
  const aCump = asistencias.filter(a => a.cumplido).length
  const pctA  = asistencias.length > 0 ? Math.round(aCump / asistencias.length * 100) : 0
  const total = tareas.length + asistencias.length
  const totalOk = tComp + aCump
  const pctG  = total > 0 ? Math.round(totalOk / total * 100) : 0

  // Lista unificada filtrada + ordenada
  const unified: Item[] = [
    ...tareas.map(d => ({ kind: 'tarea' as const, data: d })),
    ...asistencias.map(d => ({ kind: 'asistencia' as const, data: d })),
  ]

  const filtered = unified.filter(i => {
    if (mode === 'tareas'      && i.kind !== 'tarea')      return false
    if (mode === 'asistencias' && i.kind !== 'asistencia') return false
    if (!filtro) return true
    const q = filtro.toLowerCase()
    return i.kind === 'tarea'
      ? i.data.titulo.toLowerCase().includes(q) || (i.data.descripcion ?? '').toLowerCase().includes(q)
      : i.data.proceso.toLowerCase().includes(q) || i.data.persona.toLowerCase().includes(q) || i.data.que_se_hizo.toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'tipo')      return a.kind.localeCompare(b.kind)
    if (sortKey === 'prioridad') {
      const ord: any = { alta: 0, media: 1, baja: 2 }
      const pa = a.kind === 'tarea' ? (a.data as any).prioridad ?? 'baja' : 'media'
      const pb = b.kind === 'tarea' ? (b.data as any).prioridad ?? 'baja' : 'media'
      return (ord[pa] ?? 2) - (ord[pb] ?? 2)
    }
    const da = a.kind === 'tarea' ? (a.data.fecha_limite ?? '') : a.data.fecha
    const db = b.kind === 'tarea' ? (b.data.fecha_limite ?? '') : b.data.fecha
    return db.localeCompare(da)
  })

  const isDone    = (i: Item) => i.kind === 'tarea' ? (i.data as any).estado === 'completada' : !!i.data.cumplido
  const pendientes  = sorted.filter(i => !isDone(i))
  const completadas = sorted.filter(i =>  isDone(i))

  // Form helpers
  function cerrar() { setShowForm(false); setEditId(null); setFormT({ ...EMPTY_T }); setFormA({ ...EMPTY_A }); setPendingAdjuntos([]) }
  function abrirNuevo(t: FormType) { setFormType(t); setEditId(null); setFormT({ ...EMPTY_T }); setFormA({ ...EMPTY_A }); setPendingAdjuntos([]); setShowForm(true) }

  async function guardarTarea() {
    if (!formT.titulo) return
    const d = { ...formT, periodo_id: periodoActivo?.id, usuario_id: createUid }
    let saved: Tarea
    if (editId) saved = await window.api.tareas.actualizar(editId, d)
    else        saved = await window.api.tareas.crear(d)
    for (const f of pendingAdjuntos) await window.api.tareas.adjuntos.agregar(saved.id, f.ruta, f.nombre)
    cerrar(); cargar()
  }

  async function guardarAsist() {
    if (!periodoActivo || !formA.proceso || !formA.persona || !formA.que_se_hizo) return
    const d = { ...formA, periodo_id: periodoActivo.id, usuario_id: createUid }
    let saved: Asistencia
    if (editId) saved = await window.api.asistencias.actualizar(editId, d)
    else        saved = await window.api.asistencias.crear(d)
    for (const f of pendingAdjuntos) await window.api.asistencias.adjuntos.agregar(saved.id, f.ruta, f.nombre)
    cerrar(); cargar()
  }

  function editarT(t: Tarea) {
    setFormType('tarea'); setEditId(t.id); setShowForm(true); setCompletandoId(null); setPendingAdjuntos([])
    setFormT({ titulo: t.titulo, descripcion: t.descripcion ?? '', prioridad: (t as any).prioridad ?? 'media', fecha_limite: t.fecha_limite ?? '', adjunto_ruta: t.adjunto_ruta ?? '', adjunto_nombre: t.adjunto_nombre ?? '', subproceso: (t as any).subproceso ?? '' })
  }
  function editarA(a: Asistencia) {
    setFormType('asistencia'); setEditId(a.id); setShowForm(true); setPendingAdjuntos([])
    setFormA({ proceso: a.proceso, subproceso: (a as any).subproceso ?? '', gestion: a.gestion ?? '', persona: a.persona, que_se_hizo: a.que_se_hizo, como_se_hizo: a.como_se_hizo ?? '', fecha: a.fecha, evidencia_ruta: a.evidencia_ruta ?? '', evidencia_nombre: a.evidencia_nombre ?? '', cumplido: a.cumplido })
  }

  if (!periodoActivo) return <p className="text-slate-400 text-sm">Selecciona un período primero.</p>

  // ── Card de tarea ────────────────────────────────────────────────────────────
  function renderTarea(t: Tarea, idx: number) {
    const key        = `tarea-${t.id}`
    const exp        = expandedId === key
    const isComp     = (t as any).estado === 'completada'
    const isVenc     = !isComp && t.fecha_limite && t.fecha_limite < hoy
    const prio       = (t as any).prioridad ?? 'media'
    const isComplete = completandoId === t.id

    return (
      <div key={key} className={`rounded-xl border transition-all duration-200 overflow-hidden shadow-sm ${
        isComp ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white'
               : isVenc ? 'border-red-200 bg-gradient-to-br from-red-50/40 to-white'
               : 'border-slate-200 bg-white hover:border-emerald-200 hover:shadow-md'
      }`}>
        <div className="flex">
          {/* barra lateral de color */}
          <div className={`w-1 flex-shrink-0 ${isComp ? 'bg-emerald-400' : isVenc ? 'bg-red-400' : prio === 'alta' ? 'bg-red-300' : prio === 'media' ? 'bg-amber-300' : 'bg-slate-200'}`}/>

          <div className="flex-1 p-3 min-w-0">
            {/* fila superior: tipo + prioridad + fecha + acciones */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center flex-shrink-0">{idx}</span>
                <Chip cls="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckSquare size={8}/>Tarea</Chip>
                <Chip cls={prioCls(prio)}>{prioIcon(prio)} {prio.charAt(0).toUpperCase()+prio.slice(1)}</Chip>
                {t.fecha_limite && (
                  <span className={`flex items-center gap-1 text-[10px] font-medium ${isVenc ? 'text-red-500' : 'text-slate-400'}`}>
                    <Calendar size={9}/>{t.fecha_limite}{isVenc && <span className="font-bold"> · VENCIDA</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => setExpandedId(exp ? null : key)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors">
                  {exp ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/></svg>
                       : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>}
                </button>
                {!isComp && <button onClick={() => editarT(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-almera-600 transition-colors"><Pencil size={12}/></button>}
                <button onClick={async () => { if (!confirm('¿Eliminar esta tarea?')) return; await window.api.tareas.eliminar(t.id); cargar() }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
              </div>
            </div>

            {/* título + círculo completar */}
            <div className="flex items-start gap-2.5">
              {!isComp
                ? <button onClick={() => { setCompletandoId(isComplete ? null : t.id); setNotaCierre('') }}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isComplete ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-emerald-50'}`}>
                    {isComplete && <Check size={9} className="text-emerald-500"/>}
                  </button>
                : <div className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Check size={9} className="text-white"/>
                  </div>
              }
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold leading-snug text-slate-800 ${isComp ? 'opacity-60' : ''}`}>{t.titulo}</p>
                {t.descripcion && <p className={`text-[11px] text-slate-500 mt-0.5 leading-relaxed ${exp ? '' : 'line-clamp-1'}`}>{t.descripcion}</p>}
                {isComp && t.completada_en && <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1 font-medium"><Check size={8}/>Completada el {t.completada_en.split(' ')[0]}</p>}
              </div>
            </div>

            {/* panel de cierre */}
            {isComplete && (
              <div className="mt-3 pt-3 border-t border-emerald-100 space-y-2.5">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Cierre de tarea</p>
                <textarea className="input text-xs resize-none w-full" rows={2} placeholder="¿Qué se hizo como solución?" value={notaCierre} onChange={e => setNotaCierre(e.target.value)}/>
                <div>
                  <button onClick={async () => { const files = await window.api.tareas.seleccionarAdjunto(); if (files.length) setCierreAdjunto(files[0]) }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed text-xs transition-all ${cierreAdjunto ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-emerald-300 text-slate-400'}`}>
                    <Paperclip size={11}/><span className="truncate flex-1 text-left">{cierreAdjunto ? cierreAdjunto.nombre : 'Adjuntar evidencia de cierre...'}</span>
                    {cierreAdjunto && <button onClick={e => { e.stopPropagation(); setCierreAdjunto(null) }}><X size={10}/></button>}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setCompletandoId(null); setNotaCierre(''); setCierreAdjunto(null) }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50">Cancelar</button>
                  <button onClick={async () => { await window.api.tareas.toggleCompletar(t.id, notaCierre || undefined, cierreAdjunto?.ruta, cierreAdjunto?.nombre); setCompletandoId(null); setNotaCierre(''); setCierreAdjunto(null); cargar() }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95">
                    <Check size={10}/> Completar
                  </button>
                </div>
              </div>
            )}

            {/* vista expandida */}
            {exp && !isComplete && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(t as any).subproceso && (
                    <div><SL>Subproceso</SL><p className="text-slate-700">{(t as any).subproceso}</p></div>
                  )}
                  {t.fecha_limite && (
                    <div><SL>Fecha límite</SL><p className={isVenc ? 'text-red-600 font-semibold' : 'text-slate-700'}>{t.fecha_limite}</p></div>
                  )}
                  {t.notas_cierre && (
                    <div className="col-span-2">
                      <SL>¿Qué se hizo?</SL>
                      <p className="text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 leading-relaxed">{t.notas_cierre}</p>
                    </div>
                  )}
                </div>
                {(t as any).cierre_adjunto_nombre && (
                  <div>
                    <SL>Evidencia de solución</SL>
                    <button onClick={() => window.api.tareas.abrirAdjunto((t as any).cierre_adjunto_ruta)}
                      className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 w-full">
                      <Paperclip size={10} className="text-slate-400"/><span className="truncate">{(t as any).cierre_adjunto_nombre}</span><ExternalLink size={9} className="ml-auto text-slate-300"/>
                    </button>
                  </div>
                )}
                <TareaAdjuntosPanel tareaId={t.id}/>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Card de asistencia ───────────────────────────────────────────────────────
  function renderAsistencia(a: Asistencia, idx: number) {
    const key = `asistencia-${a.id}`
    const exp = expandedId === key
    return (
      <div key={key} className={`rounded-xl border transition-all duration-200 overflow-hidden shadow-sm ${
        a.cumplido ? 'border-blue-200 bg-gradient-to-br from-blue-50/60 to-white' : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-md'
      }`}>
        <div className="flex">
          <div className={`w-1 flex-shrink-0 ${a.cumplido ? 'bg-blue-400' : 'bg-slate-200'}`}/>
          <div className="flex-1 p-3 min-w-0">

            {/* fila superior */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center flex-shrink-0">{idx}</span>
                <Chip cls="bg-blue-50 text-blue-700 border-blue-200"><ClipboardList size={8}/>Asistencia</Chip>
                {a.gestion && <Chip cls="bg-violet-50 text-violet-700 border-violet-200"><Layers size={8}/>{a.gestion}</Chip>}
                <span className="flex items-center gap-1 text-[10px] text-slate-400"><Calendar size={9}/>{a.fecha}</span>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => setExpandedId(exp ? null : key)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-slate-600 transition-colors">
                  {exp ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/></svg>
                       : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/></svg>}
                </button>
                <button onClick={() => editarA(a)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-almera-600 transition-colors"><Pencil size={12}/></button>
                <button onClick={async () => { if (!confirm('¿Eliminar esta asistencia?')) return; await window.api.asistencias.eliminar(a.id); cargar() }} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
              </div>
            </div>

            {/* contenido principal */}
            <div className="flex items-start gap-2.5">
              <button onClick={async () => { await window.api.asistencias.actualizar(a.id, { ...a, cumplido: a.cumplido ? 0 : 1 }); cargar() }}
                className={`mt-0.5 flex-shrink-0 transition-all active:scale-90 ${a.cumplido ? 'text-blue-500 hover:text-blue-700' : 'text-slate-300 hover:text-blue-500'}`}>
                {a.cumplido ? <CheckCircle2 size={18}/> : <Circle size={18}/>}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-slate-400 leading-tight truncate mb-0.5">{a.proceso}</p>
                <p className={`text-xs font-semibold leading-snug text-slate-800 ${exp ? '' : 'line-clamp-2'}`}>{a.que_se_hizo}</p>
                <p className="flex items-center gap-1 text-[10px] text-slate-400 mt-1"><User size={9}/>{a.persona}</p>
              </div>
            </div>

            {/* expandido */}
            {exp && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><SL>Proceso</SL><p className="text-slate-700 text-[11px] leading-snug">{a.proceso}</p></div>
                  {(a as any).subproceso && <div><SL>Subproceso</SL><p className="text-slate-700 text-[11px]">{(a as any).subproceso}</p></div>}
                  <div><SL>Persona atendida</SL><p className="text-slate-700 text-[11px]">{a.persona}</p></div>
                  {a.gestion && <div><SL>Módulo Almera</SL><p className="text-slate-700 text-[11px]">{a.gestion}</p></div>}
                  {a.como_se_hizo && <div className="col-span-2"><SL>¿Cómo se hizo?</SL><p className="text-slate-700 text-[11px] leading-relaxed">{a.como_se_hizo}</p></div>}
                </div>
                <AsistAdjuntosPanel asistenciaId={a.id}/>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderItem(item: Item, idx: number) {
    return item.kind === 'tarea' ? renderTarea(item.data, idx) : renderAsistencia(item.data, idx)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── STATS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* General */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <Ring pct={pctG} color={pctCol(pctG)}/>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-[11px] font-black ${pctCls(pctG)}`}>{pctG}%</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">General</p>
            <p className="text-xl font-black text-slate-800 leading-tight">{totalOk}<span className="text-xs font-normal text-slate-400">/{total}</span></p>
            <p className="text-[10px] text-slate-400">{total - totalOk} pendientes</p>
          </div>
        </div>

        {/* Tareas */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5"><CheckSquare size={12} className="text-emerald-500"/><span className="text-xs font-semibold text-slate-600">Tareas</span></div>
            <span className={`text-sm font-black ${pctCls(pctT)}`}>{pctT}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctT}%`, backgroundColor: pctCol(pctT) }}/>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">{tComp}/{tareas.length} completadas</span>
            {tVenc > 0 && <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500"><AlertCircle size={9}/>{tVenc} venc.</span>}
          </div>
        </div>

        {/* Asistencias */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5"><ClipboardList size={12} className="text-blue-500"/><span className="text-xs font-semibold text-slate-600">Asistencias</span></div>
            <span className={`text-sm font-black ${pctCls(pctA)}`}>{pctA}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctA}%`, backgroundColor: pctCol(pctA) }}/>
          </div>
          <div className="mt-1.5">
            <span className="text-[10px] text-slate-400">{aCump}/{asistencias.length} cumplidas</span>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* modo */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([
            { id: 'todo' as Mode,        label: 'Todo',        n: total },
            { id: 'tareas' as Mode,      label: 'Tareas',      n: tareas.length },
            { id: 'asistencias' as Mode, label: 'Asistencias', n: asistencias.length },
          ]).map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${mode === m.id ? 'bg-white text-almera-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {m.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${mode === m.id ? 'bg-almera-100 text-almera-700' : 'bg-slate-200 text-slate-500'}`}>{m.n}</span>
            </button>
          ))}
        </div>

        {/* buscar */}
        <div className="relative flex-1 min-w-40 max-w-sm">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input className="input pl-8 text-sm" placeholder="Buscar..." value={filtro} onChange={e => setFiltro(e.target.value)}/>
          {filtro && <button onClick={() => setFiltro('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={12}/></button>}
        </div>

        {/* ordenar */}
        <button onClick={() => setSortKey(k => k === 'fecha' ? 'prioridad' : k === 'prioridad' ? 'tipo' : 'fecha')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-all">
          <ArrowUpDown size={12}/>{sortKey === 'fecha' ? 'Fecha' : sortKey === 'prioridad' ? 'Prioridad' : 'Tipo'}
        </button>

        {/* nuevos */}
        <div className="flex gap-2 ml-auto">
          <button onClick={() => abrirNuevo('asistencia')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-medium transition-all shadow-sm shadow-blue-200">
            <ClipboardList size={13}/> Nueva asistencia
          </button>
          <button onClick={() => abrirNuevo('tarea')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-sm font-medium transition-all shadow-sm shadow-emerald-200">
            <Plus size={13}/> Nueva tarea
          </button>
        </div>
      </div>

      {/* ── FORMULARIO ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className={`rounded-xl border shadow-sm overflow-hidden ${formType === 'tarea' ? 'border-emerald-200' : 'border-blue-200'}`}>
          {/* cabecera del form */}
          <div className={`px-4 py-3 flex items-center justify-between border-b ${formType === 'tarea' ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
            <div className="flex items-center gap-2">
              {formType === 'tarea' ? <CheckSquare size={14} className="text-emerald-600"/> : <ClipboardList size={14} className="text-blue-600"/>}
              <p className={`font-semibold text-sm ${formType === 'tarea' ? 'text-emerald-800' : 'text-blue-800'}`}>
                {editId ? `Editar ${formType === 'tarea' ? 'tarea' : 'asistencia'}` : formType === 'tarea' ? 'Nueva tarea' : 'Registrar asistencia técnica'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!editId && (
                <div className="flex gap-0.5 bg-white/60 p-0.5 rounded-lg border border-slate-200">
                  <button onClick={() => { setFormType('tarea'); setPendingAdjuntos([]) }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${formType === 'tarea' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><CheckSquare size={10}/>Tarea</button>
                  <button onClick={() => { setFormType('asistencia'); setPendingAdjuntos([]) }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${formType === 'asistencia' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ClipboardList size={10}/>Asistencia</button>
                </div>
              )}
              <button onClick={cerrar} className="p-1 rounded-lg hover:bg-slate-200 text-slate-400"><X size={14}/></button>
            </div>
          </div>

          <div className="bg-white p-4 space-y-4">
            {formType === 'tarea' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Título <span className="text-red-400">*</span></label>
                    <input className="input" placeholder="¿Qué hay que hacer?" value={formT.titulo} onChange={e => setFormT(f => ({ ...f, titulo: e.target.value }))}/>
                  </div>
                  <div className="col-span-2">
                    <label className="label">Descripción</label>
                    <textarea className="input resize-none" rows={2} placeholder="Contexto, instrucciones, resultados esperados..." value={formT.descripcion} onChange={e => setFormT(f => ({ ...f, descripcion: e.target.value }))}/>
                  </div>
                  <div>
                    <label className="label">Subproceso</label>
                    <select className="input text-sm" value={formT.subproceso} onChange={e => setFormT(f => ({ ...f, subproceso: e.target.value }))}>
                      <option value="">— Sin especificar —</option>
                      {SUBPROCESOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Fecha límite</label>
                    <input type="date" className="input" value={formT.fecha_limite} onChange={e => setFormT(f => ({ ...f, fecha_limite: e.target.value }))}/>
                  </div>
                </div>
                <div>
                  <label className="label">Prioridad</label>
                  <div className="flex gap-2 mt-1">
                    {['alta','media','baja'].map(p => (
                      <button key={p} onClick={() => setFormT(f => ({ ...f, prioridad: p }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${formT.prioridad === p ? prioCls(p) + ' border-current' : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                        {prioIcon(p)} {p.charAt(0).toUpperCase()+p.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Adjuntos</label>
                  <div className="space-y-1.5 mt-1">
                    {pendingAdjuntos.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                        <FileText size={10} className="text-emerald-500 flex-shrink-0"/>
                        <span className="flex-1 text-[11px] text-emerald-800 truncate font-medium">{f.nombre}</span>
                        <button onClick={() => setPendingAdjuntos(a => a.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400"><X size={10}/></button>
                      </div>
                    ))}
                    <button onClick={async () => { const files = await window.api.tareas.seleccionarAdjunto(); if (files.length) setPendingAdjuntos(a => [...a, ...files]) }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-300 text-xs text-slate-400 hover:text-emerald-600 transition-all">
                      <Paperclip size={12}/>{pendingAdjuntos.length ? 'Añadir más archivos...' : 'Adjuntar archivos (PDF, imagen, documento...)'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Proceso <span className="text-red-400">*</span></label>
                    <select className="input" value={formA.proceso} onChange={e => setFormA(f => ({ ...f, proceso: e.target.value }))}>
                      {PROCESOS_MAP.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Subproceso</label>
                    <select className="input" value={formA.subproceso} onChange={e => setFormA(f => ({ ...f, subproceso: e.target.value }))}>
                      <option value="">— Sin especificar —</option>
                      {SUBPROCESOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Módulo Almera</label>
                    <select className="input" value={formA.gestion} onChange={e => setFormA(f => ({ ...f, gestion: e.target.value }))}>
                      <option value="">— Sin módulo —</option>
                      {GESTIONS_ALMERA.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Persona atendida <span className="text-red-400">*</span></label>
                    <input className="input" placeholder="Nombre completo" value={formA.persona} onChange={e => setFormA(f => ({ ...f, persona: e.target.value }))}/>
                  </div>
                  <div>
                    <label className="label">Fecha</label>
                    <input type="date" className="input" value={formA.fecha} onChange={e => setFormA(f => ({ ...f, fecha: e.target.value }))}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">¿Qué se hizo? <span className="text-red-400">*</span></label>
                    <textarea className="input resize-none" rows={3} placeholder="Describe la asistencia técnica realizada..." value={formA.que_se_hizo} onChange={e => setFormA(f => ({ ...f, que_se_hizo: e.target.value }))}/>
                  </div>
                  <div>
                    <label className="label">¿Cómo se hizo?</label>
                    <textarea className="input resize-none" rows={3} placeholder="Metodología, herramientas, pasos seguidos..." value={formA.como_se_hizo} onChange={e => setFormA(f => ({ ...f, como_se_hizo: e.target.value }))}/>
                  </div>
                </div>
                <div>
                  <label className="label">Evidencias adjuntas</label>
                  <div className="space-y-1.5 mt-1">
                    {pendingAdjuntos.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                        <FileText size={10} className="text-blue-500 flex-shrink-0"/>
                        <span className="flex-1 text-[11px] text-blue-800 truncate font-medium">{f.nombre}</span>
                        <button onClick={() => setPendingAdjuntos(a => a.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400"><X size={10}/></button>
                      </div>
                    ))}
                    <button onClick={async () => { const files = await window.api.asistencias.seleccionarEvidencia(); if (files.length) setPendingAdjuntos(a => [...a, ...files]) }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 text-xs text-slate-400 hover:text-blue-600 transition-all">
                      <Paperclip size={12}/>{pendingAdjuntos.length ? 'Añadir más evidencias...' : 'Adjuntar evidencias (acta, correo, captura, PDF...)'}
                    </button>
                  </div>
                </div>
              </>
            )}
            <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
              <button onClick={cerrar} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancelar</button>
              <button onClick={formType === 'tarea' ? guardarTarea : guardarAsist}
                className={`px-5 py-2 rounded-xl text-white text-sm font-semibold active:scale-95 shadow-sm ${formType === 'tarea' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}>
                {editId ? 'Guardar cambios' : formType === 'tarea' ? 'Crear tarea' : 'Registrar asistencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COLUMNAS ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white rounded-xl border border-slate-100 animate-pulse"/>)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 items-start">

          {/* Columna izquierda — Completadas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500"/>
                <p className="text-sm font-semibold text-slate-600">Completadas / Cumplidas</p>
              </div>
              <span className="text-xs font-black text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">{completadas.length}</span>
            </div>
            {completadas.length === 0
              ? <div className="rounded-xl border-2 border-dashed border-emerald-100 p-8 flex flex-col items-center gap-2 text-emerald-300">
                  <CheckCircle2 size={24}/>
                  <p className="text-xs font-medium">Aún sin completar</p>
                </div>
              : <div className="space-y-2 opacity-80">
                  {completadas.map((item, i) => renderItem(item, i + 1))}
                </div>
            }
          </div>

          {/* Columna derecha — Pendientes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-slate-400"/>
                <p className="text-sm font-semibold text-slate-600">Por realizar</p>
                {tVenc > 0 && <span className="flex items-center gap-1 text-[10px] text-red-500 font-semibold"><AlertCircle size={9}/>{tVenc} vencida{tVenc > 1 ? 's' : ''}</span>}
              </div>
              <span className="text-xs font-black text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">{pendientes.length}</span>
            </div>
            {pendientes.length === 0
              ? <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center gap-2 text-slate-300">
                  <ListTodo size={24}/>
                  <p className="text-xs font-medium">Sin pendientes</p>
                </div>
              : <div className="space-y-2">
                  {pendientes.map((item, i) => renderItem(item, i + 1))}
                </div>
            }
          </div>
        </div>
      )}

      {/* ── PIE ─────────────────────────────────────────────────────────── */}
      {(pendientes.length + completadas.length) > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-2.5 flex items-center gap-5 text-[11px] text-slate-400 shadow-sm">
          <span className="font-semibold text-slate-600">{pendientes.length + completadas.length} registros</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block"/>{pendientes.length} pendientes</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"/>{completadas.length} completados</span>
          {tVenc > 0 && mode !== 'asistencias' && <span className="flex items-center gap-1 text-red-400 font-semibold"><AlertCircle size={9}/>{tVenc} vencida{tVenc > 1 ? 's' : ''}</span>}
          {filtro && <span className="ml-auto italic text-slate-300">Filtro: "{filtro}"</span>}
        </div>
      )}
    </div>
  )
}
