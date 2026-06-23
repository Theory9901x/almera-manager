import { useEffect, useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { useNavigate } from 'react-router-dom'
import { useUserFilter } from '@/lib/useUserFilter'
import type { PeriodoStats, Tarea } from '@/types'
import {
  ClipboardList, CheckSquare, BookOpen, Activity,
  ArrowRight, Plus, FileText, Calendar,
  AlertCircle, Clock, CheckCircle2, BarChart2, TrendingUp,
} from 'lucide-react'
import { PieDonut, VBarChart, ChartLegend } from '@/components/Charts'

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']


function HeaderRing({ pct }: { pct: number }) {
  const color = pct >= 75 ? '#34d399' : pct >= 40 ? '#fbbf24' : '#f87171'
  const r = 26, c = 2 * Math.PI * r
  return (
    <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5}/>
      <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${c}`} strokeDashoffset={`${c - (pct/100)*c}`} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 5px ${color}88)` }}/>
    </svg>
  )
}

function prioCls(p: string) {
  if (p === 'alta')  return { text: 'text-red-500',   bg: 'bg-red-50',   icon: AlertCircle }
  if (p === 'media') return { text: 'text-amber-600', bg: 'bg-amber-50', icon: Clock }
  return                    { text: 'text-slate-400', bg: 'bg-slate-50', icon: CheckCircle2 }
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

const STATS = [
  { key: 'asistencias',    label: 'Asistencias',    sub: 'técnicas',    color: '#3b82f6', borderCls: 'border-l-blue-400',    icon: ClipboardList, nav: '/gestion' },
  { key: 'capacitaciones', label: 'Capacitaciones', sub: 'registradas', color: '#8b5cf6', borderCls: 'border-l-violet-400',  icon: BookOpen,      nav: '/gestion' },
  { key: 'tareas_ok',      label: 'Tareas',         sub: 'completadas', color: '#10b981', borderCls: 'border-l-emerald-400', icon: CheckSquare,   nav: '/gestion' },
  { key: 'indicadores',    label: 'Indicadores',    sub: 'gestionados', color: '#f59e0b', borderCls: 'border-l-amber-400',   icon: Activity,      nav: '/gestion' },
] as const

const ACCIONES = [
  { label: 'Nueva asistencia', icon: ClipboardList, iconCls: 'text-blue-600',    bgCls: 'bg-blue-50',    nav: '/gestion'  },
  { label: 'Nueva tarea',      icon: CheckSquare,   iconCls: 'text-emerald-600', bgCls: 'bg-emerald-50', nav: '/gestion'  },
  { label: 'Ver indicadores',  icon: Activity,      iconCls: 'text-violet-600',  bgCls: 'bg-violet-50',  nav: '/gestion'  },
  { label: 'Generar informe',  icon: FileText,      iconCls: 'text-amber-600',   bgCls: 'bg-amber-50',   nav: '/informes' },
]

export default function Dashboard() {
  const { periodoActivo, periodos, setPeriodoActivo } = useAppStore()
  const { filterByUser, createUid, filterKey } = useUserFilter()
  const [stats,   setStats]   = useState<PeriodoStats | null>(null)
  const [tareas,  setTareas]  = useState<Tarea[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    if (!periodoActivo) return
    setLoading(true)
    Promise.all([
      window.api.periodos.stats(periodoActivo.id, createUid),
      window.api.tareas.listar(periodoActivo.id),
    ]).then(([s, t]) => {
      setStats(s)
      setTareas(filterByUser(t).filter((x: Tarea) => (x as any).estado !== 'completada').slice(0, 8))
      setLoading(false)
    })
  }, [periodoActivo, filterKey])

  const cumplimiento = stats && stats.tareas_total > 0 ? Math.round((stats.tareas_ok / stats.tareas_total) * 100) : 0
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-full bg-[#f8fafc]">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="bg-[#1e293b] px-8 pt-5 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-slate-400 text-[11px] mb-1">
              {greet()} · <span className="capitalize">{new Date().toLocaleDateString('es-ES',{ weekday:'long', day:'numeric', month:'long' })}</span>
            </p>
            <h1 className="text-xl font-bold text-white">
              {MESES[periodoActivo!.mes]} <span className="text-slate-400 font-normal">{periodoActivo!.anio}</span>
            </h1>
            <p className="text-slate-500 text-[11px] mt-0.5">Almera — Salud Yopal</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  className="appearance-none bg-slate-700/50 text-white text-xs rounded-lg px-3 py-1.5 border border-slate-600/60 cursor-pointer focus:outline-none focus:border-slate-400 pr-7"
                  value={periodoActivo!.id}
                  onChange={e => { const p = periodos.find(x => x.id === Number(e.target.value)); if (p) setPeriodoActivo(p) }}>
                  {periodos.map(p => <option key={p.id} value={p.id} className="text-slate-800 bg-white">{MESES[p.mes]} {p.anio}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
              </div>
              <span className={`text-[11px] px-2.5 py-1 rounded-md font-medium border ${
                periodoActivo!.estado === 'activo'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                  : 'bg-slate-700/40 text-slate-400 border-slate-600/40'
              }`}>{periodoActivo!.estado}</span>
            </div>

            <div className="flex items-center gap-2.5 pl-4 border-l border-slate-700">
              <div className="relative">
                <HeaderRing pct={cumplimiento}/>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-white font-bold text-sm leading-none">{cumplimiento}%</span>
                </div>
              </div>
              <div>
                <p className="text-slate-300 text-xs font-semibold leading-tight">Cumplimiento</p>
                <p className="text-slate-500 text-[10px]">{stats?.tareas_ok ?? 0}/{stats?.tareas_total ?? 0} tareas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-4 gap-2">
          {loading
            ? [1,2,3,4].map(i => <div key={i} className="h-14 rounded-lg bg-slate-700/30 animate-pulse"/>)
            : STATS.map(({ key, label, sub, color, borderCls, icon: Icon, nav }) => {
              const val = stats ? stats[key as keyof PeriodoStats] ?? 0 : 0
              return (
                <button key={key} onClick={() => navigate(nav)}
                  className={`group bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/60 border-l-2 ${borderCls} rounded-lg px-3.5 py-2.5 text-left transition-all`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-bold text-lg leading-none">{val}</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">{label}</p>
                      <p className="text-slate-500 text-[10px]">{sub}</p>
                    </div>
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: color + '22' }}>
                      <Icon size={13} style={{ color }}/>
                    </div>
                  </div>
                </button>
              )
            })
          }
        </div>
      </div>

      {/* ── BODY ──────────────────────────────────────────────────────────── */}
      <div className="px-8 py-5 space-y-4">

        {/* Actions + Tasks grid */}
        <div className="grid grid-cols-4 gap-4">

          {/* Quick actions */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Acciones rápidas</p>
            <div className="space-y-1">
              {ACCIONES.map(({ label, icon: Icon, iconCls, bgCls, nav }) => (
                <button key={label} onClick={() => navigate(nav)}
                  className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all text-left">
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${bgCls}`}>
                    <Icon size={12} className={iconCls}/>
                  </div>
                  <span className="text-xs text-slate-700 group-hover:text-slate-900 flex-1">{label}</span>
                  <ArrowRight size={10} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all"/>
                </button>
              ))}
            </div>

            {periodoActivo?.notas && (
              <div className="mt-3 bg-white rounded-lg border border-slate-100 p-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notas del período</p>
                <p className="text-xs text-slate-600 leading-relaxed">{periodoActivo.notas}</p>
              </div>
            )}
          </div>

          {/* Pending tasks */}
          <div className="col-span-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tareas pendientes</p>
              <button onClick={() => navigate('/gestion')}
                className="flex items-center gap-1 text-[11px] text-almera-600 hover:text-almera-800 font-semibold transition-colors group">
                Ver todas <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform"/>
              </button>
            </div>

            {loading ? (
              <div className="space-y-1.5">{[1,2,3,4].map(i => <div key={i} className="bg-white rounded-lg border border-slate-100 h-10 animate-pulse"/>)}</div>
            ) : tareas.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-emerald-200 px-5 py-7 text-center">
                <CheckCircle2 size={22} className="text-emerald-300 mx-auto mb-2"/>
                <p className="text-slate-600 font-semibold text-sm">Todo al día</p>
                <p className="text-slate-400 text-xs mt-0.5">Sin tareas pendientes en este período</p>
                <button onClick={() => navigate('/gestion')}
                  className="mt-3 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all">
                  <Plus size={11}/> Nueva tarea
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {tareas.map(t => {
                  const prio    = (t as any).prioridad ?? 'baja'
                  const cls     = prioCls(prio)
                  const Icono   = cls.icon
                  const vencida = t.fecha_limite && t.fecha_limite < today
                  return (
                    <div key={t.id} onClick={() => navigate('/gestion')}
                      className={`group bg-white rounded-lg border px-3 py-2 cursor-pointer transition-all hover:shadow-sm flex items-center gap-3 ${
                        vencida ? 'border-red-200 bg-red-50/30' : 'border-slate-100 hover:border-slate-200'
                      }`}>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${cls.bg}`}>
                        <Icono size={11} className={cls.text}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate leading-snug">{t.titulo}</p>
                        {t.fecha_limite && (
                          <p className={`text-[10px] flex items-center gap-1 ${vencida ? 'text-red-500' : 'text-slate-400'}`}>
                            <Calendar size={8}/>{t.fecha_limite}{vencida ? ' · VENCIDA' : ''}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${cls.bg} ${cls.text}`}>{prio}</span>
                    </div>
                  )
                })}
                <button onClick={() => navigate('/gestion')}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-200 text-slate-400 hover:border-almera-300 hover:text-almera-600 text-xs font-medium transition-all mt-0.5">
                  <Plus size={11}/> Agregar tarea
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Adherencia + gráficos */}
        {!loading && stats && (() => {
          const CATS = [
            { label: 'Asistencias', ok: stats.asistencias_cumplidas ?? 0, total: stats.asistencias,              color: '#3b82f6' },
            { label: 'Capacitaciones', ok: stats.capacitaciones_completas ?? 0, total: stats.capacitaciones,    color: '#8b5cf6' },
            { label: 'Tareas',      ok: stats.tareas_ok,                   total: stats.tareas_total,            color: '#10b981' },
          ]
          const totalOk   = CATS.reduce((s, c) => s + c.ok,    0)
          const totalRecs = CATS.reduce((s, c) => s + c.total, 0)
          const pctGlobal = totalRecs > 0 ? Math.round((totalOk / totalRecs) * 100) : 0

          return (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={12} className="text-slate-400"/>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Adherencia del período</p>
              </div>

              <div className="grid grid-cols-3 gap-5">

                {/* Donut: distribución por tipo */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider self-start">Por tipo</p>
                  <div className="flex items-center gap-3">
                    <PieDonut
                      segments={CATS.map(c => ({ label: c.label, value: c.total, color: c.color }))}
                      size={110} outerR={42} innerR={26}
                      center={totalRecs} sub="registros"
                    />
                    <ChartLegend items={CATS.map(c => ({
                      label: c.label,
                      value: c.total,
                      color: c.color,
                      pct: totalRecs > 0 ? Math.round((c.total / totalRecs) * 100) : 0,
                    }))}/>
                  </div>
                </div>

                {/* Donut: completados vs pendientes */}
                <div className="flex flex-col items-center gap-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider self-start">Cumplimiento</p>
                  <div className="flex items-center gap-3">
                    <PieDonut
                      segments={[
                        { label: 'Cumplidos',  value: totalOk,             color: '#10b981' },
                        { label: 'Pendientes', value: totalRecs - totalOk, color: '#e2e8f0' },
                      ]}
                      size={110} outerR={42} innerR={26}
                      center={`${pctGlobal}%`} sub="global"
                    />
                    <ChartLegend items={[
                      { label: 'Cumplidos',  value: totalOk,             color: '#10b981' },
                      { label: 'Pendientes', value: totalRecs - totalOk, color: '#cbd5e1' },
                    ]}/>
                  </div>
                </div>

                {/* Barras comparativas */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Comparativa</p>
                  <VBarChart bars={CATS} chartHeight={100}/>
                </div>

              </div>
            </div>
          )
        })()}

        {/* Indicadores */}
        {!loading && stats && stats.indicadores > 0 && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-almera-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={13} className="text-almera-600"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-700">Indicadores de gestión</p>
                <span className="text-[10px] text-slate-400">{stats.indicadores} gestionados</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-almera-400 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (stats.indicadores / 10) * 100)}%` }}/>
              </div>
            </div>
            <button onClick={() => navigate('/gestion')}
              className="flex items-center gap-1 text-[11px] text-almera-600 hover:text-almera-800 font-semibold transition-colors group flex-shrink-0">
              Ver <ArrowRight size={10} className="group-hover:translate-x-0.5 transition-transform"/>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
