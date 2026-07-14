import { useState } from 'react'
import { ClipboardCheck, Headphones, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/platform/auth/AuthContext'
import { Card, PageHeader } from '@/shared/ui'
import AlmeraWorkspace from '@/modules/almera/pages/AlmeraPage'
import AdherenceMatrixWorkspace from '@/modules/adherence/pages/AdherenceMatrixPage'

type SubTab = 'technical-assistances' | 'audits' | 'adherence-matrix'

// Cada pestaña acepta una o más claves de modulo equivalentes, porque distintos
// despliegues han seedeado el modulo de auditorías con nombres distintos ('audits' vs 'internal-audits').
const subTabDefs: [SubTab, string, typeof Headphones, string[]][] = [
  ['technical-assistances', 'Asistencias Técnicas', Headphones, ['technical-assistances']],
  ['audits', 'Auditorías', ShieldCheck, ['audits', 'internal-audits']],
  ['adherence-matrix', 'Matrices de Adherencia', ClipboardCheck, ['adherence-matrix']],
]

export default function GestionAlmeraWorkspace() {
  const { session } = useAuth()
  const availableKeys = new Set((session?.modules || []).map(module => module.key))
  const availableTabs = subTabDefs.filter(([, , , keys]) => keys.some(key => availableKeys.has(key)))
  const [tab, setTab] = useState<SubTab | undefined>(availableTabs[0]?.[0])
  const activeTab = availableTabs.some(([key]) => key === tab) ? tab : availableTabs[0]?.[0]

  if (!availableTabs.length) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader eyebrow="Gestión ALMERA" title="Gestión ALMERA" description="Ningún módulo operativo está habilitado para tu rol todavía. Pídele al administrador que te asigne acceso." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {availableTabs.length > 1 && (
        <nav className="almera-nav gestion-almera-nav" aria-label="Secciones de Gestión ALMERA">
          {availableTabs.map(([key, label, Icon]) => (
            <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setTab(key)}>
              <Icon size={17} /><span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {activeTab === 'technical-assistances' && <AlmeraWorkspace />}
      {activeTab === 'adherence-matrix' && <AdherenceMatrixWorkspace />}
      {activeTab === 'audits' && <AuditsPlaceholder />}
    </div>
  )
}

function AuditsPlaceholder() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Auditorías Internas" title="Auditorías Internas" description="Planeación, ejecución, hallazgos e informes de auditoría interna." />
      <Card className="p-8 text-center">
        <ShieldCheck size={32} className="mx-auto text-[var(--muted)]" />
        <h2 className="mt-3 text-lg font-black">En construcción</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Este módulo todavía no tiene un flujo propio construido. Próximamente: planes de auditoría, ejecución de listas de chequeo, hallazgos e informes.</p>
      </Card>
    </div>
  )
}
