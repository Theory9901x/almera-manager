import { useState } from 'react'
import { useAppStore }  from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Calendar, Plus, ArrowLeft } from 'lucide-react'

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function MesSelector() {
  const { periodos, setPeriodoActivo, agregarPeriodo, appMode, setAppMode } = useAppStore()
  const { logout } = useAuthStore()
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes,  setMes]  = useState(hoy.getMonth() + 1)
  const [loading, setLoading] = useState(false)

  async function crearYEntrar() {
    setLoading(true)
    const p = await window.api.periodos.crear({ anio, mes })
    agregarPeriodo(p)
    setPeriodoActivo(p)
    setLoading(false)
  }

  async function entrar(p: any) {
    setPeriodoActivo(p)
  }

  function volver() {
    if (appMode === 'gci') logout()
    setAppMode(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-almera-50 to-slate-100 flex items-center justify-center p-6 relative">
      <button
        onClick={volver}
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-slate-700 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={16}/> Volver
      </button>

      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-almera-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Calendar size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Almera Manager</h1>
          <p className="text-slate-500 text-sm mt-1">Selecciona o crea el período de gestión</p>
        </div>

        {/* Crear nuevo período */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Nuevo período</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mes</label>
              <select className="input" value={mes} onChange={e => setMes(Number(e.target.value))}>
                {MESES.slice(1).map((m, i) => (
                  <option key={i+1} value={i+1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Año</label>
              <select className="input" value={anio} onChange={e => setAnio(Number(e.target.value))}>
                {[2023,2024,2025,2026,2027].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={crearYEntrar} disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2">
            {loading
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Plus size={16} /> Crear y entrar a {MESES[mes]} {anio}</>
            }
          </button>
        </div>

        {/* Períodos existentes */}
        {periodos.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Períodos existentes</h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {periodos.map(p => (
                <button key={p.id} onClick={() => entrar(p)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl
                             border border-slate-100 hover:border-almera-200 hover:bg-almera-50
                             transition-all text-left group">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-almera-700">
                    {MESES[p.mes]} {p.anio}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.estado === 'activo'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {p.estado}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}