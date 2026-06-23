import { useState } from 'react'
import TareasAsistencias from './TareasAsistencias'
import Capacitaciones    from './Capacitaciones'
import TablaIndicadores  from './TablaIndicadores'
import Auditorias        from '@/modules/auditorias/Auditorias'

const TABS = [
  { id: 'tareasasist',   label: 'Tareas y Asistencias' },
  { id: 'capacitaciones', label: 'Capacitaciones' },
  { id: 'indicadores',   label: 'Indicadores' },
  { id: 'auditorias',    label: 'Auditorías' },
]

export default function Gestion() {
  const [tab, setTab] = useState('tareasasist')

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tareasasist'    && <TareasAsistencias />}
      {tab === 'capacitaciones' && <Capacitaciones />}
      {tab === 'indicadores'    && <TablaIndicadores />}
      {tab === 'auditorias'     && <Auditorias />}
    </div>
  )
}
