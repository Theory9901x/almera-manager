import { useEffect, useState } from 'react'
import { useAppStore }   from '@/store/appStore'
import { useUserFilter } from '@/lib/useUserFilter'
import {
  CheckCircle2, Circle, ClipboardList, BookOpen, Activity,
  CheckSquare, Calendar, FileText, Filter,
  BarChart3, User, Check, ShieldAlert, Tag,
} from 'lucide-react'
import { PieDonut, VBarChart, ChartLegend, HBarChart } from '@/components/Charts'

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const SES_LABEL: Record<string, string> = {
  completado: 'Completada', pendiente: 'Pendiente', falta_sesion: 'Falta sesión',
}

// ─── SVG Donut ────────────────────────────────────────────────────────────────
function Donut({ pct, color, size = 56, stroke = 6 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${c}`} strokeDashoffset={`${c - (pct/100)*c}`} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)' }}/>
    </svg>
  )
}


function StatCard({ label, ok, total, hexColor, icon: Icon }: {
  label: string; ok: number; total: number; hexColor: string; icon: any
}) {
  const pct = total > 0 ? Math.round((ok / total) * 100) : 0
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="relative flex-shrink-0">
        <Donut pct={pct} color={hexColor} size={52} stroke={5}/>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-black" style={{ color: hexColor }}>{pct}%</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon size={12} style={{ color: hexColor }}/>
          <span className="text-xs font-semibold text-slate-600">{label}</span>
        </div>
        <p className="text-xl font-black text-slate-800">{ok}<span className="text-sm font-normal text-slate-400">/{total}</span></p>
        <p className="text-[10px] text-slate-400">{total - ok} pendientes</p>
      </div>
    </div>
  )
}

const prioCls = (p: string) =>
  p === 'alta'  ? 'bg-red-50 text-red-600 border-red-200' :
  p === 'media' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                  'bg-slate-50 text-slate-500 border-slate-200'

// ─── Checkbox item ────────────────────────────────────────────────────────────
function CheckItem({ checked, onChange, label, color }: { checked: boolean; onChange: () => void; label: string; color: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
      <div onClick={onChange}
        className={`w-4 h-4 rounded flex items-center justify-center border-2 flex-shrink-0 transition-all ${
          checked ? 'border-transparent' : 'border-slate-300 bg-white group-hover:border-slate-400'
        }`}
        style={checked ? { backgroundColor: color, borderColor: color } : {}}>
        {checked && <Check size={10} className="text-white"/>}
      </div>
      <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">{label}</span>
    </label>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Consulta() {
  const { periodos }                           = useAppStore()
  const { filterByUser, createUid, filterKey } = useUserFilter()

  const [selectedId,    setSelectedId]    = useState<number | null>(null)
  const [raw,           setRaw]           = useState<any>(null)
  const [loading,       setLoading]       = useState(false)
  const [loadingPDF,    setLoadingPDF]    = useState(false)
  const [msgPDF,        setMsgPDF]        = useState('')

  // Filtros
  const [desde,         setDesde]         = useState('')
  const [hasta,         setHasta]         = useState('')
  const [tiposAct,      setTiposAct]      = useState({ asistencias: true, tareas: true, capacitaciones: true, indicadores: true, auditorias: true })
  const [estadoFiltro,  setEstadoFiltro]  = useState<'todos' | 'completadas' | 'pendientes'>('todos')

  useEffect(() => {
    if (periodos.length > 0 && !selectedId) setSelectedId(periodos[0].id)
  }, [periodos])

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    Promise.all([
      window.api.asistencias.listar(selectedId),
      window.api.capacitaciones.listar(selectedId),
      window.api.indicadores.listar(selectedId),
      window.api.tareas.listar(selectedId),
      window.api.auditorias.listar(selectedId),
      window.api.periodos.stats(selectedId, createUid),
    ]).then(([asistencias, capacitaciones, indicadores, tareas, auditorias, stats]) => {
      setRaw({
        asistencias:    filterByUser(asistencias),
        capacitaciones: filterByUser(capacitaciones),
        indicadores:    filterByUser(indicadores),
        tareas:         filterByUser(tareas),
        auditorias:     filterByUser(auditorias),
        stats,
      })
      setLoading(false)
    })
  }, [selectedId, filterKey])

  // ── Filtrado ────────────────────────────────────────────────────────────────
  function inRange(fecha: string | undefined | null) {
    if (!fecha) return true
    if (desde && fecha < desde) return false
    if (hasta && fecha > hasta) return false
    return true
  }

  const isAsisDone  = (a: any) => !!a.cumplido
  const isTareaDone = (t: any) => t.estado === 'completada'
  const isCapDone   = (c: any) => c.sesion1 === 'completado' && c.sesion2 === 'completado' && c.sesion3 === 'completado'
  const isIndDone   = (i: any) => i.estado === 'al_dia'
  const isAudDone   = (a: any) => a.estado === 'cerrada'

  function applyEstado(arr: any[], doneFn: (x: any) => boolean) {
    if (estadoFiltro === 'completadas') return arr.filter(doneFn)
    if (estadoFiltro === 'pendientes')  return arr.filter(x => !doneFn(x))
    return arr
  }

  const asistencias    = applyEstado((raw?.asistencias    ?? []).filter((a: any) => inRange(a.fecha)),      isAsisDone)
  const tareas         = applyEstado((raw?.tareas         ?? []).filter((t: any) => inRange(t.fecha_limite) || !t.fecha_limite), isTareaDone)
  const capacitaciones = applyEstado((raw?.capacitaciones ?? []).filter((c: any) => inRange(c.fecha)),      isCapDone)
  const indicadores    = applyEstado((raw?.indicadores    ?? []),                                            isIndDone)
  const auditorias     = applyEstado((raw?.auditorias     ?? []).filter((a: any) => inRange(a.fecha)),      isAudDone)

  const asisOk = asistencias.filter((a: any)   => a.cumplido).length
  const tarOk  = tareas.filter((t: any)         => t.estado === 'completada').length
  const capOk  = capacitaciones.filter((c: any) => isCapDone(c)).length
  const indOk  = indicadores.filter((i: any)    => i.estado === 'al_dia').length
  const audOk  = auditorias.filter((a: any)     => a.estado === 'cerrada').length

  const TIPO_AUD_LABEL: Record<string,string> = { interna: 'Interna', externa: 'Externa', seguimiento: 'Seguimiento' }
  const tipAudCls = (t: string) =>
    t === 'interna'     ? 'bg-blue-50 text-blue-700 border-blue-200' :
    t === 'externa'     ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          'bg-violet-50 text-violet-700 border-violet-200'
  const estAudCls = (e: string) =>
    e === 'cerrada'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    e === 'en_proceso' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                         'bg-red-50 text-red-600 border-red-200'
  const estAudLabel: Record<string,string> = { abierta: 'Abierta', en_proceso: 'En proceso', cerrada: 'Cerrada' }

  const periodo      = periodos.find(p => p.id === selectedId)
  const totalFiltrado = (tiposAct.asistencias ? asistencias.length : 0) +
                        (tiposAct.tareas ? tareas.length : 0) +
                        (tiposAct.capacitaciones ? capacitaciones.length : 0) +
                        (tiposAct.indicadores ? indicadores.length : 0) +
                        (tiposAct.auditorias ? auditorias.length : 0)

  function limpiarFiltros() { setDesde(''); setHasta(''); setEstadoFiltro('todos') }
  function toggleTipo(k: keyof typeof tiposAct) { setTiposAct(f => ({ ...f, [k]: !f[k] })) }

  async function generarPDF() {
    if (!selectedId || !periodo) return
    setLoadingPDF(true); setMsgPDF('')
    try {
      const res = await (window.api as any).consulta.generarPDF({
        periodo, desde, hasta,
        tipos: Object.entries(tiposAct).filter(([,v]) => v).map(([k]) => k),
        asistencias:    tiposAct.asistencias    ? asistencias    : [],
        tareas:         tiposAct.tareas         ? tareas         : [],
        capacitaciones: tiposAct.capacitaciones ? capacitaciones : [],
        indicadores:    tiposAct.indicadores    ? indicadores    : [],
        auditorias:     tiposAct.auditorias     ? auditorias     : [],
      })
      setMsgPDF(res.ok ? `PDF guardado: ${res.ruta ?? 'correctamente'}` : `Error: ${res.error ?? 'No se pudo generar'}`)
    } catch (e: any) { setMsgPDF(`Error: ${e?.message ?? e}`) }
    setLoadingPDF(false)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── PANEL DE FILTROS ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Filter size={15} className="text-almera-500"/>
          <h2 className="text-sm font-bold text-slate-700">Filtros de consulta</h2>
          {(desde || hasta || estadoFiltro !== 'todos') && (
            <button onClick={limpiarFiltros}
              className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors underline underline-offset-2">
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-5">
          {/* Col izquierda */}
          <div className="space-y-4">
            {/* Período */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Período</label>
              <select className="input text-sm" value={selectedId ?? ''}
                onChange={e => setSelectedId(Number(e.target.value))}>
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>
                    {MESES[p.mes]} {p.anio}{p.estado === 'cerrado' ? ' (cerrado)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Rango de fechas */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Rango de fechas</label>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input type="date" className="input pl-8 text-sm" placeholder="Desde"
                    value={desde} onChange={e => setDesde(e.target.value)}/>
                </div>
                <div className="relative">
                  <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input type="date" className="input pl-8 text-sm" placeholder="Hasta"
                    value={hasta} onChange={e => setHasta(e.target.value)}/>
                </div>
              </div>
            </div>
          </div>

          {/* Col derecha */}
          <div className="space-y-4">
            {/* Incluir en consulta — checkboxes */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Incluir en consulta</label>
              <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                <CheckItem checked={tiposAct.asistencias}    onChange={() => toggleTipo('asistencias')}    label="Asistencias técnicas" color="#3b82f6"/>
                <CheckItem checked={tiposAct.tareas}         onChange={() => toggleTipo('tareas')}         label="Tareas"               color="#10b981"/>
                <CheckItem checked={tiposAct.capacitaciones} onChange={() => toggleTipo('capacitaciones')} label="Capacitaciones"       color="#8b5cf6"/>
                <CheckItem checked={tiposAct.indicadores}    onChange={() => toggleTipo('indicadores')}    label="Indicadores"          color="#f59e0b"/>
                <CheckItem checked={tiposAct.auditorias}     onChange={() => toggleTipo('auditorias')}     label="Auditorías"           color="#ef4444"/>
              </div>
            </div>

            {/* Estado — select */}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">Estado</label>
              <select className="input text-sm" value={estadoFiltro}
                onChange={e => setEstadoFiltro(e.target.value as any)}>
                <option value="todos">Todos los registros</option>
                <option value="completadas">Solo completadas</option>
                <option value="pendientes">Solo pendientes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer: resumen + PDF */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center gap-4">
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{totalFiltrado}</span> registros en la selección
            {estadoFiltro !== 'todos' && <span className="ml-2 text-almera-600 font-medium">· Solo {estadoFiltro}</span>}
            {(desde || hasta) && <span className="ml-2 text-blue-500 font-medium">· Con rango de fecha</span>}
          </p>
          <button onClick={generarPDF} disabled={loadingPDF || !selectedId}
            className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-sm font-semibold transition-all shadow-sm shadow-red-200 disabled:opacity-50">
            {loadingPDF
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Generando...</>
              : <><FileText size={14}/> Generar PDF</>}
          </button>
        </div>
        {msgPDF && (
          <div className={`mx-5 mb-4 px-4 py-2.5 rounded-xl text-xs font-medium border ${
            msgPDF.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
          }`}>{msgPDF}</div>
        )}
      </div>

      {loading && (
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="bg-white rounded-2xl border border-slate-100 h-24 animate-pulse"/>)}
        </div>
      )}

      {raw && !loading && (
        <>
          {/* ── TARJETAS STAT ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-3">
            {tiposAct.asistencias    && <StatCard label="Asistencias"    ok={asisOk} total={asistencias.length}    hexColor="#3b82f6" icon={ClipboardList}/>}
            {tiposAct.tareas         && <StatCard label="Tareas"         ok={tarOk}  total={tareas.length}          hexColor="#10b981" icon={CheckSquare}/>}
            {tiposAct.capacitaciones && <StatCard label="Capacitaciones" ok={capOk}  total={capacitaciones.length}  hexColor="#8b5cf6" icon={BookOpen}/>}
            {tiposAct.indicadores    && <StatCard label="Indicadores"    ok={indOk}  total={indicadores.length}     hexColor="#f59e0b" icon={Activity}/>}
            {tiposAct.auditorias     && <StatCard label="Auditorías"     ok={audOk}  total={auditorias.length}      hexColor="#ef4444" icon={ShieldAlert}/>}
          </div>

          {/* ── GRÁFICOS ───────────────────────────────────────────────────── */}
          {(() => {
            const CATS = [
              tiposAct.asistencias    && { label: 'Asistencias',    ok: asisOk, total: asistencias.length,    color: '#3b82f6' },
              tiposAct.tareas         && { label: 'Tareas',         ok: tarOk,  total: tareas.length,          color: '#10b981' },
              tiposAct.capacitaciones && { label: 'Capacitaciones', ok: capOk,  total: capacitaciones.length,  color: '#8b5cf6' },
              tiposAct.indicadores    && { label: 'Indicadores',    ok: indOk,  total: indicadores.length,     color: '#f59e0b' },
              tiposAct.auditorias     && { label: 'Auditorías',     ok: audOk,  total: auditorias.length,      color: '#ef4444' },
            ].filter(Boolean) as { label: string; ok: number; total: number; color: string }[]

            const totalRecs = CATS.reduce((s, c) => s + c.total, 0)
            const totalOk   = CATS.reduce((s, c) => s + c.ok,    0)
            const pctGlobal = totalRecs > 0 ? Math.round((totalOk / totalRecs) * 100) : 0

            return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 size={14} className="text-almera-500"/>
                  <h3 className="text-sm font-bold text-slate-700">Visualización gráfica</h3>
                  <span className="ml-auto text-[10px] text-slate-400">{totalRecs} registros · {totalOk} cumplidos</span>
                </div>

                <div className="grid grid-cols-3 gap-6">

                  {/* Donut: distribución por tipo */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Distribución por tipo</p>
                    <div className="flex items-center gap-4">
                      <PieDonut
                        segments={CATS.map(c => ({ label: c.label, value: c.total, color: c.color }))}
                        size={120} outerR={46} innerR={28}
                        center={totalRecs} sub="registros"
                      />
                      <ChartLegend items={CATS.map(c => ({
                        label: c.label,
                        value: c.total,
                        color: c.color,
                        pct: totalRecs > 0 ? Math.round((c.total / totalRecs) * 100) : 0,
                        sub: `${c.ok} cumplidos`,
                      }))}/>
                    </div>
                  </div>

                  {/* Donut: estado general */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Estado general</p>
                    <div className="flex items-center gap-4">
                      <PieDonut
                        segments={[
                          { label: 'Cumplidos',  value: totalOk,             color: '#10b981' },
                          { label: 'Pendientes', value: totalRecs - totalOk, color: '#e2e8f0' },
                        ]}
                        size={120} outerR={46} innerR={28}
                        center={`${pctGlobal}%`} sub="cumplimiento"
                      />
                      <ChartLegend items={[
                        { label: 'Cumplidos',  value: totalOk,             color: '#10b981', pct: pctGlobal },
                        { label: 'Pendientes', value: totalRecs - totalOk, color: '#cbd5e1', pct: 100 - pctGlobal },
                      ]}/>
                    </div>
                  </div>

                  {/* Barras de cumplimiento por categoría */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Cumplimiento por tipo</p>
                    <VBarChart bars={CATS} chartHeight={110}/>
                  </div>

                </div>

                {/* Barra horizontal detallada */}
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Detalle de adherencia</p>
                  <HBarChart bars={CATS}/>
                </div>
              </div>
            )
          })()}

          {/* ── DETALLE ────────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* ASISTENCIAS */}
            {tiposAct.asistencias && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-blue-50/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><ClipboardList size={13} className="text-blue-600"/></div>
                    <h3 className="text-sm font-bold text-slate-800">Asistencias técnicas</h3>
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{asistencias.length}</span>
                  </div>
                  <span className="text-xs text-slate-500">{asisOk} cumplidas · {asistencias.length - asisOk} pendientes</span>
                </div>
                {asistencias.length === 0
                  ? <p className="text-center text-slate-400 text-sm py-8">Sin asistencias en el rango seleccionado</p>
                  : <div className="divide-y divide-slate-50">
                    {asistencias.map((a: any, i: number) => (
                      <div key={a.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/40 transition-colors">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5 flex-shrink-0">{i+1}</span>
                        <div className="mt-0.5 flex-shrink-0">
                          {a.cumplido ? <CheckCircle2 size={15} className="text-blue-500"/> : <Circle size={15} className="text-slate-300"/>}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{a.proceso}</span>
                            {a.gestion && <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-full font-medium">{a.gestion}</span>}
                          </div>
                          <p className="text-sm font-medium text-slate-700">{a.que_se_hizo}</p>
                          {a.como_se_hizo && <p className="text-xs text-slate-500">{a.como_se_hizo}</p>}
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1"><User size={10}/>{a.persona}</span>
                            <span className="flex items-center gap-1"><Calendar size={10}/>{a.fecha}</span>
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 mt-0.5 ${
                          a.cumplido ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>{a.cumplido ? 'Cumplido' : 'Pendiente'}</span>
                      </div>
                    ))}
                  </div>
                }
              </section>
            )}

            {/* TAREAS */}
            {tiposAct.tareas && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center"><CheckSquare size={13} className="text-emerald-600"/></div>
                    <h3 className="text-sm font-bold text-slate-800">Tareas</h3>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{tareas.length}</span>
                  </div>
                  <span className="text-xs text-slate-500">{tarOk} completadas · {tareas.length - tarOk} pendientes</span>
                </div>
                {tareas.length === 0
                  ? <p className="text-center text-slate-400 text-sm py-8">Sin tareas en el rango seleccionado</p>
                  : <div className="divide-y divide-slate-50">
                    {tareas.map((t: any, i: number) => {
                      const isComp = t.estado === 'completada'
                      return (
                        <div key={t.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/40 transition-colors">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5 flex-shrink-0">{i+1}</span>
                          <div className="mt-0.5 flex-shrink-0">
                            {isComp ? <CheckCircle2 size={15} className="text-emerald-500"/> : <Circle size={15} className="text-slate-300"/>}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm font-semibold text-slate-800">{t.titulo}</p>
                            {t.descripcion && <p className="text-xs text-slate-500">{t.descripcion}</p>}
                            <div className="flex items-center gap-3 flex-wrap">
                              {t.fecha_limite && <span className="flex items-center gap-1 text-[10px] text-slate-400"><Calendar size={9}/>{t.fecha_limite}</span>}
                              {isComp && t.completada_en && <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium"><Check size={9}/>Completada {t.completada_en.split(' ')[0]}</span>}
                              {t.notas_cierre && <span className="text-[10px] text-slate-400 italic">"{t.notas_cierre}"</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${prioCls(t.prioridad ?? 'baja')}`}>{t.prioridad ?? 'baja'}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${isComp ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              {isComp ? 'Completada' : 'Pendiente'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                }
              </section>
            )}

            {/* CAPACITACIONES */}
            {tiposAct.capacitaciones && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-violet-50/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center"><BookOpen size={13} className="text-violet-600"/></div>
                    <h3 className="text-sm font-bold text-slate-800">Capacitaciones</h3>
                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">{capacitaciones.length}</span>
                  </div>
                  <span className="text-xs text-slate-500">{capOk} completas (3/3 sesiones)</span>
                </div>
                {capacitaciones.length === 0
                  ? <p className="text-center text-slate-400 text-sm py-8">Sin capacitaciones en el rango seleccionado</p>
                  : <div className="divide-y divide-slate-50">
                    {capacitaciones.map((c: any, i: number) => {
                      const sesiones = [c.sesion1, c.sesion2, c.sesion3]
                      const compSes  = sesiones.filter((s: string) => s === 'completado').length
                      const pct      = Math.round((compSes / 3) * 100)
                      const completa = compSes === 3
                      return (
                        <div key={c.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/40 transition-colors">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5 flex-shrink-0">{i+1}</span>
                          <div className="mt-0.5 flex-shrink-0">
                            {completa ? <CheckCircle2 size={15} className="text-violet-500"/> : <Circle size={15} className="text-slate-300"/>}
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{c.titulo}</p>
                              {c.descripcion && <p className="text-xs text-slate-500 mt-0.5">{c.descripcion}</p>}
                              <span className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5"><Calendar size={9}/>{c.fecha}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {sesiones.map((s: string, si: number) => (
                                <span key={si} className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                                  s === 'completado'   ? 'bg-violet-50 text-violet-700 border-violet-200' :
                                  s === 'falta_sesion' ? 'bg-red-50 text-red-600 border-red-200' :
                                                         'bg-slate-50 text-slate-400 border-slate-200'
                                }`}>S{si+1}: {SES_LABEL[s] ?? s}</span>
                              ))}
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-20">
                                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }}/>
                              </div>
                              <span className="text-xs font-bold text-violet-700">{pct}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                }
              </section>
            )}

            {/* INDICADORES */}
            {tiposAct.indicadores && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-amber-50/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center"><Activity size={13} className="text-amber-600"/></div>
                    <h3 className="text-sm font-bold text-slate-800">Indicadores</h3>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{indicadores.length}</span>
                  </div>
                  <span className="text-xs text-slate-500">{indOk} al día</span>
                </div>
                {indicadores.length === 0
                  ? <p className="text-center text-slate-400 text-sm py-8">Sin indicadores registrados</p>
                  : <div className="divide-y divide-slate-50">
                    {indicadores.map((ind: any, i: number) => (
                      <div key={ind.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/40 transition-colors">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5 flex-shrink-0">{i+1}</span>
                        <div className="mt-0.5 flex-shrink-0">
                          {ind.estado === 'al_dia' ? <CheckCircle2 size={15} className="text-amber-500"/> : <Circle size={15} className="text-slate-300"/>}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-slate-800">{ind.nombre}</p>
                          {ind.codigo && <p className="text-[10px] text-slate-400 font-mono">{ind.codigo}</p>}
                          <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                            {ind.meta      && <span><span className="font-semibold">Meta:</span> {ind.meta}</span>}
                            {ind.resultado && <span><span className="font-semibold">Resultado:</span> {ind.resultado}</span>}
                          </div>
                          {ind.observaciones && <p className="text-xs text-slate-400 italic">{ind.observaciones}</p>}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 mt-0.5 ${
                          ind.estado === 'al_dia'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          ind.estado === 'en_riesgo' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                                       'bg-red-50 text-red-600 border-red-200'
                        }`}>{ind.estado?.replace('_',' ')}</span>
                      </div>
                    ))}
                  </div>
                }
              </section>
            )}

            {/* AUDITORÍAS */}
            {tiposAct.auditorias && (
              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-red-50/40">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center"><ShieldAlert size={13} className="text-red-600"/></div>
                    <h3 className="text-sm font-bold text-slate-800">Auditorías</h3>
                    <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">{auditorias.length}</span>
                  </div>
                  <span className="text-xs text-slate-500">{audOk} cerradas · {auditorias.length - audOk} abiertas</span>
                </div>
                {auditorias.length === 0
                  ? <p className="text-center text-slate-400 text-sm py-8">Sin auditorías en el rango seleccionado</p>
                  : <div className="divide-y divide-slate-50">
                    {auditorias.map((a: any, i: number) => (
                      <div key={a.id} className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/40 transition-colors">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[10px] font-bold flex items-center justify-center mt-0.5 flex-shrink-0">{i+1}</span>
                        <div className="mt-0.5 flex-shrink-0">
                          {isAudDone(a) ? <CheckCircle2 size={15} className="text-red-500"/> : <Circle size={15} className="text-slate-300"/>}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-slate-800">{a.hallazgo}</p>
                          {a.descripcion && <p className="text-xs text-slate-500">{a.descripcion}</p>}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${tipAudCls(a.tipo)}`}>
                              {TIPO_AUD_LABEL[a.tipo] ?? a.tipo}
                            </span>
                            {a.subproceso && (
                              <span className="flex items-center gap-1 text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                                <Tag size={8}/>{a.subproceso}
                              </span>
                            )}
                            {a.responsable && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <User size={9}/>{a.responsable}
                              </span>
                            )}
                            {a.fecha && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Calendar size={9}/>{a.fecha}
                              </span>
                            )}
                            {a.fecha_cierre && (
                              <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
                                <Check size={9}/>Cerrada {a.fecha_cierre}
                              </span>
                            )}
                          </div>
                          {a.accion && <p className="text-xs text-slate-400 italic">Acción: {a.accion}</p>}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 mt-0.5 ${estAudCls(a.estado)}`}>
                          {estAudLabel[a.estado] ?? a.estado}
                        </span>
                      </div>
                    ))}
                  </div>
                }
              </section>
            )}

          </div>
        </>
      )}
    </div>
  )
}
