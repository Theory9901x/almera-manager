import { useAppStore } from '@/store/appStore'
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import type { Notificacion } from '@/types'

const TIPO_STYLE: Record<string, string> = {
  info:    'border-l-blue-400 bg-blue-50/30',
  alerta:  'border-l-yellow-400 bg-yellow-50/30',
  urgente: 'border-l-red-400 bg-red-50/30',
}
const TIPO_DOT: Record<string, string> = {
  info: 'bg-blue-400', alerta: 'bg-yellow-400', urgente: 'bg-red-400'
}

export default function Notificaciones() {
  const { notificaciones, setNotificaciones, marcarLeida } = useAppStore()

  async function marcar(id: number) {
    await window.api.notificaciones.marcarLeida(id)
    marcarLeida(id)
  }

  async function limpiar() {
    await window.api.notificaciones.limpiar()
    const fresh = await window.api.notificaciones.listar()
    setNotificaciones(fresh)
  }

  const sinLeer = notificaciones.filter(n => !n.leida).length

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-almera-500" />
          <span className="text-sm font-semibold text-slate-700">
            {sinLeer > 0 ? `${sinLeer} sin leer` : 'Todo al día'}
          </span>
        </div>
        {notificaciones.some(n => n.leida) && (
          <button onClick={limpiar} className="btn-secondary flex items-center gap-2 text-xs py-1.5">
            <Trash2 size={13} /> Limpiar leídas
          </button>
        )}
      </div>

      {notificaciones.length === 0 ? (
        <div className="card p-10 flex flex-col items-center gap-3 text-slate-400">
          <Bell size={32} className="opacity-30" />
          <p className="text-sm">Sin notificaciones</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notificaciones.map(n => (
            <div
              key={n.id}
              className={`card border-l-4 p-4 flex items-start gap-3 transition-opacity ${
                n.leida ? 'opacity-50' : ''
              } ${TIPO_STYLE[n.tipo] ?? ''}`}
            >
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${TIPO_DOT[n.tipo] ?? 'bg-slate-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">{n.titulo}</p>
                {n.cuerpo && <p className="text-xs text-slate-500 mt-0.5">{n.cuerpo}</p>}
                <p className="text-[10px] text-slate-400 mt-1">{n.creado_en?.split('T')[0]}</p>
              </div>
              {!n.leida && (
                <button onClick={() => marcar(n.id)}
                  className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-green-600 transition-colors flex-shrink-0"
                  title="Marcar como leída">
                  <CheckCheck size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
