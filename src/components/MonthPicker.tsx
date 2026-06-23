import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { ChevronDown, Plus } from 'lucide-react'

const MESES = ['', 'Ene','Feb','Mar','Abr','May','Jun',
               'Jul','Ago','Sep','Oct','Nov','Dic']

export default function MonthPicker() {
  const { periodos, periodoActivo, setPeriodoActivo, agregarPeriodo } = useAppStore()
  const [open, setOpen] = useState(false)

  async function crearPeriodoHoy() {
    const hoy = new Date()
    const nuevo = await window.api.periodos.crear({
      anio: hoy.getFullYear(),
      mes: hoy.getMonth() + 1
    })
    agregarPeriodo(nuevo)
    setPeriodoActivo(nuevo)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                   bg-almera-50 hover:bg-almera-100 transition-colors text-sm"
      >
        <div className="text-left">
          <p className="text-[10px] text-almera-600 uppercase tracking-wider font-medium">Período activo</p>
          <p className="text-almera-800 font-semibold text-xs">
            {periodoActivo
              ? `${MESES[periodoActivo.mes]} ${periodoActivo.anio}`
              : 'Sin período'}
          </p>
        </div>
        <ChevronDown size={14} className="text-almera-500" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-slate-100 shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
          {periodos.map(p => (
            <button
              key={p.id}
              onClick={() => { setPeriodoActivo(p); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors
                ${periodoActivo?.id === p.id ? 'text-almera-700 font-medium bg-almera-50' : 'text-slate-700'}`}
            >
              {MESES[p.mes]} {p.anio}
              {p.estado === 'cerrado' && <span className="ml-2 text-slate-400">(cerrado)</span>}
            </button>
          ))}

          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={crearPeriodoHoy}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-almera-600 hover:bg-almera-50 transition-colors"
            >
              <Plus size={12} /> Nuevo período
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
