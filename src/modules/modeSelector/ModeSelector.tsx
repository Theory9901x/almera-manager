import { useAppStore } from '@/store/appStore'
import { BarChart3, Shield, ArrowRight } from 'lucide-react'

export default function ModeSelector() {
  const { setAppMode } = useAppStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Blobs decorativos */}
      <div className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
           style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }}/>
      <div className="absolute bottom-[-80px] right-[-80px] w-80 h-80 rounded-full opacity-10 blur-3xl pointer-events-none"
           style={{ background: 'radial-gradient(circle, #0ea5e9, transparent)' }}/>

      <div className="text-center mb-12">
        <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-3">Salud Yopal</p>
        <h1 className="text-3xl font-black text-white tracking-tight">¿A cuál sistema ingresas?</h1>
        <p className="text-white/30 text-sm mt-2">Selecciona tu espacio de trabajo</p>
      </div>

      <div className="grid grid-cols-2 gap-6 w-full max-w-2xl">

        {/* ── Almera Manager ── */}
        <button
          onClick={() => setAppMode('almera')}
          className="group relative flex flex-col items-start gap-6 p-7 rounded-3xl border border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl text-left"
        >
          <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
               style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), transparent)' }}/>

          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 8px 32px #6366f133' }}>
            <BarChart3 size={26} className="text-white"/>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-white leading-tight">Almera Manager</h2>
            <p className="text-white/40 text-sm mt-1 leading-relaxed">Tu sistema personal de gestión de indicadores y calidad</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['Dashboard', 'Indicadores', 'Gestión', 'Informes'].map(t => (
                <span key={t} className="text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-medium">{t}</span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-indigo-400 text-sm font-semibold">
            Ingresar <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform"/>
          </div>
        </button>

        {/* ── GCI Calidad ── */}
        <button
          onClick={() => setAppMode('gci')}
          className="group relative flex flex-col items-start gap-6 p-7 rounded-3xl border border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl text-left"
        >
          <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
               style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)' }}/>

          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 8px 32px #10b98133' }}>
            <Shield size={26} className="text-white"/>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-white leading-tight">GCI · Calidad</h2>
            <p className="text-white/40 text-sm mt-1 leading-relaxed">Gestión de Calidad y Mejoramiento Institucional — equipo de calidad</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {['Tareas', 'Asistencias', 'Auditorías', 'Capacitaciones'].map(t => (
                <span key={t} className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">{t}</span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
            Ingresar <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform"/>
          </div>
        </button>
      </div>

      <p className="mt-12 text-white/15 text-xs">v2.0 · Salud Yopal</p>
    </div>
  )
}
